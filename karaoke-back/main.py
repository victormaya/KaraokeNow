import os
import uuid
import shutil
import tempfile
import asyncio
import time
from pathlib import Path
from typing import Optional
from concurrent.futures import ThreadPoolExecutor

import httpx
import replicate
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

import yt_dlp

# ─────────────────────────────────────────────
# App setup
# ─────────────────────────────────────────────

app = FastAPI(title="Karaoke API", version="1.0.0")

_cors_origins = os.environ.get("CORS_ORIGINS", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TEMP_DIR = Path(tempfile.gettempdir()) / "karaoke_jobs"
TEMP_DIR.mkdir(exist_ok=True)

CACHE_DIR = Path(os.environ.get("CACHE_DIR", "/app/cache"))
CACHE_DIR.mkdir(exist_ok=True)

REPLICATE_API_TOKEN = os.environ.get("REPLICATE_API_TOKEN", "")
COOKIES_FILE = Path(os.environ.get("COOKIES_FILE", "/app/cookies.txt"))
YTDLP_PROXY = os.environ.get("YTDLP_PROXY", "")

# In-memory job store  { job_id: { status, audio_path, error } }
jobs: dict[str, dict] = {}

# Dedup in-flight: video_id -> job_id
video_to_job: dict[str, str] = {}


def _base_ydl_opts() -> dict:
    opts: dict = {
        "quiet": True,
        "no_warnings": True,
        "js_runtimes": {"node": {}},
        "remote_components": ["ejs:github"],
    }
    if COOKIES_FILE.is_file() and COOKIES_FILE.stat().st_size > 100:
        opts["cookiefile"] = str(COOKIES_FILE)
    if YTDLP_PROXY:
        opts["proxy"] = YTDLP_PROXY
    return opts

# Thread pool for blocking I/O and CPU work
executor = ThreadPoolExecutor(max_workers=4)


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def _format_duration(seconds: Optional[int]) -> str:
    if not seconds:
        return "—"
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


KARAOKE_KEYWORDS = {
    "karaoke", "karaokê", "instrumental", "sem vocal", "sem voz",
    "backing track", "no vocals", "playback", "base musical", "pista",
}


def _search_sync(query: str, limit: int) -> list[dict]:
    ydl_opts = {
        **_base_ydl_opts(),
        "extract_flat": "in_playlist",
        "skip_download": True,
        "default_search": "ytsearch",
    }
    url = f"ytsearch{limit}:{query}"
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)

    results = []
    for entry in (info or {}).get("entries", []):
        if not entry or not entry.get("id"):
            continue
        vid_id = entry["id"]
        results.append(
            {
                "id": vid_id,
                "title": entry.get("title", "Unknown"),
                "channel": entry.get("channel") or entry.get("uploader", ""),
                "duration": _format_duration(entry.get("duration")),
                "thumbnail": (
                    entry.get("thumbnail")
                    or f"https://img.youtube.com/vi/{vid_id}/mqdefault.jpg"
                ),
                "url": f"https://www.youtube.com/watch?v={vid_id}",
            }
        )
    return results



def _direct_sync(job_id: str, video_id: str) -> None:
    """Download-only worker: saves audio without vocal separation."""
    job_dir = TEMP_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    dedup_key = f"yt_{video_id}"

    try:
        jobs[job_id]["status"] = "downloading"
        ydl_opts = {
            **_base_ydl_opts(),
            "outtmpl": str(job_dir / "audio.%(ext)s"),
            "format": "bestaudio/best",
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([f"https://www.youtube.com/watch?v={video_id}"])

        candidates = [
            p for p in job_dir.iterdir()
            if p.stem == "audio" and p.suffix not in (".part", ".ytdl")
        ]
        if not candidates:
            raise FileNotFoundError("Download failed – no audio file produced.")
        downloaded = candidates[0]

        import subprocess
        cache_entry = CACHE_DIR / dedup_key
        cache_entry.mkdir(parents=True, exist_ok=True)
        audio_path = cache_entry / "audio.mp3"

        if downloaded.suffix.lower() == ".mp3":
            shutil.copy2(downloaded, audio_path)
        else:
            subprocess.run(
                ["ffmpeg", "-y", "-i", str(downloaded), "-q:a", "2", "-map", "a", str(audio_path)],
                check=True, capture_output=True,
            )

        shutil.rmtree(job_dir, ignore_errors=True)
        jobs[job_id] = {"status": "done", "audio_path": str(audio_path), "error": None}

    except Exception as exc:
        jobs[job_id] = {"status": "error", "audio_path": None, "error": str(exc)}
        video_to_job.pop(dedup_key, None)


def _process_sync(job_id: str, video_id: str) -> None:
    """
    Blocking worker: downloads audio from YouTube then strips vocals via Replicate.
    Runs inside ThreadPoolExecutor so it doesn't block the event loop.
    """
    job_dir = TEMP_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    try:
        if not REPLICATE_API_TOKEN:
            raise ValueError("REPLICATE_API_TOKEN environment variable not set.")

        # ── 1. Download audio with yt-dlp ────────────────────────────────
        jobs[job_id]["status"] = "downloading"
        ydl_opts = {
            **_base_ydl_opts(),
            "outtmpl": str(job_dir / "original.%(ext)s"),
            "format": "bestaudio/best",
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([f"https://www.youtube.com/watch?v={video_id}"])

        candidates = [
            p for p in job_dir.iterdir()
            if p.stem == "original" and p.suffix not in (".part", ".ytdl")
        ]
        if not candidates:
            raise FileNotFoundError("Download failed – no audio file produced.")
        downloaded = candidates[0]

        # ── 2. Separate vocals via Replicate (Demucs) ────────────────────
        jobs[job_id]["status"] = "separating"

        client = replicate.Client(api_token=REPLICATE_API_TOKEN)

        # Retry up to 5 times on 429 rate-limit responses
        output = None
        for attempt in range(5):
            try:
                with open(downloaded, "rb") as f:
                    output = client.run(
                        "cjwbw/demucs:25a173108cff36ef9f80f854c162d01df9e6528be175794b81158fa03836d953",
                        input={
                            "audio": f,
                            "model_name": "mdx_q",
                            "stem": "vocals",
                            "output_format": "mp3",
                            "mp3_bitrate": 192,
                            "shifts": 0,
                            "overlap": 0.1,
                        },
                    )
                break  # success
            except Exception as e:
                err = str(e)
                if "429" in err or "throttled" in err.lower():
                    wait = 15 * (attempt + 1)  # 15s, 30s, 45s, 60s, 75s
                    time.sleep(wait)
                    continue
                raise  # re-raise non-rate-limit errors

        if output is None:
            raise RuntimeError("Replicate rate limit exceeded after 5 retries.")

        # When stem="vocals", Demucs returns vocals + other (= everything except vocals)
        if not isinstance(output, dict) or not output.get("other"):
            raise ValueError(f"Could not find instrumental track. Replicate output: {output}")

        # ── 3. Save to persistent cache ───────────────────────────────────
        import subprocess
        cache_entry = CACHE_DIR / video_id
        cache_entry.mkdir(parents=True, exist_ok=True)
        instrumental = cache_entry / "instrumental.mp3"
        instrumental.write_bytes(output["other"].read())

        # Keep original audio in cache for playback
        original = cache_entry / "original.mp3"
        if downloaded.suffix.lower() == ".mp3":
            shutil.copy2(downloaded, original)
        else:
            subprocess.run(
                ["ffmpeg", "-y", "-i", str(downloaded), "-q:a", "2", "-map", "a", str(original)],
                check=True, capture_output=True,
            )

        downloaded.unlink(missing_ok=True)
        shutil.rmtree(job_dir, ignore_errors=True)

        jobs[job_id] = {
            "status": "done",
            "audio_path": str(instrumental),
            "error": None,
        }

    except Exception as exc:
        jobs[job_id] = {
            "status": "error",
            "audio_path": None,
            "error": str(exc),
        }
        video_to_job.pop(video_id, None)


# ─────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────

@app.get("/api/karaoke-search")
async def search_karaoke(q: str):
    """Search YouTube for ready-made karaoke versions of a song."""
    if not q.strip():
        return JSONResponse({"results": []})
    try:
        loop = asyncio.get_running_loop()
        results = await loop.run_in_executor(executor, _search_sync, f"{q} karaoke", 8)
        filtered = [
            r for r in results
            if any(kw in r["title"].lower() for kw in KARAOKE_KEYWORDS)
        ]
        return JSONResponse({"results": filtered[:3]})
    except Exception:
        return JSONResponse({"results": []})


@app.post("/api/direct/{video_id}")
async def start_direct(video_id: str, background_tasks: BackgroundTasks):
    """Download audio only (no vocal separation) — for YouTube karaoke videos."""
    dedup_key = f"yt_{video_id}"

    cached = CACHE_DIR / dedup_key / "audio.mp3"
    if cached.exists():
        job_id = str(uuid.uuid4())
        jobs[job_id] = {"status": "done", "audio_path": str(cached), "error": None}
        return JSONResponse({"job_id": job_id, "status": "done"})

    if dedup_key in video_to_job:
        existing = video_to_job[dedup_key]
        if existing in jobs:
            return JSONResponse({"job_id": existing, "status": jobs[existing]["status"]})

    job_id = str(uuid.uuid4())
    jobs[job_id] = {"status": "pending", "audio_path": None, "error": None}
    video_to_job[dedup_key] = job_id

    async def _run():
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(executor, _direct_sync, job_id, video_id)

    background_tasks.add_task(_run)
    return JSONResponse({"job_id": job_id, "status": "pending"})


@app.get("/api/search")
async def search_youtube(q: str, limit: int = 12):
    """Search YouTube and return song metadata."""
    if not q.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty.")
    try:
        loop = asyncio.get_running_loop()
        results = await loop.run_in_executor(executor, _search_sync, q, limit)
        return JSONResponse({"results": results})
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))



@app.post("/api/process/{video_id}")
async def start_processing(video_id: str, background_tasks: BackgroundTasks):
    """Kick off vocal-removal job and return a job_id to poll."""
    # 1. Cache hit — return instantly
    cached = CACHE_DIR / video_id / "instrumental.mp3"
    if cached.exists():
        job_id = str(uuid.uuid4())
        jobs[job_id] = {"status": "done", "audio_path": str(cached), "error": None}
        return JSONResponse({"job_id": job_id, "status": "done"})

    # 2. Already processing — return existing job
    if video_id in video_to_job:
        existing = video_to_job[video_id]
        if existing in jobs:
            return JSONResponse({"job_id": existing, "status": jobs[existing]["status"]})

    # 3. New job
    job_id = str(uuid.uuid4())
    jobs[job_id] = {"status": "pending", "audio_path": None, "error": None}
    video_to_job[video_id] = job_id

    async def _run():
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(executor, _process_sync, job_id, video_id)

    background_tasks.add_task(_run)
    return JSONResponse({"job_id": job_id, "status": "pending"})


@app.get("/api/job/{job_id}")
async def get_job(job_id: str):
    """Poll job status."""
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    return JSONResponse(
        {
            "job_id": job_id,
            "status": job["status"],
            "audio_url": f"/api/audio/{job_id}" if job["status"] == "done" else None,
            "error": job.get("error"),
        }
    )


@app.get("/api/audio/{job_id}")
async def stream_audio(job_id: str):
    """Return the processed instrumental as an audio file."""
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    if job["status"] != "done":
        raise HTTPException(status_code=400, detail=f"Audio not ready (status: {job['status']}).")

    path = Path(job["audio_path"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="Audio file missing.")

    return FileResponse(
        path=path,
        media_type="audio/mpeg",
        filename="instrumental.mp3",
        headers={"Cache-Control": "no-cache, no-store"},
    )


@app.get("/api/original/{video_id}")
async def stream_original(video_id: str):
    """Return the original audio (with vocals)."""
    path = CACHE_DIR / video_id / "original.mp3"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Original audio not cached.")
    return FileResponse(
        path=path,
        media_type="audio/mpeg",
        filename="original.mp3",
        headers={"Cache-Control": "no-cache, no-store"},
    )


@app.delete("/api/job/{job_id}")
async def cleanup_job(job_id: str):
    """Remove job from memory. Cache files are kept for future requests."""
    job_dir = TEMP_DIR / job_id
    if job_dir.exists():
        shutil.rmtree(job_dir, ignore_errors=True)
    jobs.pop(job_id, None)
    return JSONResponse({"deleted": True})


@app.get("/api/lyrics")
async def get_lyrics(artist: str = "", title: str = ""):
    """Proxy to lrclib.net — returns synced LRC and plain lyrics.
    Falls back to fuzzy search if exact match yields nothing."""
    from urllib.parse import quote
    if not artist and not title:
        return JSONResponse({"lrc": None, "lyrics": None})
    headers = {"Lrclib-Client": "KaraokeNow/1.0"}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            # 1. Exact match
            url = (
                f"https://lrclib.net/api/get"
                f"?artist_name={quote(artist.strip())}"
                f"&track_name={quote(title.strip())}"
            )
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                lrc     = data.get("syncedLyrics") or None
                lyrics  = data.get("plainLyrics")  or None
                if lrc or lyrics:
                    return JSONResponse({"lrc": lrc, "lyrics": lyrics})

            # 2. Fuzzy search: artist + title
            q = f"{artist.strip()} {title.strip()}".strip()
            search_url = f"https://lrclib.net/api/search?q={quote(q)}"
            sresp = await client.get(search_url, headers=headers)
            if sresp.status_code == 200:
                results = sresp.json()
                if results:
                    best = results[0]
                    lrc    = best.get("syncedLyrics") or None
                    lyrics = best.get("plainLyrics")  or None
                    if lrc or lyrics:
                        return JSONResponse({"lrc": lrc, "lyrics": lyrics})

            # 2b. Fuzzy search: title only (helps when artist came from a karaoke channel name)
            if artist.strip() and title.strip():
                t2_url = f"https://lrclib.net/api/search?q={quote(title.strip())}"
                t2resp = await client.get(t2_url, headers=headers)
                if t2resp.status_code == 200:
                    t2results = t2resp.json()
                    if t2results:
                        best2 = t2results[0]
                        lrc    = best2.get("syncedLyrics") or None
                        lyrics = best2.get("plainLyrics")  or None
                        if lrc or lyrics:
                            return JSONResponse({"lrc": lrc, "lyrics": lyrics})

            # 3. lyrics.ovh — larger database, plain text only
            async def _try_ovh(a: str, t: str) -> str | None:
                if not a or not t:
                    return None
                try:
                    r = await client.get(
                        f"https://api.lyrics.ovh/v1/{quote(a)}/{quote(t)}",
                        timeout=8,
                    )
                    if r.status_code == 200:
                        return r.json().get("lyrics") or None
                except Exception:
                    pass
                return None

            art = artist.strip()
            tit = title.strip()

            # 3a. artist + title as-is
            if art and tit:
                plain = await _try_ovh(art, tit)
                if plain:
                    return JSONResponse({"lrc": None, "lyrics": plain})

            # 3b. artist empty — try splitting the title (e.g. "Marilia Mendonca Infiel")
            if not art and tit:
                words = tit.split()
                for split_at in (2, 1, 3):
                    if len(words) > split_at:
                        plain = await _try_ovh(
                            " ".join(words[:split_at]),
                            " ".join(words[split_at:]),
                        )
                        if plain:
                            return JSONResponse({"lrc": None, "lyrics": plain})

            # 4. textyl.co — returns synced lines, free, no auth
            q_textyl = f"{art} {tit}".strip() if art else tit
            if q_textyl:
                try:
                    tr = await client.get(
                        f"https://api.textyl.co/api/lyrics?q={quote(q_textyl)}",
                        timeout=8,
                    )
                    if tr.status_code == 200:
                        lines = tr.json()
                        if isinstance(lines, list) and lines:
                            def _sec_to_lrc(s: float) -> str:
                                m2 = int(s) // 60
                                s2 = s - m2 * 60
                                return f"[{m2:02d}:{s2:05.2f}]"
                            lrc_lines = "\n".join(
                                f"{_sec_to_lrc(ln['seconds'])}{ln['lyrics']}"
                                for ln in lines
                                if "seconds" in ln and "lyrics" in ln
                            )
                            if lrc_lines:
                                return JSONResponse({"lrc": lrc_lines, "lyrics": None})
                except Exception:
                    pass
    except Exception:
        pass
    return JSONResponse({"lrc": None, "lyrics": None})


GENRE_IDS: dict[str, Optional[int]] = {
    "top":       None,
    "sertanejo": 1228,
    "funk":      1229,
    "pagode":    1226,
    "forro":     1223,
    "rap":       18,
    "mpb":       1225,
}

# Per-genre cache: genre_key -> {"data": list, "ts": float}
_trending_caches: dict[str, dict] = {}


@app.get("/api/trending")
async def get_trending(genre: str = "top"):
    """Top songs in Brazil from Apple Music/iTunes RSS — cached 6h per genre."""
    if genre not in GENRE_IDS:
        raise HTTPException(status_code=400, detail=f"Unknown genre '{genre}'.")

    cache = _trending_caches.setdefault(genre, {"data": None, "ts": 0.0})
    if cache["data"] and time.time() - cache["ts"] < 21600:
        return JSONResponse({"results": cache["data"]})

    genre_id = GENRE_IDS[genre]
    if genre_id is not None:
        url = f"https://itunes.apple.com/br/rss/topsongs/limit=20/genre={genre_id}/json"
    else:
        url = "https://itunes.apple.com/br/rss/topsongs/limit=50/json"

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                entries = resp.json().get("feed", {}).get("entry", [])
                results = [
                    {
                        "name":   e["im:name"]["label"],
                        "artist": e["im:artist"]["label"],
                        "art":    e["im:image"][-1]["label"].replace("170x170bb", "600x600bb"),
                    }
                    for e in entries
                ]
                cache["data"] = results
                cache["ts"]   = time.time()
                return JSONResponse({"results": results})
    except Exception:
        pass
    return JSONResponse({"results": []})


@app.get("/health")
async def health():
    return {"status": "ok"}
