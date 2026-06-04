# SupaPlay Anikoto Series API

A fast Node.js API that fetches anime episode data by Anikoto slug.

The API works in two modes:

1. **Fast mode**  
   Fetches the Anikoto watch page, extracts the internal Anikoto series ID, then calls `anikotoapi.site`.

2. **Slow fallback mode**  
   If `anikotoapi.site` is offline or returns invalid data, the API falls back to the slower Anikoto scraping/AJAX method.

The final response always rewrites MegaPlay embed links to your own SupaPlay domain.

---

## Example

Input slug:

```txt
dr-stone-stone-wars-yvphy
```

Source watch page:

```txt
https://anikototv.to/watch/dr-stone-stone-wars-yvphy/ep-1
```

The API extracts:

```txt
series_id = 5781
```

Then it calls:

```txt
https://anikotoapi.site/series/5781
```

The final embed URLs become:

```txt
https://supaplay.fun/stream/s-2/{episode_embed_id}/sub
https://supaplay.fun/stream/s-2/{episode_embed_id}/dub
```

---

## Features

- Fetch episodes using only the anime slug
- Extracts Anikoto internal series ID from the watch page
- Uses `anikotoapi.site` for fast episode data
- Automatically falls back to slower scraping if `anikotoapi.site` is down
- Replaces `megaplay.buzz` with `supaplay.fun`
- Adds an Animapo watch URL for every episode
- Supports caching so slow fallback does not run on every request
- Returns clean JSON for frontend apps, PHP sites, and anime watch pages

---

## Install

```bash
npm install
```

Or install dependencies manually:

```bash
npm install express cors axios cheerio
```

---

## Run

```bash
npm start
```

Default local URL:

```txt
http://localhost:4000
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | Server port |
| `ANIKOTO_BASE` | `https://anikototv.to` | Main Anikoto domain used to fetch watch pages |
| `ANIKOTO_API_BASE` | `https://anikotoapi.site` | Fast metadata API |
| `EMBED_BASE` | `https://supaplay.fun` | Your player wrapper/embed domain |
| `WATCH_BASE` | `https://animapo.fun` | Your public anime watch-page domain |
| `CACHE_TTL_MS` | `600000` | Cache lifetime in milliseconds. Default is 10 minutes |

Example:

```bash
PORT=4000 \
EMBED_BASE=https://supaplay.fun \
WATCH_BASE=https://animapo.fun \
npm start
```

---

## API Endpoint

### Get series by slug

```http
GET /api/series/:slug
```

### Example request

```http
GET /api/series/dr-stone-stone-wars-yvphy
```

### Full local example

```txt
http://localhost:4000/api/series/dr-stone-stone-wars-yvphy
```

### Sakamoto Days example

```txt
http://localhost:4000/api/series/sakamoto-days-sfdxz
```

---

## How It Works

### Step 1: Fetch the watch page

For this request:

```txt
/api/series/dr-stone-stone-wars-yvphy
```

The API fetches:

```txt
https://anikototv.to/watch/dr-stone-stone-wars-yvphy/ep-1
```

### Step 2: Extract the internal series ID

The API reads the watch page and looks for:

```html
<div id="watch-main" data-id="5781">
```

Then it extracts:

```txt
5781
```

### Step 3: Try the fast API

The API calls:

```txt
https://anikotoapi.site/series/5781
```

If this works, it returns episode data quickly.

### Step 4: Rewrite embed URLs

The source API may return embed URLs like:

```txt
https://megaplay.buzz/stream/s-2/51322/sub
```

This API rewrites them to:

```txt
https://supaplay.fun/stream/s-2/51322/sub
```

### Step 5: Add watch URLs

Each episode also receives a frontend watch URL:

```txt
https://animapo.fun/watch/dr-stone-stone-wars-yvphy?ep=1
```

### Step 6: Use slow fallback if needed

If `anikotoapi.site` is offline, slow, blocked, or returns invalid data, the API switches to the fallback method.

The fallback method tries to:

1. Fetch the Anikoto episode list from AJAX endpoints
2. Parse episode numbers and server IDs
3. Resolve available server embed IDs
4. Build SupaPlay embed URLs
5. Return the same response shape

---

## Response Format

The response is wrapped like this:

```json
{
  "success": true,
  "data": {
    "slug": "dr-stone-stone-wars-yvphy",
    "series_id": 5781,
    "watch_url": "https://anikototv.to/watch/dr-stone-stone-wars-yvphy/ep-1",
    "ok": true,
    "source": "anikotoapi.site",
    "anikoto_domains": [
      "anikototv.to",
      "anikoto.cz"
    ],
    "anime": {},
    "episodes": []
  }
}
```

---

## Example Success Response

```json
{
  "success": true,
  "data": {
    "slug": "dr-stone-stone-wars-yvphy",
    "series_id": 5781,
    "watch_url": "https://anikototv.to/watch/dr-stone-stone-wars-yvphy/ep-1",
    "ok": true,
    "source": "anikotoapi.site",
    "anikoto_domains": [
      "anikototv.to",
      "anikoto.cz"
    ],
    "anime": {
      "id": 5781,
      "title": "Dr. Stone: Stone Wars",
      "alternative": "Dr. Stone: Stone Wars",
      "titles": "Dr. Stone 2nd Season, Dr. Stone Second Season",
      "native": "ドクターストーン STONE WARS",
      "slug": "dr-stone-stone-wars-yvphy",
      "rating": "PG-13",
      "poster": "https://cdn.anipixcdn.co/thumbnail/a18d17349a19926e1944714f747d330d.jpg",
      "is_dub": 11,
      "is_sub": 11,
      "aired": "Jan 14, 2021 to Mar 25, 2021",
      "season": "Winter",
      "year": 2021,
      "duration": "24m",
      "status": "Finished Airing",
      "episodes": "11",
      "updated_at": "2024-10-18 08:15:12"
    },
    "episodes": [
      {
        "id": 89988,
        "title": "Stone Wars Beginning",
        "jp_title": "Stone Wars Beginning",
        "number": 1,
        "watch": "https://animapo.fun/watch/dr-stone-stone-wars-yvphy?ep=1",
        "episode_embed_id": "51322",
        "embed_url": {
          "sub": "https://supaplay.fun/stream/s-2/51322/sub",
          "dub": "https://supaplay.fun/stream/s-2/51322/dub"
        },
        "updated_at": "2024-10-18 08:15:12"
      },
      {
        "id": 89998,
        "title": "PROLOGUE OF Dr. STONE",
        "jp_title": "PROLOGUE OF Dr. STONE",
        "number": 11,
        "watch": "https://animapo.fun/watch/dr-stone-stone-wars-yvphy?ep=11",
        "episode_embed_id": "55278",
        "embed_url": {
          "sub": "https://supaplay.fun/stream/s-2/55278/sub",
          "dub": "https://supaplay.fun/stream/s-2/55278/dub"
        },
        "updated_at": "2024-10-18 08:15:12"
      }
    ]
  }
}
```

---

## Episode Object

Each episode object looks like this:

```json
{
  "id": 89988,
  "title": "Stone Wars Beginning",
  "jp_title": "Stone Wars Beginning",
  "number": 1,
  "watch": "https://animapo.fun/watch/dr-stone-stone-wars-yvphy?ep=1",
  "episode_embed_id": "51322",
  "embed_url": {
    "sub": "https://supaplay.fun/stream/s-2/51322/sub",
    "dub": "https://supaplay.fun/stream/s-2/51322/dub"
  },
  "updated_at": "2024-10-18 08:15:12"
}
```

### Episode Fields

| Field | Type | Description |
|---|---|---|
| `id` | number or null | Episode database ID from the upstream API |
| `title` | string | English episode title |
| `jp_title` | string | Japanese/native episode title if available |
| `number` | number | Episode number |
| `watch` | string | Your frontend watch URL |
| `episode_embed_id` | string or null | Player embed ID used by SupaPlay |
| `embed_url.sub` | string or null | SupaPlay sub embed URL |
| `embed_url.dub` | string or null | SupaPlay dub embed URL |
| `updated_at` | string or null | Last update time from the upstream API |

---

## Source Values

The `source` field tells you which method was used.

### Fast mode

```json
"source": "anikotoapi.site"
```

This means the API successfully used:

```txt
https://anikotoapi.site/series/{series_id}
```

### Slow fallback mode

```json
"source": "slow-anikoto-fallback"
```

This means `anikotoapi.site` failed, so the API used the slower scraping/AJAX method.

Fallback responses also include:

```json
"warning": "anikotoapi.site failed, used slow fallback"
```

and:

```json
"api_error": "anikotoapi.site failed with HTTP 500"
```

The exact `api_error` depends on what went wrong.

---

## Error Responses

### Invalid slug

```json
{
  "success": false,
  "message": "Invalid slug"
}
```

### Could not extract series ID

```json
{
  "success": false,
  "message": "Could not extract series ID from watch page",
  "slug": "example-slug",
  "watch_url": "https://anikototv.to/watch/example-slug/ep-1"
}
```

### Source request failed

```json
{
  "success": false,
  "message": "Watch page failed with HTTP 404",
  "slug": "wrong-slug"
}
```

---

## Frontend Usage Example

```js
async function loadEpisodes(slug) {
  const response = await fetch(`https://your-api-domain.com/api/series/${slug}`);
  const json = await response.json();

  if (!json.success) {
    throw new Error(json.message || "Failed to load episodes");
  }

  return json.data.episodes;
}

loadEpisodes("dr-stone-stone-wars-yvphy").then((episodes) => {
  console.log(episodes);

  const firstEpisode = episodes[0];

  console.log(firstEpisode.embed_url.sub);
});
```

---

## PHP Usage Example

```php
<?php

$slug = "dr-stone-stone-wars-yvphy";
$url = "https://your-api-domain.com/api/series/" . urlencode($slug);

$json = file_get_contents($url);
$data = json_decode($json, true);

if (!$data || empty($data["success"])) {
    die("Failed to load episodes");
}

$episodes = $data["data"]["episodes"];

foreach ($episodes as $episode) {
    echo "Episode " . $episode["number"] . ": " . $episode["title"] . PHP_EOL;
    echo "SUB: " . $episode["embed_url"]["sub"] . PHP_EOL;
    echo "DUB: " . $episode["embed_url"]["dub"] . PHP_EOL;
}
```

---

## HTML Embed Example

```html
<iframe
  src="https://supaplay.fun/stream/s-2/51322/sub"
  width="100%"
  height="500"
  frameborder="0"
  scrolling="no"
  allow="autoplay; fullscreen; picture-in-picture"
  allowfullscreen>
</iframe>
```

---

## Recommended Production Setup

Use caching.

The default cache lasts 10 minutes:

```txt
CACHE_TTL_MS=600000
```

For a larger public API, use Redis instead of in-memory cache.

Recommended setup:

```txt
Nginx / Cloudflare
        ↓
Node.js API
        ↓
In-memory cache or Redis
        ↓
Anikoto watch page + anikotoapi.site
```

---

## Deploy Notes

### Render

Start command:

```bash
npm start
```

Environment variables:

```txt
PORT=4000
EMBED_BASE=https://supaplay.fun
WATCH_BASE=https://animapo.fun
CACHE_TTL_MS=600000
```

### VPS with PM2

```bash
npm install
npm install -g pm2
pm2 start server.js --name supaplay-api
pm2 save
```

### Nginx Reverse Proxy

```nginx
server {
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## Notes

- The fast method depends on `anikotoapi.site`.
- If that service goes down, the fallback method keeps the API working.
- The fallback method is slower because it must discover episodes and resolve server/embed data manually.
- Cache is important for performance.
- This API does not decrypt video streams or download media.
- It only returns episode metadata and SupaPlay wrapper embed URLs.

---

## License

MIT
