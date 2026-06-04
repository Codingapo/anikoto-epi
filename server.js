import express from "express";
import axios from "axios";
import * as cheerio from "cheerio";
import cors from "cors";

const app = express();

const PORT = process.env.PORT || 4000;

const ANIKOTO_BASE = "https://anikototv.to";

// Change this to your wrapper domain.
const EMBED_BASE = process.env.EMBED_BASE || "https://supaplay.fun";

// Use "megaplay" if you still want old URLs.
// Example:
// EMBED_BASE=https://megaplay.buzz npm start

app.set("trust proxy", true);

app.use(cors());
app.use(express.json());

function jsonResponse(res, data, status = 200) {
    return res.status(status).json({
        success: true,
        data
    });
}

function jsonError(res, message, status = 500, extra = {}) {
    return res.status(status).json({
        success: false,
        message,
        ...extra
    });
}

function cleanText(value) {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim();
}

function decodeHtml(value) {
    if (!value) return "";

    return String(value)
        .replace(/&amp;/g, "&")
        .replace(/&#38;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#34;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
}

function safeSlug(value) {
    return String(value || "")
        .trim()
        .replace(/^\/+|\/+$/g, "")
        .replace(/^watch\//, "")
        .replace(/\/ep-\d+.*$/, "")
        .replace(/[^a-zA-Z0-9_-]/g, "");
}

function nowMysqlDate() {
    const d = new Date();

    const pad = (n) => String(n).padStart(2, "0");

    return [
        d.getFullYear(),
        "-",
        pad(d.getMonth() + 1),
        "-",
        pad(d.getDate()),
        " ",
        pad(d.getHours()),
        ":",
        pad(d.getMinutes()),
        ":",
        pad(d.getSeconds())
    ].join("");
}

function buildEmbedUrl(embedId, language) {
    return `${EMBED_BASE}/stream/s-2/${encodeURIComponent(embedId)}/${encodeURIComponent(language)}`;
}

function createAxiosClient() {
    return axios.create({
        timeout: 20000,
        headers: {
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
            "Accept":
                "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": `${ANIKOTO_BASE}/`,
            "Origin": ANIKOTO_BASE,
            "X-Requested-With": "XMLHttpRequest"
        },
        validateStatus: (status) => status >= 200 && status < 500
    });
}

const http = createAxiosClient();

async function fetchText(url, headers = {}) {
    const response = await http.get(url, {
        headers
    });

    if (response.status < 200 || response.status >= 300) {
        throw new Error(`Request failed ${response.status}: ${url}`);
    }

    return typeof response.data === "string"
        ? response.data
        : JSON.stringify(response.data);
}

async function fetchJson(url, headers = {}) {
    const response = await http.get(url, {
        headers: {
            ...headers,
            "Accept": "application/json,text/plain,*/*"
        }
    });

    if (response.status < 200 || response.status >= 300) {
        throw new Error(`Request failed ${response.status}: ${url}`);
    }

    return response.data;
}

function extractShowInfoFromWatchHtml(html, slug) {
    const $ = cheerio.load(html);

    const watchMain = $("#watch-main");

    const showId =
        watchMain.attr("data-id") ||
        $('[data-id]').first().attr("data-id") ||
        "";

    const title =
        cleanText($("h1.title").first().text()) ||
        cleanText($("h1").first().text()) ||
        slug;

    const jpTitle =
        cleanText($("h1.title").first().attr("data-jp")) ||
        title;

    const poster =
        $(".binfo .poster img").first().attr("src") ||
        $("meta[property='og:image']").attr("content") ||
        "";

    const totalEpisodesText =
        $(".bmeta .meta div")
            .filter((_, el) => cleanText($(el).text()).toLowerCase().startsWith("episodes:"))
            .first()
            .text();

    const totalEpisodesMatch = cleanText(totalEpisodesText).match(/episodes:\s*([0-9]+)/i);

    return {
        showId: cleanText(showId),
        title,
        jp_title: jpTitle,
        poster,
        total_episodes: totalEpisodesMatch ? Number(totalEpisodesMatch[1]) : null
    };
}

function normalizeEpisodeFromElement($, el, index) {
    const node = $(el);

    const numberRaw =
        node.attr("data-num") ||
        node.attr("data-number") ||
        node.attr("data-slug") ||
        node.find(".num").first().text() ||
        node.text().match(/episode\s*([0-9.]+)/i)?.[1] ||
        "";

    const numberMatch = String(numberRaw).match(/[0-9.]+/);
    const number = numberMatch ? Number(numberMatch[0]) : index + 1;

    const title =
        cleanText(node.find(".name").first().text()) ||
        cleanText(node.find(".ep-name").first().text()) ||
        cleanText(node.find("span").last().text()) ||
        cleanText(node.attr("title")) ||
        `Episode ${number}`;

    const ids =
        node.attr("data-ids") ||
        node.attr("data-server-ids") ||
        node.attr("data-servers") ||
        "";

    const internalId =
        node.attr("data-id") ||
        node.attr("data-episode-id") ||
        node.attr("data-ep-id") ||
        node.attr("id") ||
        "";

    const href = node.attr("href") || "";

    return {
        id: internalId ? Number(String(internalId).replace(/\D/g, "")) || internalId : index + 1,
        internal_episode_id: cleanText(internalId),
        server_ids: cleanText(ids),
        title: decodeHtml(title),
        jp_title: decodeHtml(title),
        number,
        href
    };
}

function parseEpisodesFromHtml(html) {
    const $ = cheerio.load(html);

    const selectors = [
        "#w-episodes a[data-num]",
        "#w-episodes a[data-id]",
        ".episodes a[data-num]",
        ".episodes a[data-id]",
        "a[data-num][data-ids]",
        "a[data-num]"
    ];

    let elements = [];

    for (const selector of selectors) {
        const found = $(selector).toArray();

        if (found.length > elements.length) {
            elements = found;
        }
    }

    const episodes = elements
        .map((el, index) => normalizeEpisodeFromElement($, el, index))
        .filter((ep) => ep.number);

    const seen = new Set();

    return episodes.filter((ep) => {
        const key = String(ep.number);

        if (seen.has(key)) {
            return false;
        }

        seen.add(key);
        return true;
    });
}

async function fetchEpisodeListByShowId(showId, watchUrl) {
    const candidateUrls = [
        `${ANIKOTO_BASE}/ajax/episode/list/${encodeURIComponent(showId)}`,
        `${ANIKOTO_BASE}/ajax/v2/episode/list/${encodeURIComponent(showId)}`,
        `${ANIKOTO_BASE}/ajax/episodes/list/${encodeURIComponent(showId)}`,
        `${ANIKOTO_BASE}/ajax/episodes/${encodeURIComponent(showId)}`,
        `${ANIKOTO_BASE}/ajax/episode/list?id=${encodeURIComponent(showId)}`,
        `${ANIKOTO_BASE}/ajax/episodes/list?show_id=${encodeURIComponent(showId)}`
    ];

    const errors = [];

    for (const url of candidateUrls) {
        try {
            const response = await http.get(url, {
                headers: {
                    "Referer": watchUrl,
                    "X-Requested-With": "XMLHttpRequest",
                    "Accept": "application/json,text/html,*/*"
                }
            });

            if (response.status < 200 || response.status >= 300) {
                errors.push(`${url} => HTTP ${response.status}`);
                continue;
            }

            const data = response.data;

            let html = "";

            if (typeof data === "string") {
                html = data;
            } else if (data?.html) {
                html = data.html;
            } else if (data?.result) {
                html = data.result;
            } else if (data?.data?.html) {
                html = data.data.html;
            } else if (Array.isArray(data?.episodes)) {
                return data.episodes.map((ep, index) => ({
                    id: ep.id || index + 1,
                    internal_episode_id: ep.id || "",
                    server_ids: ep.ids || ep.server_ids || "",
                    title: decodeHtml(ep.title || ep.name || `Episode ${ep.number || index + 1}`),
                    jp_title: decodeHtml(ep.jp_title || ep.jname || ep.title || ep.name || `Episode ${ep.number || index + 1}`),
                    number: Number(ep.number || ep.episode || index + 1),
                    href: ep.href || ""
                }));
            }

            const episodes = parseEpisodesFromHtml(html);

            if (episodes.length) {
                return episodes;
            }

            errors.push(`${url} => no episodes parsed`);
        } catch (error) {
            errors.push(`${url} => ${error.message}`);
        }
    }

    return {
        episodes: [],
        errors
    };
}

async function fetchEpisodePageFallback(slug, totalEpisodes) {
    const episodes = [];

    if (!totalEpisodes || totalEpisodes <= 0) {
        return episodes;
    }

    for (let i = 1; i <= totalEpisodes; i++) {
        const url = `${ANIKOTO_BASE}/watch/${encodeURIComponent(slug)}/ep-${i}`;

        try {
            const html = await fetchText(url, {
                "Referer": `${ANIKOTO_BASE}/watch/${encodeURIComponent(slug)}/ep-1`
            });

            const $ = cheerio.load(html);

            const title =
                cleanText($("title").text())
                    .replace(/^Watch\s+/i, "")
                    .replace(/\s+Online.*$/i, "") ||
                `Episode ${i}`;

            const watchMain = $("#watch-main");

            const serverIds =
                $("a[data-num]").first().attr("data-ids") ||
                $("[data-ids]").first().attr("data-ids") ||
                "";

            episodes.push({
                id: i,
                internal_episode_id: "",
                server_ids: cleanText(serverIds),
                title,
                jp_title: title,
                number: i,
                href: `/watch/${slug}/ep-${i}`
            });
        } catch {
            episodes.push({
                id: i,
                internal_episode_id: "",
                server_ids: "",
                title: `Episode ${i}`,
                jp_title: `Episode ${i}`,
                number: i,
                href: `/watch/${slug}/ep-${i}`
            });
        }
    }

    return episodes;
}

function parseServersFromHtml(html) {
    const $ = cheerio.load(html);

    const servers = [];

    $("li, .server, .server-item").each((_, el) => {
        const node = $(el);

        const linkId =
            node.attr("data-link-id") ||
            node.attr("data-id") ||
            node.attr("data-lid") ||
            "";

        const type =
            node.attr("data-type") ||
            node.closest(".type").attr("data-type") ||
            cleanText(node.closest(".type").find("label,.name").first().text()).toLowerCase() ||
            "";

        const name = cleanText(node.text());

        if (!linkId) {
            return;
        }

        servers.push({
            link_id: cleanText(linkId),
            type: cleanText(type),
            name
        });
    });

    return servers;
}

async function fetchServersByIds(serverIds, referer) {
    if (!serverIds) {
        return [];
    }

    const url = `${ANIKOTO_BASE}/ajax/server/list?servers=${encodeURIComponent(serverIds)}`;

    try {
        const data = await fetchJson(url, {
            "Referer": referer,
            "X-Requested-With": "XMLHttpRequest"
        });

        const html =
            typeof data === "string"
                ? data
                : data?.result || data?.html || data?.data?.html || "";

        return parseServersFromHtml(html);
    } catch {
        return [];
    }
}

async function resolveEmbedIdFromServer(server, referer) {
    if (!server?.link_id) {
        return "";
    }

    const url = `${ANIKOTO_BASE}/ajax/server?get=${encodeURIComponent(server.link_id)}`;

    try {
        const data = await fetchJson(url, {
            "Referer": referer,
            "X-Requested-With": "XMLHttpRequest"
        });

        const result = data?.result || data?.data || data;

        const embedUrl =
            typeof result === "string"
                ? result
                : result?.url || result?.link || "";

        if (!embedUrl) {
            return "";
        }

        /*
            This API does not extract m3u8 or decrypt anything.
            It only extracts the public embed ID when the resolved iframe URL is like:
            https://megaplay.buzz/stream/s-2/51322/sub
            or:
            https://megaplay.buzz/e-1/51322
        */

        const patterns = [
            /\/stream\/s-\d+\/([0-9]+)\/(?:sub|dub)/i,
            /\/e-\d+\/([0-9]+)/i,
            /[?&]id=([0-9]+)/i,
            /\/([0-9]{3,})(?:[/?#]|$)/i
        ];

        for (const pattern of patterns) {
            const match = embedUrl.match(pattern);

            if (match?.[1]) {
                return match[1];
            }
        }

        return "";
    } catch {
        return "";
    }
}

function pickBestServer(servers, preferredLanguage) {
    const lang = String(preferredLanguage || "").toLowerCase();

    const exact = servers.find((s) => {
        const haystack = `${s.type} ${s.name}`.toLowerCase();
        return haystack.includes(lang);
    });

    if (exact) {
        return exact;
    }

    const mega = servers.find((s) => /mega|vidstream|vidcloud|mycloud/i.test(`${s.name} ${s.type}`));

    if (mega) {
        return mega;
    }

    return servers[0] || null;
}

async function enrichEpisodeWithEmbedId(ep, slug) {
    const referer = `${ANIKOTO_BASE}/watch/${encodeURIComponent(slug)}/ep-${encodeURIComponent(ep.number)}`;

    let episodeEmbedId = "";

    if (ep.server_ids) {
        const servers = await fetchServersByIds(ep.server_ids, referer);

        const subServer = pickBestServer(servers, "sub");
        const dubServer = pickBestServer(servers, "dub");

        const subId = await resolveEmbedIdFromServer(subServer, referer);
        const dubId = await resolveEmbedIdFromServer(dubServer, referer);

        episodeEmbedId = subId || dubId || "";
    }

    /*
        Fallback:
        If server IDs are not available, this still returns a stable object,
        but episode_embed_id will be empty. You will see this clearly in JSON.
    */

    const embedUrl = episodeEmbedId
        ? {
            sub: buildEmbedUrl(episodeEmbedId, "sub"),
            dub: buildEmbedUrl(episodeEmbedId, "dub")
        }
        : {
            sub: null,
            dub: null
        };

    return {
        id: typeof ep.id === "number" ? ep.id : Number(String(ep.id).replace(/\D/g, "")) || ep.number,
        title: ep.title || `Episode ${ep.number}`,
        jp_title: ep.jp_title || ep.title || `Episode ${ep.number}`,
        number: ep.number,
        episode_embed_id: episodeEmbedId || null,
        embed_url: embedUrl,
        updated_at: nowMysqlDate()
    };
}

app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "SupaPlay Anikoto Episodes API",
        endpoints: {
            episodes: "/api/anikoto/episodes/:slug",
            example: "/api/anikoto/episodes/sakamoto-days-sfdxz"
        }
    });
});

app.get("/api/anikoto/episodes/:slug", async (req, res) => {
    const slug = safeSlug(req.params.slug);

    if (!slug) {
        return jsonError(res, "Missing or invalid slug", 400);
    }

    const watchUrl = `${ANIKOTO_BASE}/watch/${encodeURIComponent(slug)}/ep-1`;

    try {
        const html = await fetchText(watchUrl);

        const show = extractShowInfoFromWatchHtml(html, slug);

        if (!show.showId) {
            return jsonError(res, "Could not extract show ID from Anikoto watch page", 502, {
                source: watchUrl
            });
        }

        let episodeListResult = await fetchEpisodeListByShowId(show.showId, watchUrl);

        let episodes = Array.isArray(episodeListResult)
            ? episodeListResult
            : episodeListResult.episodes;

        const debugErrors = Array.isArray(episodeListResult?.errors)
            ? episodeListResult.errors
            : [];

        if (!episodes.length) {
            episodes = parseEpisodesFromHtml(html);
        }

        if (!episodes.length && show.total_episodes) {
            episodes = await fetchEpisodePageFallback(slug, show.total_episodes);
        }

        episodes = episodes
            .filter((ep) => ep && ep.number)
            .sort((a, b) => Number(a.number) - Number(b.number));

        if (!episodes.length) {
            return jsonError(res, "No episodes found", 404, {
                source: watchUrl,
                show,
                debug: debugErrors
            });
        }

        const enriched = [];

        /*
            Keep this sequential to avoid hammering the source site.
            If you want faster performance, use a queue with concurrency 2-3.
        */
        for (const ep of episodes) {
            enriched.push(await enrichEpisodeWithEmbedId(ep, slug));
        }

        return jsonResponse(res, {
            slug,
            source: watchUrl,
            show,
            total: enriched.length,
            episodes: enriched
        });
    } catch (error) {
        return jsonError(res, error.message || "Failed to fetch Anikoto episodes", 500, {
            source: watchUrl
        });
    }
});

app.listen(PORT, () => {
    console.log(`SupaPlay Anikoto Episodes API running on port ${PORT}`);
    console.log(`Example: http://localhost:${PORT}/api/anikoto/episodes/sakamoto-days-sfdxz`);
});
