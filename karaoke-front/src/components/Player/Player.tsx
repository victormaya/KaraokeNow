"use client";

import Image from "next/image";
import {
  useRef,
  useState,
  useEffect,
  useCallback,
  MouseEvent as RMouseEvent,
} from "react";
import type { Song, JobStatus } from "@/types";
import styles from "./Player.module.css";

interface Props {
  song: Song;
  jobStatus: JobStatus;
  karaokeUrl: string | null;   // instrumental ready
  jobError: string | null;
  onRemoveVocals: () => void;
}

function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

const STATUS_LABEL: Record<string, string> = {
  pending:     "Iniciando…",
  downloading: "Baixando áudio…",
  separating:  "Removendo vocais (1–2 min)…",
};

export default function Player({
  song,
  jobStatus,
  karaokeUrl,
  jobError,
  onRemoveVocals,
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);

  const [playing, setPlaying]     = useState(false);
  const [loading, setLoading]     = useState(true);   // buffering
  const [current, setCurrent]     = useState(0);
  const [duration, setDuration]   = useState(0);
  const [volume, setVolume]       = useState(1);
  const [karaokeMode, setKaraokeMode] = useState(false);

  // ── Switch source whenever song or karaoke URL changes ────────────
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    setLoading(true);
    setCurrent(0);
    setDuration(0);
    setPlaying(false);

    el.src = karaokeUrl ?? `/api/stream/${song.id}`;
    setKaraokeMode(!!karaokeUrl);

    // Don't call el.load() — it cancels the pending play() causing AbortError
    el.play()
      .then(() => { setPlaying(true); setLoading(false); })
      .catch(() => { setPlaying(false); setLoading(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.id, karaokeUrl]);

  // Sync volume
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el || loading) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      el.play().catch(() => {});
      setPlaying(true);
    }
  }, [playing, loading]);

  function handleSeek(e: RMouseEvent<HTMLDivElement>) {
    const el = audioRef.current;
    if (!el || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    el.currentTime = ratio * duration;
  }

  const isProcessing = ["pending", "downloading", "separating"].includes(jobStatus);
  const canRemove    = jobStatus === "idle" && !isProcessing;

  return (
    <div className={styles.dock} role="region" aria-label="Player de karaokê">
      <audio
        ref={audioRef}
        onTimeUpdate={() => setCurrent(audioRef.current?.currentTime ?? 0)}
        onLoadedMetadata={() => {
          setDuration(audioRef.current?.duration ?? 0);
          setLoading(false);
        }}
        onWaiting={() => setLoading(true)}
        onCanPlay={() => setLoading(false)}
        onEnded={() => setPlaying(false)}
        onError={() => { setLoading(false); setPlaying(false); }}
        preload="auto"
      />

      <div className={styles.inner}>
        {/* ── Left: song info ─────────────────────────────── */}
        <div className={styles.songInfo}>
          <Image
            src={song.thumbnail}
            alt={song.title}
            width={48}
            height={48}
            className={styles.thumb}
            unoptimized
          />
          <div className={styles.meta}>
            <p className={styles.title}>{song.title}</p>
            <p className={styles.channel}>{song.channel}</p>
            {karaokeMode && jobStatus === "done" && (
              <span className={styles.karaokeBadge}>🎤 Karaokê — sem vocais</span>
            )}
          </div>
        </div>

        {/* ── Centre: playback controls ────────────────────── */}
        <div className={styles.controls}>
          <div className={styles.playRow}>
            {/* Rewind 10s */}
            <button
              className={styles.iconBtn}
              onClick={() => { if (audioRef.current) audioRef.current.currentTime -= 10; }}
              aria-label="Voltar 10s"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 .49-3.5" />
              </svg>
            </button>

            {/* Play / Pause */}
            <button
              className={styles.playBtn}
              onClick={togglePlay}
              aria-label={playing ? "Pausar" : "Reproduzir"}
            >
              {loading ? (
                <span className={styles.btnSpinner} aria-hidden />
              ) : playing ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
              )}
            </button>

            {/* Forward 10s */}
            <button
              className={styles.iconBtn}
              onClick={() => { if (audioRef.current) audioRef.current.currentTime += 10; }}
              aria-label="Avançar 10s"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-.49-3.5" />
              </svg>
            </button>
          </div>

          {/* Progress bar */}
          <div className={styles.progressRow}>
            <span className={styles.time}>{fmtTime(current)}</span>
            <div
              className={styles.trackBg}
              onClick={handleSeek}
              role="slider"
              aria-valuemin={0}
              aria-valuemax={duration || 100}
              aria-valuenow={current}
              aria-label="Progresso"
              tabIndex={0}
            >
              <div
                className={styles.trackFill}
                style={{ width: duration ? `${(current / duration) * 100}%` : "0%" }}
              />
            </div>
            <span className={styles.time}>{fmtTime(duration)}</span>
          </div>
        </div>

        {/* ── Right: karaoke button + volume ──────────────── */}
        <div className={styles.actions}>
          {/* Volume */}
          <div className={styles.volumeRow}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ color: "var(--text-muted)" }}>
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
            <input
              type="range"
              className={styles.volumeSlider}
              min={0} max={1} step={0.01}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              aria-label="Volume"
            />
          </div>

          {/* Processing status */}
          {isProcessing && (
            <div className={styles.statusRow}>
              <span className={styles.spinner} aria-hidden />
              <span>{STATUS_LABEL[jobStatus] ?? "Processando…"}</span>
            </div>
          )}

          {/* Error */}
          {jobStatus === "error" && (
            <div className={styles.errorText}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{jobError ? `Erro: ${jobError}` : "Erro. Tente novamente."}</span>
            </div>
          )}

          {/* Karaoke button */}
          <button
            className={`${styles.karaokeBtn} ${karaokeMode && jobStatus === "done" ? styles.active : ""}`}
            onClick={onRemoveVocals}
            disabled={!canRemove}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
            {isProcessing
              ? "Processando…"
              : jobStatus === "done"
              ? "✓ Vocais Removidos"
              : "Remover Vocais"}
          </button>
        </div>
      </div>
    </div>
  );
}
