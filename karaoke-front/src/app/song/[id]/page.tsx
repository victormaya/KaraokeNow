"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import type { JobStatus } from "@/types";
import styles from "./page.module.css";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function parseSongMeta(rawTitle: string): { artist: string; songTitle: string } {
  const seps = [" - ", " – ", " — "];
  for (const sep of seps) {
    if (rawTitle.includes(sep)) {
      const [first, ...rest] = rawTitle.split(sep);
      const songTitle = rest.join(sep).replace(/\(.*?\)|\[.*?\]/g, "").trim();
      return { artist: first.trim(), songTitle };
    }
  }
  return { artist: "", songTitle: rawTitle.replace(/\(.*?\)|\[.*?\]/g, "").trim() };
}

const STATUS_LABEL: Record<string, string> = {
  pending:     "Iniciando processamento…",
  downloading: "Baixando áudio…",
  separating:  "Removendo vocais com IA…",
  done:        "Concluído!",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function SongPage() {
  const params       = useParams();
  const searchParams = useSearchParams();
  const router       = useRouter();

  const videoId  = params.id as string;
  const title    = searchParams.get("title")    ?? "";
  const channel  = searchParams.get("channel")  ?? "";
  const thumbnail = searchParams.get("thumbnail") ?? "";

  // ── Job state ────────────────────────────────────────────────────────────
  const [jobStatus,  setJobStatus]  = useState<JobStatus>("pending");
  const [progress,   setProgress]   = useState(0);
  const [karaokeUrl, setKaraokeUrl] = useState<string | null>(null);
  const [jobError,   setJobError]   = useState<string | null>(null);
  const [ready,      setReady]      = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Lyrics ───────────────────────────────────────────────────────────────
  const [lyrics,        setLyrics]        = useState<string | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(true);

  // ── Player ───────────────────────────────────────────────────────────────
  const originalRef = useRef<HTMLAudioElement>(null);
  const karaokeRef  = useRef<HTMLAudioElement>(null);
  const [playing,      setPlaying]      = useState(false);
  const [karaokeMode,  setKaraokeMode]  = useState(true);   // true = hear karaoke
  const [current,      setCurrent]      = useState(0);
  const [duration,     setDuration]     = useState(0);
  const [audioLoading, setAudioLoading] = useState(true);

  // ── Progress animation ───────────────────────────────────────────────────
  useEffect(() => {
    const targets: Record<string, number> = {
      pending: 8, downloading: 32, separating: 88, done: 100,
    };
    const target = targets[jobStatus] ?? 0;

    if (jobStatus === "done") { setProgress(100); return; }

    const id = setInterval(() => {
      setProgress(prev => prev < target ? Math.min(prev + 0.4, target) : prev);
    }, 400);

    return () => clearInterval(id);
  }, [jobStatus]);

  // ── Start job & fetch lyrics on mount ────────────────────────────────────
  useEffect(() => {
    startJob();
    fetchLyrics();
    return () => clearPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startJob() {
    try {
      const res = await fetch(`/api/process/${videoId}`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      startPolling(data.job_id);
    } catch (e) {
      setJobError(e instanceof Error ? e.message : String(e));
    }
  }

  function startPolling(jobId: string) {
    clearPolling();
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/job/${jobId}`);
        if (!res.ok) return;
        const job = await res.json();
        setJobStatus(job.status);

        if (job.status === "done") {
          clearPolling();
          setKaraokeUrl(job.audio_url);
          setTimeout(() => setReady(true), 600);
        }
        if (job.status === "error") {
          clearPolling();
          setJobError(job.error ?? "Erro desconhecido.");
        }
      } catch { /* network hiccup, keep polling */ }
    }, 2500);
  }

  function clearPolling() {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
  }

  async function fetchLyrics() {
    setLyricsLoading(true);
    const { artist, songTitle } = parseSongMeta(title);
    try {
      const q = new URLSearchParams({ artist, title: songTitle });
      const res = await fetch(`/api/lyrics?${q}`);
      if (res.ok) {
        const data = await res.json();
        setLyrics(data.lyrics || null);
      }
    } catch { /* ignore */ }
    setLyricsLoading(false);
  }

  // ── Load audio when ready ────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || !karaokeUrl) return;
    const orig = originalRef.current;
    const kara = karaokeRef.current;
    if (!orig || !kara) return;

    orig.src = `/api/stream/${videoId}`;
    kara.src = karaokeUrl;
    orig.muted = karaokeMode;
    kara.muted = !karaokeMode;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, karaokeUrl]);

  // ── Apply mute whenever mode changes ─────────────────────────────────────
  useEffect(() => {
    if (originalRef.current) originalRef.current.muted = karaokeMode;
    if (karaokeRef.current)  karaokeRef.current.muted  = !karaokeMode;
  }, [karaokeMode]);

  // ── Player controls ───────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const orig = originalRef.current;
    const kara = karaokeRef.current;
    if (!orig || !kara) return;
    if (playing) {
      orig.pause(); kara.pause();
      setPlaying(false);
    } else {
      orig.play().catch(() => {});
      kara.play().catch(() => {});
      setPlaying(true);
    }
  }, [playing]);

  function seek(pct: number) {
    if (!duration) return;
    const t = pct * duration;
    if (originalRef.current) originalRef.current.currentTime = t;
    if (karaokeRef.current)  karaokeRef.current.currentTime  = t;
  }

  function skip(delta: number) {
    if (originalRef.current) originalRef.current.currentTime += delta;
    if (karaokeRef.current)  karaokeRef.current.currentTime  += delta;
  }

  function handleTimeUpdate() {
    const kara = karaokeRef.current;
    const orig = originalRef.current;
    if (!kara || !orig) return;
    setCurrent(kara.currentTime);
    // Keep original in sync with karaoke master
    if (Math.abs(kara.currentTime - orig.currentTime) > 0.5) {
      orig.currentTime = kara.currentTime;
    }
  }

  // ── Error screen ──────────────────────────────────────────────────────────
  if (jobError) {
    return (
      <div className={styles.errorPage}>
        <p className={styles.errorMsg}>Erro: {jobError}</p>
        <button className={styles.backBtn} onClick={() => router.back()}>
          ← Voltar
        </button>
      </div>
    );
  }

  // ── Loading screen ────────────────────────────────────────────────────────
  if (!ready) {
    return (
      <div className={styles.loadingPage}>
        <button className={styles.backBtn} onClick={() => router.back()}>
          ← Voltar
        </button>

        <div className={styles.loadingContent}>
          {thumbnail && (
            <div className={styles.loadingThumb}>
              <Image src={thumbnail} alt={title} fill unoptimized />
            </div>
          )}

          <h2 className={styles.loadingTitle}>{title || "Carregando…"}</h2>
          {channel && <p className={styles.loadingChannel}>{channel}</p>}

          <div className={styles.progressWrap}>
            <div className={styles.progressTrack}>
              <div
                className={styles.progressFill}
                style={{
                  width: `${progress}%`,
                  transition: jobStatus === "done" ? "width 0.3s ease" : "width 0.8s ease",
                }}
              />
            </div>
            <span className={styles.progressPct}>{Math.round(progress)}%</span>
          </div>

          <p className={styles.statusText}>
            {STATUS_LABEL[jobStatus] ?? "Processando…"}
          </p>
        </div>
      </div>
    );
  }

  // ── Song page (ready) ─────────────────────────────────────────────────────
  return (
    <div className={styles.songPage}>
      <button className={styles.backBtn} onClick={() => router.back()}>
        ← Voltar
      </button>

      <div className={styles.splitLayout}>

        {/* ── LEFT: Player ───────────────────────────────────────────── */}
        <div className={styles.playerPanel}>
          <div className={styles.songInfo}>
            <div className={styles.songThumb}>
              <Image src={thumbnail} alt={title} fill unoptimized />
            </div>
            <div className={styles.songMeta}>
              <h1 className={styles.songTitle}>{title}</h1>
              <p className={styles.songChannel}>{channel}</p>
            </div>
          </div>

          {/* Hidden audio elements — both play simultaneously */}
          <audio
            ref={originalRef}
            onEnded={() => setPlaying(false)}
            preload="auto"
          />
          <audio
            ref={karaokeRef}
            onLoadedMetadata={() => {
              setDuration(karaokeRef.current?.duration ?? 0);
              setAudioLoading(false);
            }}
            onTimeUpdate={handleTimeUpdate}
            onWaiting={() => setAudioLoading(true)}
            onCanPlay={() => setAudioLoading(false)}
            onEnded={() => setPlaying(false)}
            preload="auto"
          />

          {/* Seek bar */}
          <div
            className={styles.seekBar}
            role="slider"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={duration ? Math.round((current / duration) * 100) : 0}
            tabIndex={0}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              seek((e.clientX - rect.left) / rect.width);
            }}
          >
            <div
              className={styles.seekFill}
              style={{ width: duration ? `${(current / duration) * 100}%` : "0%" }}
            />
          </div>
          <div className={styles.timeRow}>
            <span>{fmtTime(current)}</span>
            <span>{fmtTime(duration)}</span>
          </div>

          {/* Controls */}
          <div className={styles.controls}>
            <button className={styles.iconBtn} onClick={() => skip(-10)} aria-label="Voltar 10s">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 .49-3.5" />
              </svg>
            </button>

            <button
              className={styles.playBtn}
              onClick={togglePlay}
              aria-label={playing ? "Pausar" : "Reproduzir"}
              disabled={audioLoading}
            >
              {audioLoading ? (
                <span className={styles.spinner} aria-hidden />
              ) : playing ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
              )}
            </button>

            <button className={styles.iconBtn} onClick={() => skip(10)} aria-label="Avançar 10s">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-.49-3.5" />
              </svg>
            </button>
          </div>

          {/* Switch: Original ↔ Karaokê */}
          <div className={styles.switchRow}>
            <span className={`${styles.switchLabel} ${!karaokeMode ? styles.switchLabelActive : ""}`}>
              Original
            </span>

            <button
              className={`${styles.switchTrack} ${karaokeMode ? styles.switchOn : ""}`}
              onClick={() => setKaraokeMode(m => !m)}
              aria-label="Alternar entre original e karaokê"
              role="switch"
              aria-checked={karaokeMode}
            >
              <span className={styles.switchThumb} />
            </button>

            <span className={`${styles.switchLabel} ${karaokeMode ? styles.switchLabelActive : ""}`}>
              🎤 Karaokê
            </span>
          </div>

          <p className={styles.switchHint}>
            {karaokeMode
              ? "Sem vocais — cante você!"
              : "Versão original com vocais"}
          </p>
        </div>

        {/* ── RIGHT: Lyrics ───────────────────────────────────────────── */}
        <div className={styles.lyricsPanel}>
          <h2 className={styles.lyricsHeading}>Letra</h2>

          {lyricsLoading ? (
            <div className={styles.lyricsPlaceholder}>
              <span className={styles.spinner} />
              <span>Carregando letra…</span>
            </div>
          ) : lyrics ? (
            <pre className={styles.lyricsText}>{lyrics}</pre>
          ) : (
            <p className={styles.lyricsEmpty}>Letra não encontrada para esta música.</p>
          )}
        </div>

      </div>
    </div>
  );
}
