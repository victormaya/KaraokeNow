#!/usr/bin/env python3
"""
Pre-warm KaraokeNow cache with trending songs.

Fetches trending charts for all genres, searches each track on YouTube,
then processes them in parallel so future users hit cache immediately.

Usage (on the VPS):
  python3 /app/karaoke/prewarm.py
  python3 /app/karaoke/prewarm.py --workers 2
  python3 /app/karaoke/prewarm.py --genres top sertanejo funk
  python3 /app/karaoke/prewarm.py --dry-run      # only lists songs, no processing
"""

import argparse
import concurrent.futures
import sys
import time

import requests

GENRES = ["top", "sertanejo", "funk", "pagode", "forro", "rap", "mpb"]

POLL_INTERVAL   = 8    # seconds between status polls
SEARCH_DELAY    = 0.4  # seconds between YouTube searches (avoid rate limit)
REQUEST_TIMEOUT = 40


def fetch_trending(base_url: str, genre: str) -> list[dict]:
    r = requests.get(f"{base_url}/api/trending", params={"genre": genre}, timeout=REQUEST_TIMEOUT)
    r.raise_for_status()
    return r.json().get("results", [])


def search_youtube(base_url: str, query: str) -> dict | None:
    r = requests.get(f"{base_url}/api/search", params={"q": query, "limit": 1}, timeout=REQUEST_TIMEOUT)
    r.raise_for_status()
    results = r.json().get("results", [])
    return results[0] if results else None


def process_and_wait(base_url: str, video_id: str, max_retries: int = 4) -> tuple[bool, str]:
    """Start processing and block until done or error. Returns (ok, reason)."""
    for attempt in range(max_retries):
        try:
            r = requests.post(f"{base_url}/api/process/{video_id}", timeout=REQUEST_TIMEOUT)
            r.raise_for_status()
            data = r.json()
            break
        except Exception as e:
            if attempt == max_retries - 1:
                return False, str(e)
            time.sleep(5 * (attempt + 1))
    else:
        return False, "falha ao iniciar"

    if data["status"] == "done":
        return True, "cached"

    job_id = data["job_id"]
    consecutive_errors = 0
    while True:
        time.sleep(POLL_INTERVAL)
        try:
            r = requests.get(f"{base_url}/api/job/{job_id}", timeout=REQUEST_TIMEOUT)
            r.raise_for_status()
            job = r.json()
            consecutive_errors = 0
        except Exception:
            consecutive_errors += 1
            if consecutive_errors >= 4:
                return False, "backend inacessível durante processamento"
            continue

        status = job["status"]
        if status == "done":
            return True, "processed"
        if status == "error":
            return False, job.get("error") or "erro desconhecido"


def collect_tracks(base_url: str, genres: list[str]) -> dict[str, str]:
    """Return {video_id: title} for top YouTube result of each trending track."""
    tracks: dict[str, str] = {}

    for genre in genres:
        print(f"\n  [{genre}] buscando trending…")
        try:
            trending = fetch_trending(base_url, genre)
        except Exception as e:
            print(f"    ⚠  erro ao buscar trending: {e}")
            continue

        for track in trending:
            query = f"{track['name']} {track['artist']}"
            time.sleep(SEARCH_DELAY)
            try:
                song = search_youtube(base_url, query)
            except Exception as e:
                print(f"    ⚠  busca falhou ({query[:40]}): {e}")
                continue

            if not song:
                continue

            vid = song["id"]
            if vid not in tracks:
                tracks[vid] = song.get("title", query)
                print(f"    + {tracks[vid][:70]}")

    return tracks


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Pre-warm KaraokeNow cache with trending songs",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--base-url",
        default="http://localhost:8000",
        help="Backend URL (default: http://localhost:8000)",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=2,
        help="Parallel processing jobs (default: 2; max recommended: 4)",
    )
    parser.add_argument(
        "--genres",
        nargs="+",
        default=GENRES,
        metavar="GENRE",
        help=f"Genres to fetch (default: all — {' '.join(GENRES)})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only list songs that would be processed, don't actually process",
    )
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")

    print("🎤  KaraokeNow Pre-Warmer")
    print(f"    Backend : {base_url}")
    print(f"    Workers : {args.workers}")
    print(f"    Gêneros : {', '.join(args.genres)}")
    if args.dry_run:
        print("    Modo    : DRY RUN (não vai processar)")

    # ── Phase 1: collect unique tracks ───────────────────────────────────────
    print("\n─── Coletando músicas trending ───────────────────────────────────────")
    try:
        tracks = collect_tracks(base_url, args.genres)
    except KeyboardInterrupt:
        print("\nInterrompido.")
        sys.exit(0)

    total = len(tracks)
    print(f"\n📋  {total} músicas únicas encontradas")

    if not total:
        print("Nenhuma música encontrada. Verifique se o backend está rodando.")
        sys.exit(1)

    if args.dry_run:
        print("\nDry run concluído. Nenhuma música foi processada.")
        sys.exit(0)

    # ── Phase 2: process in parallel ─────────────────────────────────────────
    print("\n─── Processando ──────────────────────────────────────────────────────")

    done_count    = 0
    cached_count  = 0
    failed_count  = 0
    lock_counters = __import__("threading").Lock()

    def process_one(item: tuple[str, str]) -> tuple[str, str, bool, str]:
        video_id, title = item
        try:
            ok, reason = process_and_wait(base_url, video_id)
            return video_id, title, ok, reason
        except Exception as e:
            return video_id, title, False, str(e)

    start_time = time.time()
    items = list(tracks.items())

    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = {pool.submit(process_one, item): item for item in items}
            completed = 0
            for future in concurrent.futures.as_completed(futures):
                completed += 1
                video_id, title, ok, reason = future.result()
                short = title[:58] if len(title) <= 58 else title[:55] + "…"
                tag = f"[{completed}/{total}]"

                with lock_counters:
                    if ok and reason == "cached":
                        cached_count += 1
                        print(f"  {tag} ✓ (já em cache) {short}")
                    elif ok:
                        done_count += 1
                        print(f"  {tag} ✓ {short}")
                    else:
                        failed_count += 1
                        print(f"  {tag} ✗ {short}")
                        print(f"       erro: {reason}")

    except KeyboardInterrupt:
        print("\n\nInterrompido pelo usuário.")

    elapsed = time.time() - start_time
    mins, secs = divmod(int(elapsed), 60)

    print(f"""
─── Resultado ─────────────────────────────────────────────────────────
  ✓ Processadas   : {done_count}
  ✓ Já em cache   : {cached_count}
  ✗ Falhas        : {failed_count}
  ⏱  Tempo total  : {mins}m {secs}s
───────────────────────────────────────────────────────────────────────
""")


if __name__ == "__main__":
    main()
