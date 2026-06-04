import express from "express";
import cors from "cors";
import axios from "axios";
import * as cheerio from "cheerio";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.get("/", (req, res) => {
    return res.sendFile(path.join(__dirname, "index.html"));
});
const app = express();

const PORT = process.env.PORT || 4000;

const ANIKOTO_BASE = process.env.ANIKOTO_BASE || "https://anikototv.to";
const ANIKOTO_API_BASE = process.env.ANIKOTO_API_BASE || "https://anikotoapi.site";

const EMBED_BASE = process.env.EMBED_BASE || "https://supaplay.fun";
const WATCH_BASE = process.env.WATCH_BASE || "https://animapo.fun";

app.set("trust proxy", true);

app.use(cors());
app.use(express.json());

const http = axios.create({
    timeout: 15000,
    headers: {
        "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
        "Accept-Language": "en-US,en;q=0.9"
    },
    validateStatus: (status) => status >= 200 && status < 500
});

function sendOk(res, data, status = 200) {
    return res.status(status).json({
        success: true,
        data
    });
}

function sendError(res, message, status = 500, extra = {}) {
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

function safeSlug(value) {
    return String(value || "")
        .trim()
        .replace(/^\/+|\/+$/g, "")
        .replace(/^watch\//, "")
        .replace(/\/ep-\d+.*$/i, "")
        .replace(/[^a-zA-Z0-9_-]/g, "");
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

function replaceEmbedDomain(url) {
    if (!url) return null;

    return String(url)
        .replace(/^https?:\/\/megaplay\.buzz/i, EMBED_BASE)
        .replace(/^https?:\/\/www\.megaplay\.buzz/i, EMBED_BASE);
}

function buildEmbedUrl(embedId, lang) {
    if (!embedId) return null;

    return `${EMBED_BASE}/stream/s-2/${encodeURIComponent(embedId)}/${encodeURIComponent(lang)}`;
}

function buildWatchUrl(slug, episodeNumber) {
    return `${WATCH_BASE}/watch/${encodeURIComponent(slug)}?ep=${encodeURIComponent(episodeNumber)}`;
}

function normalizeApiEpisode(ep, slug) {
    const episodeEmbedId = ep.episode_embed_id
        ? String(ep.episode_embed_id)
        : null;

    const number = Number(ep.number || ep.episode || 0);

    const subUrl =
        replaceEmbedDomain(ep?.embed_url?.sub) ||
        buildEmbedUrl(episodeEmbedId, "sub");

    const dubUrl =
        replaceEmbedDomain(ep?.embed_url?.dub) ||
        buildEmbedUrl(episodeEmbedId, "dub");

    return {
        id: ep.id ?? null,
        title: decodeHtml(ep.title || `Episode ${number}`),
        jp_title: decodeHtml(ep.jp_title || ep.title || `Episode ${number}`),
        number,
        watch: buildWatchUrl(slug, number),
        episode_embed_id: episodeEmbedId,
        embed_url: {
            sub: subUrl,
            dub: dubUrl
        },
        updated_at: ep.updated_at || null
    };
}

function normalizeApiAnime(anime) {
    if (!anime) return null;

    return {
        ...anime,
        poster: anime.poster || null
    };
}

async function fetchWatchPage(slug) {
    const url = `${ANIKOTO_BASE}/watch/${encodeURIComponent(slug)}/ep-1`;

    const response = await http.get(url, {
        headers: {
            "Referer": `${ANIKOTO_BASE}/`
        }
    });

    if (response.status < 200 || response.status >= 300) {
        throw new Error(`Watch page failed with HTTP ${response.status}`);
    }

    return {
        url,
        html: response.data
    };
}

function extractSeriesIdFromWatchPage(html) {
    const $ = cheerio.load(html);

    const id =
        $("#watch-main").attr("data-id") ||
        $("[data-id]").first().attr("data-id") ||
        "";

    const title =
        cleanText($("h1.title").first().text()) ||
        cleanText($("meta[property='og:title']").attr("content")) ||
        "";

    const poster =
        $("meta[property='og:image']").attr("content") ||
        $(".binfo .poster img").first().attr("src") ||
        "";

    const numericId = Number(String(id).replace(/\D/g, ""));

    if (!numericId) {
        return null;
    }

    return {
        id: numericId,
        title,
        poster
    };
}

async function fetchSeriesFromAnikotoApi(seriesId) {
    const url = `${ANIKOTO_API_BASE}/series/${encodeURIComponent(seriesId)}`;

    const response = await http.get(url, {
        headers: {
            "Accept": "application/json"
        }
    });

    if (response.status < 200 || response.status >= 300) {
        throw new Error(`anikotoapi.site failed with HTTP ${response.status}`);
    }

    const json = response.data;

    if (!json || json.ok !== true || !json.data) {
        throw new Error("anikotoapi.site returned invalid data");
    }

    return json;
}

function normalizeSeriesApiResponse(apiJson, requestedSlug) {
    const anime = normalizeApiAnime(apiJson.data.anime);

    const slug = anime?.slug || requestedSlug;

    const episodes = Array.isArray(apiJson.data.episodes)
        ? apiJson.data.episodes.map((ep) => normalizeApiEpisode(ep, slug))
        : [];

    return {
        ok: true,
        source: "anikotoapi.site",
        anikoto_domains: apiJson.anikoto_domains || [],
        anime,
        episodes
    };
}

/*
    Fallback:
    This is only used if anikotoapi.site fails.

    It is lighter than the old version:
    - It uses the watch page metadata.
    - It creates basic episode rows from total episode count.
    - It does not try to resolve every server one by one unless you add that later.
*/
function fallbackFromWatchPage(html, slug, extracted) {
    const $ = cheerio.load(html);

    const title =
        cleanText($("h1.title").first().text()) ||
        extracted?.title ||
        slug;

    const jpTitle =
        cleanText($("h1.title").first().attr("data-jp")) ||
        title;

    const poster =
        $("meta[property='og:image']").attr("content") ||
        extracted?.poster ||
        null;

    const episodesText = $(".bmeta .meta div")
        .filter((_, el) => cleanText($(el).text()).toLowerCase().startsWith("episodes:"))
        .first()
        .text();

    const totalMatch = cleanText(episodesText).match(/episodes:\s*([0-9]+)/i);
    const total = totalMatch ? Number(totalMatch[1]) : 0;

    const episodes = [];

    for (let i = 1; i <= total; i++) {
        episodes.push({
            id: null,
            title: `Episode ${i}`,
            jp_title: `Episode ${i}`,
            number: i,
            watch: buildWatchUrl(slug, i),
            episode_embed_id: null,
            embed_url: {
                sub: null,
                dub: null
            },
            updated_at: null
        });
    }

    return {
        ok: true,
        source: "watch-page-fallback",
        anikoto_domains: [
            "anikototv.to"
        ],
        anime: {
            id: extracted?.id || null,
            title,
            alternative: title,
            native: jpTitle,
            slug,
            poster,
            episodes: total ? String(total) : null
        },
        episodes
    };
}



app.get("/api/series/:slug", async (req, res) => {
    const slug = safeSlug(req.params.slug);

    if (!slug) {
        return sendError(res, "Invalid slug", 400);
    }

    let watchPage = null;
    let extracted = null;

    try {
        watchPage = await fetchWatchPage(slug);
        extracted = extractSeriesIdFromWatchPage(watchPage.html);

        if (!extracted?.id) {
            return sendError(res, "Could not extract series ID from watch page", 502, {
                slug,
                watch_url: watchPage.url
            });
        }

        try {
            const apiJson = await fetchSeriesFromAnikotoApi(extracted.id);

            const normalized = normalizeSeriesApiResponse(apiJson, slug);

            return sendOk(res, {
                slug,
                series_id: extracted.id,
                watch_url: watchPage.url,
                ...normalized
            });
        } catch (apiError) {
            const fallback = fallbackFromWatchPage(watchPage.html, slug, extracted);

            return sendOk(res, {
                slug,
                series_id: extracted.id,
                watch_url: watchPage.url,
                warning: "anikotoapi.site failed, used fallback",
                api_error: apiError.message,
                ...fallback
            });
        }
    } catch (error) {
        return sendError(res, error.message || "Failed to fetch series", 500, {
            slug
        });
    }
});

app.listen(PORT, () => {
    console.log(`SupaPlay series API running on port ${PORT}`);
    console.log(`Example: http://localhost:${PORT}/api/series/dr-stone-stone-wars-yvphy`);
});
