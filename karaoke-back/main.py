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
from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware

import yt_dlp

# ─────────────────────────────────────────────
# App setup
# ─────────────────────────────────────────────

app = FastAPI(title="Karaoke API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TEMP_DIR = Path(tempfile.gettempdir()) / "karaoke_jobs"
TEMP_DIR.mkdir(exist_ok=True)

REPLICATE_API_TOKEN = os.environ.get("REPLICATE_API_TOKEN", "")
COOKIES_FILE = Path(os.environ.get("COOKIES_FILE", "/app/cookies.txt"))

# In-memory job store  { job_id: { status, audio_path, error } }
jobs: dict[str, dict] = {}


def _base_ydl_opts() -> dict:
    opts: dict = {"quiet": True, "no_warnings": True}
    if COOKIES_FILE.is_file() and COOKIES_FILE.stat().st_size > 0:
        opts["cookiefile"] = str(COOKIES_FILE)
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


# ── Stream helpers ────────────────────────────────────────────────────────────

EXT_TO_MIME = {
    "webm": "audio/webm",
    "m4a":  "audio/mp4",
    "mp4":  "audio/mp4",
    "opus": "audio/ogg",
    "ogg":  "audio/ogg",
    "mp3":  "audio/mpeg",
}

def _get_stream_info(video_id: str) -> dict:
    """Return the best audio direct URL + mime type for a video."""
    ydl_opts = _base_ydl_opts()
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(
            f"https://www.youtube.com/watch?v={video_id}",
            download=False,
        )

    best_audio = None
    best_abr = -1

    for fmt in (info.get("formats") or []):
        if not fmt.get("url"):
            continue
        has_audio = fmt.get("acodec") not in (None, "none")
        no_video  = fmt.get("vcodec") in (None, "none")
        abr = fmt.get("abr") or 0
        if has_audio and no_video and abr > best_abr:
            best_audio = fmt
            best_abr = abr

    if best_audio is None:
        for fmt in (info.get("formats") or []):
            if fmt.get("url") and fmt.get("acodec") not in (None, "none"):
                best_audio = fmt
                break

    if best_audio is None:
        raise ValueError("No streamable audio URL found for this video.")

    url = best_audio["url"]
    ext = best_audio.get("ext", "webm")
    return {"url": url, "mime": EXT_TO_MIME.get(ext, "audio/webm")}



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
            "format": "bestaudio[abr<=96]/bestaudio[abr<=128]/bestaudio/best",
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

        # ── 3. Save instrumental ──────────────────────────────────────────
        instrumental = job_dir / "instrumental.mp3"
        instrumental.write_bytes(output["other"].read())

        downloaded.unlink(missing_ok=True)

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


# ─────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────

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


@app.get("/api/stream/{video_id}")
async def stream_youtube_audio(video_id: str, request: Request):
    """
    Proxy YouTube audio stream to the browser.
    Needed because YouTube CDN blocks direct cross-origin requests.
    """
    loop = asyncio.get_running_loop()
    try:
        info = await loop.run_in_executor(executor, _get_stream_info, video_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    direct_url: str = info["url"]
    mime: str = info["mime"]

    upstream_headers = {"User-Agent": "Mozilla/5.0"}
    range_header = request.headers.get("range")
    if range_header:
        upstream_headers["Range"] = range_header

    client = httpx.AsyncClient(follow_redirects=True, timeout=60)
    resp = await client.send(
        client.build_request("GET", direct_url, headers=upstream_headers),
        stream=True,
    )

    response_headers = {"Cache-Control": "no-cache", "Accept-Ranges": "bytes"}
    for h in ("content-range", "content-length"):
        if h in resp.headers:
            response_headers[h] = resp.headers[h]

    async def generator():
        try:
            async for chunk in resp.aiter_bytes(16_384):
                yield chunk
        finally:
            await resp.aclose()
            await client.aclose()

    return StreamingResponse(
        generator(),
        status_code=resp.status_code,
        media_type=mime,
        headers=response_headers,
    )


@app.post("/api/process/{video_id}")
async def start_processing(video_id: str, background_tasks: BackgroundTasks):
    """Kick off vocal-removal job and return a job_id to poll."""
    job_id = str(uuid.uuid4())
    jobs[job_id] = {"status": "pending", "audio_path": None, "error": None}

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


@app.delete("/api/job/{job_id}")
async def cleanup_job(job_id: str):
    """Delete temp files for a finished job."""
    job_dir = TEMP_DIR / job_id
    if job_dir.exists():
        shutil.rmtree(job_dir, ignore_errors=True)
    jobs.pop(job_id, None)
    return JSONResponse({"deleted": True})


@app.get("/api/lyrics")
async def get_lyrics(artist: str = "", title: str = ""):
    """Proxy to lyrics.ovh — avoids browser CORS issues."""
    from urllib.parse import quote
    if not artist and not title:
        return JSONResponse({"lyrics": ""})
    try:
        url = f"https://api.lyrics.ovh/v1/{quote(artist.strip())}/{quote(title.strip())}"
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                return JSONResponse({"lyrics": data.get("lyrics", "")})
    except Exception:
        pass
    return JSONResponse({"lyrics": ""})


@app.get("/health")
async def health():
    return {"status": "ok"}
