import os
import uuid
import json
import shutil
import tempfile
import asyncio
import time
from collections import defaultdict
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional
from concurrent.futures import ThreadPoolExecutor

import httpx
import replicate
from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import yt_dlp

# ─────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────

TEMP_DIR = Path(tempfile.gettempdir()) / "karaoke_jobs"
TEMP_DIR.mkdir(exist_ok=True)

CACHE_DIR = Path(os.environ.get("CACHE_DIR", "/app/cache"))
CACHE_DIR.mkdir(exist_ok=True)

REPLICATE_API_TOKEN = os.environ.get("REPLICATE_API_TOKEN", "")
COOKIES_FILE = Path(os.environ.get("COOKIES_FILE", "/app/cookies.txt"))
YTDLP_PROXY = os.environ.get("YTDLP_PROXY", "")

FFMPEG_TIMEOUT_SECONDS = 120

# Rate limiting: max process requests per IP per window
RATE_LIMIT_MAX     = 10
RATE_LIMIT_WINDOW  = 60  # seconds

CACHE_MAX_AGE_DAYS = 30

REPLICATE_MAX_RETRIES      = 5
REPLICATE_RETRY_BASE_WAIT  = 15   # seconds; multiplied by (attempt + 1)
OEMBED_POLITENESS_DELAY    = 0.3  # seconds between oEmbed requests

# In-memory job store  { job_id: { status, audio_path, error } }
jobs: dict[str, dict] = {}

# Dedup in-flight: video_id -> job_id
video_to_job: dict[str, str] = {}

# Drum job stores
drum_jobs: dict[str, dict] = {}
video_to_drum_job: dict[str, str] = {}

# Rate limiting store: ip -> list of request timestamps
_rate_store: dict[str, list[float]] = defaultdict(list)


def _check_rate_limit(ip: str) -> bool:
    """Return True if the request is allowed, False if rate-limited."""
    now = time.time()
    timestamps = _rate_store[ip]
    _rate_store[ip] = [t for t in timestamps if now - t < RATE_LIMIT_WINDOW]
    if len(_rate_store[ip]) >= RATE_LIMIT_MAX:
        return False
    _rate_store[ip].append(now)
    return True


class SongMeta(BaseModel):
    title: Optional[str] = None
    channel: Optional[str] = None
    thumbnail: Optional[str] = None


# ─────────────────────────────────────────────
# Metadata backfill (runs at startup)
# ─────────────────────────────────────────────

async def _evict_old_cache() -> None:
    """Remove cache directories not accessed in CACHE_MAX_AGE_DAYS days."""
    cutoff = time.time() - CACHE_MAX_AGE_DAYS * 86400
    try:
        for d in CACHE_DIR.iterdir():
            if not d.is_dir():
                continue
            try:
                if d.stat().st_atime < cutoff:
                    shutil.rmtree(d, ignore_errors=True)
            except Exception:
                pass
    except Exception:
        pass


async def _backfill_metadata_task() -> None:
    """Fetch title/channel/thumbnail for cached songs that have no metadata.json yet."""
    await asyncio.sleep(5)  # let the server finish starting up
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            for d in sorted(CACHE_DIR.iterdir()):
                if not d.is_dir() or (d / "metadata.json").exists():
                    continue
                dir_name = d.name
                video_id = dir_name[3:] if dir_name.startswith("yt_") else dir_name
                try:
                    r = await client.get(
                        "https://www.youtube.com/oembed",
                        params={"url": f"https://www.youtube.com/watch?v={video_id}", "format": "json"},
                    )
                    if r.status_code == 200:
                        data = r.json()
                        meta = {
                            "video_id": video_id,
                            "title":     data.get("title", ""),
                            "channel":   data.get("author_name", ""),
                            "thumbnail": data.get("thumbnail_url", f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg"),
                            "processed_at": d.stat().st_mtime,
                        }
                        (d / "metadata.json").write_text(json.dumps(meta))
                except Exception:
                    pass
                await asyncio.sleep(OEMBED_POLITENESS_DELAY)
    except Exception:
        pass


@asynccontextmanager
async def lifespan(_app: FastAPI):
    asyncio.create_task(_backfill_metadata_task())
    asyncio.create_task(_evict_old_cache())
    yield
    executor.shutdown(wait=False)


# ─────────────────────────────────────────────
# App setup
# ─────────────────────────────────────────────

app = FastAPI(title="Karaoke API", version="1.0.0", lifespan=lifespan)

_cors_origins = os.environ.get("CORS_ORIGINS", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _cors_origins.split(",")],
    allow_origin_regex=r"https?://localhost:\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Thread pool for blocking I/O and CPU work
executor = ThreadPoolExecutor(max_workers=4)


BGUTIL_URL = os.environ.get("BGUTIL_URL", "http://bgutil-provider:4416")


def _base_ydl_opts() -> dict:
    opts: dict = {
        "quiet": True,
        "no_warnings": True,
        "js_runtimes": {"node": {"path": "/usr/bin/node"}},
        "extractor_args": {
            "youtube": {"player_client": ["ios", "web", "android"]},
            "youtubepot-bgutilhttp": {"base_url": [BGUTIL_URL]},
        },
    }
    if COOKIES_FILE.is_file() and COOKIES_FILE.stat().st_size > 100:
        opts["cookiefile"] = str(COOKIES_FILE)
    if YTDLP_PROXY:
        opts["proxy"] = YTDLP_PROXY
    return opts


def _detect_bpm(audio_path: str) -> Optional[float]:
    """Estimate BPM via FFT-based autocorrelation of short-time energy onset envelope."""
    try:
        import numpy as np
        import subprocess as _sp

        sr = 22050
        proc = _sp.run(
            ["ffmpeg", "-i", audio_path, "-ar", str(sr), "-ac", "1", "-f", "f32le", "-"],
            capture_output=True, timeout=60,
        )
        if proc.returncode != 0 or len(proc.stdout) < sr * 4:
            return None

        samples = np.frombuffer(proc.stdout, dtype=np.float32)
        if len(samples) < sr * 5:
            return None

        hop, frame_len = 512, 1024
        n_frames = (len(samples) - frame_len) // hop
        idx = np.arange(frame_len) + np.arange(n_frames)[:, None] * hop
        energy = np.sum(samples[idx] ** 2, axis=1)
        onset = np.maximum(0.0, np.diff(energy))

        n = len(onset)
        fft = np.fft.rfft(onset, n=2 * n)
        corr = np.fft.irfft(np.abs(fft) ** 2)[:n]

        fps = sr / hop
        lag_min = max(1, int(fps * 60 / 200))
        lag_max = min(n - 1, int(fps * 60 / 60))
        if lag_min >= lag_max:
            return None

        best_lag = int(np.argmax(corr[lag_min : lag_max + 1])) + lag_min
        return round(float(fps * 60.0 / best_lag), 1)
    except Exception:
        return None


def _drums_sync(job_id: str, video_id: str, title: str = "", channel: str = "", thumbnail: str = "") -> None:
    """Download audio and remove drums via Demucs (stem='drums'). Saves no_drums.mp3 to cache."""
    job_dir = TEMP_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    try:
        if not REPLICATE_API_TOKEN:
            raise ValueError("REPLICATE_API_TOKEN environment variable not set.")

        import subprocess
        cache_entry = CACHE_DIR / video_id
        cache_entry.mkdir(parents=True, exist_ok=True)

        # Re-use existing original.mp3 if already cached from karaoke processing
        existing_original = cache_entry / "original.mp3"
        if existing_original.exists():
            drum_jobs[job_id]["status"] = "separating"
            audio_file = existing_original
        else:
            drum_jobs[job_id]["status"] = "downloading"
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

            if downloaded.suffix.lower() == ".mp3":
                shutil.copy2(downloaded, existing_original)
            else:
                subprocess.run(
                    ["ffmpeg", "-y", "-i", str(downloaded), "-q:a", "2", "-map", "a", str(existing_original)],
                    check=True, capture_output=True, timeout=FFMPEG_TIMEOUT_SECONDS,
                )
            downloaded.unlink(missing_ok=True)
            audio_file = existing_original
            drum_jobs[job_id]["status"] = "separating"

        client = replicate.Client(api_token=REPLICATE_API_TOKEN)
        output = None
        for attempt in range(REPLICATE_MAX_RETRIES):
            try:
                with open(audio_file, "rb") as f:
                    output = client.run(
                        "cjwbw/demucs:25a173108cff36ef9f80f854c162d01df9e6528be175794b81158fa03836d953",
                        input={
                            "audio": f,
                            "model_name": "mdx_q",
                            "stem": "drums",
                            "output_format": "mp3",
                            "mp3_bitrate": 192,
                            "shifts": 0,
                            "overlap": 0.1,
                        },
                    )
                break
            except Exception as e:
                err = str(e)
                if "429" in err or "throttled" in err.lower():
                    time.sleep(REPLICATE_RETRY_BASE_WAIT * (attempt + 1))
                    continue
                raise

        if output is None:
            raise RuntimeError(f"Replicate rate limit exceeded after {REPLICATE_MAX_RETRIES} retries.")

        if not isinstance(output, dict) or not output.get("other"):
            raise ValueError(f"Could not find no-drums track. Replicate output: {output}")

        no_drums = cache_entry / "no_drums.mp3"
        no_drums.write_bytes(output["other"].read())

        bpm = _detect_bpm(str(audio_file))
        if bpm is not None:
            (cache_entry / "bpm.json").write_text(json.dumps({"bpm": bpm}))

        shutil.rmtree(job_dir, ignore_errors=True)

        if title or channel:
            meta_file = cache_entry / "metadata.json"
            if not meta_file.exists():
                meta_file.write_text(json.dumps({
                    "video_id": video_id,
                    "title": title,
                    "channel": channel,
                    "thumbnail": thumbnail or f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg",
                    "processed_at": time.time(),
                }))

        drum_jobs[job_id] = {
            "status": "done",
            "audio_path": str(no_drums),
            "bpm": bpm,
            "error": None,
        }

    except Exception as exc:
        drum_jobs[job_id] = {
            "status": "error",
            "audio_path": None,
            "bpm": None,
            "error": str(exc),
        }
        video_to_drum_job.pop(video_id, None)


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



def _direct_sync(job_id: str, video_id: str, dedup_key: str, title: str = "", channel: str = "", thumbnail: str = "") -> None:
    """Download-only worker: saves audio without vocal separation."""
    job_dir = TEMP_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

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
                check=True, capture_output=True, timeout=FFMPEG_TIMEOUT_SECONDS,
            )

        if title or channel:
            meta = {
                "video_id": video_id,
                "title": title,
                "channel": channel,
                "thumbnail": thumbnail or f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg",
                "processed_at": time.time(),
            }
            (cache_entry / "metadata.json").write_text(json.dumps(meta))

        shutil.rmtree(job_dir, ignore_errors=True)
        jobs[job_id] = {"status": "done", "audio_path": str(audio_path), "error": None}

    except Exception as exc:
        jobs[job_id] = {"status": "error", "audio_path": None, "error": str(exc)}
        video_to_job.pop(dedup_key, None)


def _process_sync(job_id: str, video_id: str, title: str = "", channel: str = "", thumbnail: str = "") -> None:
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
        for attempt in range(REPLICATE_MAX_RETRIES):
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
                    time.sleep(REPLICATE_RETRY_BASE_WAIT * (attempt + 1))
                    continue
                raise  # re-raise non-rate-limit errors

        if output is None:
            raise RuntimeError(f"Replicate rate limit exceeded after {REPLICATE_MAX_RETRIES} retries.")

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
                check=True, capture_output=True, timeout=FFMPEG_TIMEOUT_SECONDS,
            )

        downloaded.unlink(missing_ok=True)
        shutil.rmtree(job_dir, ignore_errors=True)

        if title or channel:
            meta = {
                "video_id": video_id,
                "title": title,
                "channel": channel,
                "thumbnail": thumbnail or f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg",
                "processed_at": time.time(),
            }
            (cache_entry / "metadata.json").write_text(json.dumps(meta))

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
async def start_direct(video_id: str, request: Request, background_tasks: BackgroundTasks, meta: Optional[SongMeta] = None):
    """Download audio only (no vocal separation) — for YouTube karaoke videos."""
    ip = request.client.host if request.client else "unknown"
    if not _check_rate_limit(ip):
        raise HTTPException(status_code=429, detail="Muitas requisições. Tente novamente em instantes.")
    dedup_key = f"yt_{video_id}"
    title     = (meta.title    or "") if meta else ""
    channel   = (meta.channel  or "") if meta else ""
    thumbnail = (meta.thumbnail or "") if meta else ""

    cached = CACHE_DIR / dedup_key / "audio.mp3"
    if cached.exists():
        job_id = str(uuid.uuid4())
        jobs[job_id] = {"status": "done", "audio_path": str(cached), "error": None}
        if title or channel:
            meta_file = CACHE_DIR / dedup_key / "metadata.json"
            if not meta_file.exists():
                meta_file.write_text(json.dumps({
                    "video_id": video_id, "title": title, "channel": channel,
                    "thumbnail": thumbnail or f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg",
                    "processed_at": time.time(),
                }))
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
        await loop.run_in_executor(executor, _direct_sync, job_id, video_id, dedup_key, title, channel, thumbnail)

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
async def start_processing(video_id: str, request: Request, background_tasks: BackgroundTasks, meta: Optional[SongMeta] = None):
    """Kick off vocal-removal job and return a job_id to poll."""
    ip = request.client.host if request.client else "unknown"
    if not _check_rate_limit(ip):
        raise HTTPException(status_code=429, detail="Muitas requisições. Tente novamente em instantes.")
    title     = (meta.title    or "") if meta else ""
    channel   = (meta.channel  or "") if meta else ""
    thumbnail = (meta.thumbnail or "") if meta else ""

    # 1. Cache hit — return instantly
    cached = CACHE_DIR / video_id / "instrumental.mp3"
    if cached.exists():
        job_id = str(uuid.uuid4())
        jobs[job_id] = {"status": "done", "audio_path": str(cached), "error": None}
        if title or channel:
            meta_file = CACHE_DIR / video_id / "metadata.json"
            if not meta_file.exists():
                meta_file.write_text(json.dumps({
                    "video_id": video_id, "title": title, "channel": channel,
                    "thumbnail": thumbnail or f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg",
                    "processed_at": time.time(),
                }))
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
        await loop.run_in_executor(executor, _process_sync, job_id, video_id, title, channel, thumbnail)

    background_tasks.add_task(_run)
    return JSONResponse({"job_id": job_id, "status": "pending"})


@app.get("/api/job/{job_id}")
async def get_job(job_id: str):
    """Poll job status."""
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job não encontrado. O servidor pode ter sido reiniciado — tente processar a música novamente.")
    return JSONResponse(
        {
            "job_id": job_id,
            "status": job["status"],
            "audio_url": f"/api/audio/{job_id}" if job["status"] == "done" else None,
            "error": job.get("error"),
        }
    )


@app.post("/api/backfill-metadata")
async def backfill_metadata(background_tasks: BackgroundTasks):
    """Manually trigger metadata backfill for cached songs without metadata.json."""
    background_tasks.add_task(_backfill_metadata_task)
    return JSONResponse({"started": True})


@app.get("/api/cached-songs")
async def get_cached_songs():
    """List all songs that have been processed and have saved metadata (for sitemap)."""
    songs = []
    try:
        for d in CACHE_DIR.iterdir():
            if not d.is_dir():
                continue
            meta_file = d / "metadata.json"
            if meta_file.exists():
                try:
                    songs.append(json.loads(meta_file.read_text()))
                except Exception:
                    pass
    except Exception:
        pass
    return JSONResponse({"songs": songs})


@app.get("/api/cached-drums")
async def get_cached_drums():
    """List all songs that have no_drums.mp3 cached (for sitemap)."""
    songs = []
    try:
        for d in CACHE_DIR.iterdir():
            if not d.is_dir() or not (d / "no_drums.mp3").exists():
                continue
            meta_file = d / "metadata.json"
            if not meta_file.exists():
                continue
            try:
                meta = json.loads(meta_file.read_text())
                bpm_file = d / "bpm.json"
                if bpm_file.exists():
                    try:
                        meta["bpm"] = json.loads(bpm_file.read_text()).get("bpm")
                    except Exception:
                        pass
                songs.append(meta)
            except Exception:
                pass
    except Exception:
        pass
    return JSONResponse({"songs": songs})


@app.get("/api/processed")
async def check_processed(ids: str = ""):
    """Return which video IDs already have AI-processed instrumental cached."""
    if not ids:
        return JSONResponse({"processed": []})
    video_ids = [v.strip() for v in ids.split(",") if v.strip()]
    processed = [vid for vid in video_ids if (CACHE_DIR / vid / "instrumental.mp3").exists()]
    return JSONResponse({"processed": processed})


@app.get("/api/processed-drums")
async def check_processed_drums(ids: str = ""):
    """Return which video IDs already have no_drums.mp3 cached."""
    if not ids:
        return JSONResponse({"processed": []})
    video_ids = [v.strip() for v in ids.split(",") if v.strip()]
    processed = [vid for vid in video_ids if (CACHE_DIR / vid / "no_drums.mp3").exists()]
    return JSONResponse({"processed": processed})


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
        headers={"Cache-Control": "public, max-age=86400"},
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
        headers={"Cache-Control": "public, max-age=86400"},
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
    from urllib.parse import quote

    if not artist and not title:
        return JSONResponse({"lrc": None, "lyrics": None})

    art = artist.strip()
    tit = title.strip()

    async def _lrclib_search(client: httpx.AsyncClient, q: str):
        headers = {"Lrclib-Client": "KaraokeNow/1.0"}
        r = await client.get(f"https://lrclib.net/api/search?q={quote(q)}", headers=headers)
        if r.status_code == 200:
            results = r.json()
            if results:
                best = results[0]
                return best.get("syncedLyrics") or None, best.get("plainLyrics") or None
        return None, None

    async def _lrclib_exact(client: httpx.AsyncClient, a: str, t: str):
        headers = {"Lrclib-Client": "KaraokeNow/1.0"}
        url = f"https://lrclib.net/api/get?artist_name={quote(a)}&track_name={quote(t)}"
        r = await client.get(url, headers=headers)
        if r.status_code == 200:
            d = r.json()
            return d.get("syncedLyrics") or None, d.get("plainLyrics") or None
        return None, None

    async def _try_ovh(client: httpx.AsyncClient, a: str, t: str):
        if not a or not t:
            return None
        try:
            r = await client.get(f"https://api.lyrics.ovh/v1/{quote(a)}/{quote(t)}", timeout=8)
            if r.status_code == 200:
                return r.json().get("lyrics") or None
        except Exception:
            pass
        return None

    async def _try_textyl(client: httpx.AsyncClient, q: str):
        try:
            r = await client.get(f"https://api.textyl.co/api/lyrics?q={quote(q)}", timeout=8)
            if r.status_code == 200:
                lines = r.json()
                if isinstance(lines, list) and lines:
                    def _fmt(s: float) -> str:
                        m2 = int(s) // 60
                        return f"[{m2:02d}:{s - m2*60:05.2f}]"
                    lrc = "\n".join(
                        f"{_fmt(ln['seconds'])}{ln['lyrics']}"
                        for ln in lines if "seconds" in ln and "lyrics" in ln
                    )
                    return lrc or None
        except Exception:
            pass
        return None

    try:
        async with httpx.AsyncClient(timeout=10) as client:

            # ── Step 0: normalize artist+title via iTunes ──────────────────────
            # iTunes returns the real artistName/trackName regardless of how
            # messy the input is (karaoke channel names, wrong order, etc.)
            itunes_art, itunes_tit = art, tit
            try:
                q_itunes = f"{art} {tit}".strip() if art else tit
                ir = await client.get(
                    f"https://itunes.apple.com/search"
                    f"?term={quote(q_itunes)}&media=music&entity=song&limit=1",
                    timeout=6,
                )
                if ir.status_code == 200:
                    hits = ir.json().get("results", [])
                    if hits:
                        itunes_art = hits[0].get("artistName", art) or art
                        itunes_tit = hits[0].get("trackName",  tit) or tit
            except Exception:
                pass  # use original values

            # ── 1. lrclib exact — with iTunes-normalized names ─────────────────
            lrc, lyrics = await _lrclib_exact(client, itunes_art, itunes_tit)
            if lrc or lyrics:
                return JSONResponse({"lrc": lrc, "lyrics": lyrics})

            # ── 2. lrclib fuzzy — iTunes names ────────────────────────────────
            lrc, lyrics = await _lrclib_search(client, f"{itunes_art} {itunes_tit}")
            if lrc or lyrics:
                return JSONResponse({"lrc": lrc, "lyrics": lyrics})

            # ── 3. lrclib fuzzy — original parsed names (fallback) ────────────
            if (itunes_art, itunes_tit) != (art, tit):
                lrc, lyrics = await _lrclib_search(client, f"{art} {tit}".strip())
                if lrc or lyrics:
                    return JSONResponse({"lrc": lrc, "lyrics": lyrics})

            # ── 4. lrclib fuzzy — title only ──────────────────────────────────
            lrc, lyrics = await _lrclib_search(client, itunes_tit or tit)
            if lrc or lyrics:
                return JSONResponse({"lrc": lrc, "lyrics": lyrics})

            # ── 5. lyrics.ovh ─────────────────────────────────────────────────
            plain = await _try_ovh(client, itunes_art, itunes_tit)
            if plain:
                return JSONResponse({"lrc": None, "lyrics": plain})

            if not art:
                words = tit.split()
                for split_at in (2, 1, 3):
                    if len(words) > split_at:
                        plain = await _try_ovh(client, " ".join(words[:split_at]), " ".join(words[split_at:]))
                        if plain:
                            return JSONResponse({"lrc": None, "lyrics": plain})

            # ── 6. textyl.co ──────────────────────────────────────────────────
            lrc = await _try_textyl(client, f"{itunes_art} {itunes_tit}".strip())
            if lrc:
                return JSONResponse({"lrc": lrc, "lyrics": None})

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
    "gospel":    22,
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


@app.post("/api/drums/{video_id}")
async def start_drums(video_id: str, request: Request, background_tasks: BackgroundTasks, meta: Optional[SongMeta] = None):
    """Kick off drum-removal job and return a job_id to poll."""
    ip = request.client.host if request.client else "unknown"
    if not _check_rate_limit(ip):
        raise HTTPException(status_code=429, detail="Muitas requisições. Tente novamente em instantes.")
    title     = (meta.title     or "") if meta else ""
    channel   = (meta.channel   or "") if meta else ""
    thumbnail = (meta.thumbnail or "") if meta else ""

    cached = CACHE_DIR / video_id / "no_drums.mp3"
    if cached.exists():
        job_id = str(uuid.uuid4())
        bpm_val: Optional[float] = None
        bpm_file = CACHE_DIR / video_id / "bpm.json"
        if bpm_file.exists():
            try:
                bpm_val = json.loads(bpm_file.read_text()).get("bpm")
            except Exception:
                pass
        drum_jobs[job_id] = {"status": "done", "audio_path": str(cached), "bpm": bpm_val, "error": None}
        if title or channel:
            meta_file = CACHE_DIR / video_id / "metadata.json"
            if not meta_file.exists():
                meta_file.write_text(json.dumps({
                    "video_id": video_id, "title": title, "channel": channel,
                    "thumbnail": thumbnail or f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg",
                    "processed_at": time.time(),
                }))
        return JSONResponse({"job_id": job_id, "status": "done", "bpm": bpm_val})

    if video_id in video_to_drum_job:
        existing = video_to_drum_job[video_id]
        if existing in drum_jobs:
            j = drum_jobs[existing]
            return JSONResponse({"job_id": existing, "status": j["status"], "bpm": j.get("bpm")})

    job_id = str(uuid.uuid4())
    drum_jobs[job_id] = {"status": "pending", "audio_path": None, "bpm": None, "error": None}
    video_to_drum_job[video_id] = job_id

    async def _run():
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(executor, _drums_sync, job_id, video_id, title, channel, thumbnail)

    background_tasks.add_task(_run)
    return JSONResponse({"job_id": job_id, "status": "pending", "bpm": None})


@app.get("/api/drums/job/{job_id}")
async def get_drum_job(job_id: str):
    """Poll drum job status."""
    job = drum_jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job não encontrado. O servidor pode ter sido reiniciado — tente processar a música novamente.")
    return JSONResponse({
        "job_id": job_id,
        "status": job["status"],
        "audio_url": f"/api/audio/no-drums/{job_id}" if job["status"] == "done" else None,
        "bpm": job.get("bpm"),
        "error": job.get("error"),
    })


@app.delete("/api/drums/job/{job_id}")
async def cleanup_drum_job(job_id: str):
    """Remove drum job from memory. Cache files are kept."""
    job_dir = TEMP_DIR / job_id
    if job_dir.exists():
        shutil.rmtree(job_dir, ignore_errors=True)
    drum_jobs.pop(job_id, None)
    return JSONResponse({"deleted": True})


@app.get("/api/audio/no-drums/{job_id}")
async def stream_no_drums(job_id: str):
    """Stream the no-drums instrumental MP3."""
    job = drum_jobs.get(job_id)
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
        filename="no_drums.mp3",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@app.get("/health")
async def health():
    return {"status": "ok"}
