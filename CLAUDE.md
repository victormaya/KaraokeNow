# VOKAO — Claude Code Guide

Karaoke platform that downloads YouTube audio, removes vocals with AI, and shows synchronized lyrics. Live at https://vokao.com.br.

## Project Layout

```
karaoke/
├── karaoke-back/        # FastAPI backend (Python 3.12)
├── karaoke-front/       # Next.js 15 frontend (React 19 + TypeScript)
├── docker-compose.yml   # Orchestrates both services
├── .env                 # Secrets (not tracked)
├── cookies.txt          # YouTube auth cookies (not tracked)
└── prewarm.py           # Cache pre-warming utility
```

## Running Locally

```bash
docker compose up --build          # Start both services
# frontend → http://localhost:3000
# backend  → http://localhost:8000
```

## Deploying to Production

```bash
git push origin main
ssh root@46.62.148.54
cd /app/karaoke && git pull && docker compose build && docker compose up -d
```

SSL and Nginx are already configured. Never restart Nginx manually — `docker compose up -d` is enough.

---

## Backend (`karaoke-back/`)

**Stack:** FastAPI + uvicorn | yt-dlp | Replicate (Demucs) | httpx

**Port:** 8000

### Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `REPLICATE_API_TOKEN` | Yes | — | Demucs vocal removal API |
| `CORS_ORIGINS` | No | `http://localhost:3000` | Allowed CORS origins |
| `CACHE_DIR` | No | `/app/cache` | Persistent audio cache |
| `COOKIES_FILE` | No | `/app/cookies.txt` | YouTube auth cookies |
| `YTDLP_PROXY` | No | — | HTTP proxy for yt-dlp |

### Cache Structure

```
/app/cache/{video_id}/
├── instrumental.mp3   # AI-processed (vocals removed)
└── original.mp3       # Original audio (with vocals)
```

Cache hits are instant — never reprocess a video that's already cached.

### All API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/health` | Health check |
| GET | `/api/search?q=&limit=12` | YouTube video search |
| GET | `/api/karaoke-search?q=` | Pre-made karaoke search (filters by keywords) |
| POST | `/api/process/{video_id}` | Start AI vocal removal job |
| POST | `/api/direct/{video_id}` | Download-only (no AI, for pre-made karaokes) |
| GET | `/api/job/{job_id}` | Poll job status |
| DELETE | `/api/job/{job_id}` | Clean up temp files (cache is kept) |
| GET | `/api/audio/{job_id}` | Stream processed instrumental MP3 |
| GET | `/api/original/{video_id}` | Stream original audio MP3 |
| GET | `/api/processed?ids=id1,id2` | Check which IDs have cached instrumental |
| GET | `/api/lyrics?artist=&title=` | Fetch lyrics (multi-source fallback) |
| GET | `/api/trending?genre=top` | Apple Music top songs (6h cache) |

### Job Status Flow

```
pending → downloading → separating → done
                                   ↘ error
```

Job status is in-memory (`jobs` dict). Polling interval: 2.5s from frontend.

### Vocal Removal Pipeline

1. Download audio from YouTube via yt-dlp (best quality)
2. Upload to Replicate — Demucs model: `cjwbw/demucs:25a173108cff36ef9f80f854c162d01df9e6528be175794b81158fa03836d953`
3. Stem: `vocals` — returns instrumental as "other" track
4. Save `instrumental.mp3` + `original.mp3` to `CACHE_DIR/{video_id}/`
5. Replicate rate-limits: retry up to 5× with backoff (15s, 30s, 45s, 60s, 75s)

### Lyrics Fallback Chain

1. iTunes Search API — normalizes artist/title from noisy YouTube titles
2. lrclib.net exact match (with iTunes-normalized names)
3. lrclib.net fuzzy search (artist + title)
4. lrclib.net fuzzy search (title only — helps when "artist" is a karaoke channel name)
5. lyrics.ovh (plain text)
6. textyl.co (returns synced LRC-style data)

### Trending Genres

`top, sertanejo, funk, pagode, forro, rap, mpb, gospel`

To add a genre: add its Apple Music genre ID to `GENRE_IDS` in `main.py` and add the tab to `GENRE_TABS` in `karaoke-front/src/app/page.tsx`.

### YouTube Cookies

Cookies expire every 1–3 months. When YouTube starts blocking requests:
1. Export via Chrome extension "Get cookies.txt LOCALLY"
2. `scp cookies.txt root@46.62.148.54:/app/karaoke/cookies.txt`
3. `docker compose restart backend`

---

## Frontend (`karaoke-front/`)

**Stack:** Next.js 15 App Router | React 19 | TypeScript | Tone.js | CSS Modules

**Port:** 3000

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `BACKEND_URL` | Backend URL at build time (Docker arg, default `http://backend:8000`) |
| `NEXT_PUBLIC_BASE_URL` | Public domain for SEO metadata |

All `/api/*` calls from the browser are rewritten to the backend via `next.config.ts`.

### Key Files

| File | Purpose |
|------|---------|
| `src/app/layout.tsx` | Root layout — all SEO metadata, JSON-LD schema, Google verification |
| `src/app/page.tsx` | Home — search bar + trending genre tabs |
| `src/app/song/[id]/SongClient.tsx` | Song page — job polling, lyrics, related songs |
| `src/app/ClientLayout.tsx` | Wraps `PlayerProvider`; adds header/player padding |
| `src/context/PlayerContext.tsx` | Global audio state — the single source of truth for playback |
| `src/components/GlobalPlayer/` | Persistent player bar at the bottom |
| `src/components/GlobalHeader/` | Fixed header with search (hidden on home `/`) |
| `src/components/SongCard/` | Search result card — shows "✨ Pronto" badge if processed |
| `src/components/SongGrid/` | Grid of SongCards — fetches `/api/processed` to set badges |

### PlayerContext

The `PlayerProvider` mounts a single `<audio>` element (karaoke track) and a second `<audio>` (original track) that persists across navigation. Never create local `<audio>` elements in song pages.

Key context values:
- `setTrack(track, audioUrl)` — load a new song; resets pitch and mode
- `setOriginalTrack(url)` — load the original audio (with vocals)
- `switchMode(toKaraoke)` — toggle between instrumental and original by muting one element
- `applyPitch(semitones)` — lazy-init Tone.js PitchShift nodes (only once per element)

**Important:** `setTrack` and `setOriginalTrack` are guarded in `SongClient` with `player.track?.id !== videoId` so navigating back to a playing song doesn't restart the audio.

### Song Page Modes

| Mode | Triggered by | API call | Has voice toggle |
|------|-------------|----------|-----------------|
| AI processing | `direct` param absent | `POST /api/process/{id}` | Yes (original + instrumental) |
| Direct playback | `?direct=1` in URL | `POST /api/direct/{id}` | No (instrumental only) |

The `ready` state starts as `true` when:
- `direct=1` is in the URL, OR
- `player.track?.id === videoId` (same song already playing)

### Lyrics Parsing

`parseSongMeta(rawTitle)` in `SongClient.tsx`:
1. Strips bracketed karaoke noise: `[Karaoke Version]`, `(Official Karaoke)`, etc.
2. Strips bare noise words: `karaokê`, `instrumental`, `no vocals`, `backing track`, etc.
3. Splits on `-`, `–`, `—`, or `|` to extract `artist` and `songTitle`

### CSS Variables (globals.css)

Key variables used everywhere:

```css
--accent          /* Purple: rgb(200, 80, 192) */
--surface         /* Card backgrounds */
--surface-2       /* Slightly lighter surfaces */
--surface-3       /* Progress bar track */
--border          /* Default border */
--border-hover    /* Border on hover */
--text-primary    /* Main text */
--text-secondary  /* Subtitles, metadata */
--text-muted      /* Empty states */
--radius-sm       /* 8px */
--radius-md       /* 12px */
--transition      /* 0.2s ease */
```

---

## Infrastructure

| Service | Provider | Purpose |
|---------|----------|---------|
| VPS | Hetzner Cloud (CX22) | Runs Docker Compose |
| Domain | GoDaddy | vokao.com.br |
| DNS | GoDaddy nameservers (ns23/ns24.domaincontrol.com) |
| SSL | Let's Encrypt via Certbot | Auto-renews every 90 days |
| Reverse proxy | Nginx | Forwards 80/443 → 3000 (frontend) and `/api/*` → 8000 |
| AI model | Replicate (Demucs) | Vocal separation |
| Proxy | Webshare.io | Bypasses YouTube datacenter blocks |

### Nginx Config

Location: `/etc/nginx/sites-available/vokao.com.br`

- `/` → `http://127.0.0.1:3000` (Next.js)
- `/api/` → `http://127.0.0.1:8000` (FastAPI), timeout 300s
- HTTP → HTTPS redirect managed by Certbot

### VPS Access

```bash
ssh root@46.62.148.54
cd /app/karaoke
docker compose ps                          # Check service status
docker logs karaoke-backend-1 --tail 50   # Backend logs
docker logs karaoke-frontend-1 --tail 50  # Frontend logs
```

---

## Common Tasks

### Add a new genre tab
1. Find the Apple Music genre ID (iTunes genre list)
2. Add to `GENRE_IDS` in `karaoke-back/main.py`
3. Add to `GENRE_TABS` in `karaoke-front/src/app/page.tsx`

### Add a new lyrics source
Extend the fallback chain in `get_lyrics()` in `main.py`. Each source should return `(lrc_string | None, plain_text | None)`. Return early on first hit.

### Change branding / copy
- Display name: grep for `VOKAO` in `src/`
- URLs/domain: `NEXT_PUBLIC_BASE_URL` env var and `BASE_URL` in `layout.tsx`
- SEO metadata: `src/app/layout.tsx` (title, description, OG, Twitter, JSON-LD)

### Refresh YouTube cookies
```bash
# 1. Export cookies from browser (extension: "Get cookies.txt LOCALLY")
# 2. Upload to server
scp cookies.txt root@46.62.148.54:/app/karaoke/cookies.txt
# 3. Restart backend
ssh root@46.62.148.54 "cd /app/karaoke && docker compose restart backend"
```

### Force reprocess a video
```bash
ssh root@46.62.148.54
docker exec karaoke-backend-1 rm -rf /app/cache/{video_id}
```

### Clear all cache
```bash
ssh root@46.62.148.54
docker exec karaoke-backend-1 find /app/cache -mindepth 1 -maxdepth 1 -type d -exec rm -rf {} +
```
