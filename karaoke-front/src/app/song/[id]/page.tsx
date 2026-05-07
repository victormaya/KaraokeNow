"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import type { JobStatus } from "@/types";
import styles from "./page.module.css";

interface LrcLine { time: number; text: string; }

function parseLrc(lrc: string): LrcLine[] {
  const re = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;
  const lines: LrcLine[] = [];
  for (const raw of lrc.split("\n")) {
    const m = raw.match(re);
    if (!m) continue;
    const time = parseInt(m[1]) * 60 + parseInt(m[2]) + parseInt(m[3]) / (m[3].length === 3 ? 1000 : 100);
    const text = m[4].trim();
    if (text) lines.push({ time, text });
  }
  return lines.sort((a, b) => a.time - b.time);
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

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

export default function SongPage() {
  const params       = useParams();
  const searchParams = useSearchParams();
  const router       = useRouter();

  const videoId   = params.id as string;
  const title     = searchParams.get("title")     ?? "";
  const channel   = searchParams.get("channel")   ?? "";
  const thumbnail = searchParams.get("thumbnail") ?? "";

  // ── Job state ────────────────────────────────────────────────────────────
  const [jobStatus,  setJobStatus]  = useState<JobStatus>("pending");
  const [progress,   setProgress]   = useState(0);
  const [karaokeUrl, setKaraokeUrl] = useState<string | null>(null);
  const [jobError,   setJobError]   = useState<string | null>(null);
  const [ready,      setReady]      = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Lyrics ───────────────────────────────────────────────────────────────
  const [lrcLines,      setLrcLines]      = useState<LrcLine[]>([]);
  const [lyrics,        setLyrics]        = useState<string | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(true);
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([]);

  // ── YouTube IFrame Player ─────────────────────────────────────────────────
  const ytContainerRef = useRef<HTMLDivElement>(null);
  const ytPlayerRef    = useRef<any>(null);
  const [ytReady,      setYtReady]      = useState(false);
  const timePollerRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Karaoke audio ─────────────────────────────────────────────────────────
  const karaokeRef = useRef<HTMLAudioElement>(null);

  // ── Player state ──────────────────────────────────────────────────────────
  const [playing,      setPlaying]      = useState(false);
  const [karaokeMode,  setKaraokeMode]  = useState(true);
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

  // ── Start job & lyrics on mount ──────────────────────────────────────────
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
      // Cache hit: backend already returns status "done"
      if (data.status === "done") {
        setJobStatus("done");
        setKaraokeUrl(`/api/audio/${data.job_id}`);
        setTimeout(() => setReady(true), 600);
      } else {
        startPolling(data.job_id);
      }
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
        if (data.lrc) {
          setLrcLines(parseLrc(data.lrc));
        } else {
          setLyrics(data.lyrics || null);
        }
      }
    } catch { /* ignore */ }
    setLyricsLoading(false);
  }

  const activeLineIdx = useMemo(() => {
    if (!lrcLines.length) return -1;
    let idx = -1;
    for (let i = 0; i < lrcLines.length; i++) {
      if (lrcLines[i].time <= current) idx = i;
      else break;
    }
    return idx;
  }, [lrcLines, current]);

  useEffect(() => {
    if (activeLineIdx >= 0 && lineRefs.current[activeLineIdx]) {
      lineRefs.current[activeLineIdx]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeLineIdx]);

  // ── Load YouTube IFrame API when job is done ──────────────────────────────
  useEffect(() => {
    if (!ready) return;

    const initPlayer = () => {
      if (!ytContainerRef.current) return;
      ytPlayerRef.current = new window.YT.Player(ytContainerRef.current, {
        videoId,
        playerVars: { autoplay: 0, controls: 0, disablekb: 1, fs: 0, playsinline: 1 },
        events: {
          onReady: () => {
            setYtReady(true);
            setDuration(ytPlayerRef.current.getDuration());
          },
          onStateChange: (e: any) => {
            if (e.data === window.YT.PlayerState.ENDED)    setPlaying(false);
            if (e.data === window.YT.PlayerState.BUFFERING && !karaokeMode) setAudioLoading(true);
            if (e.data === window.YT.PlayerState.PLAYING   && !karaokeMode) setAudioLoading(false);
          },
        },
      });
    };

    if (window.YT?.Player) {
      initPlayer();
    } else {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
      window.onYouTubeIframeAPIReady = initPlayer;
    }

    return () => { ytPlayerRef.current?.destroy?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, videoId]);

  // ── Load karaoke audio when ready ─────────────────────────────────────────
  useEffect(() => {
    if (!ready || !karaokeUrl) return;
    const kara = karaokeRef.current;
    if (kara) kara.src = karaokeUrl;
  }, [ready, karaokeUrl]);

  // ── Poll current time when in original (YouTube) mode ────────────────────
  useEffect(() => {
    if (timePollerRef.current) { clearInterval(timePollerRef.current); timePollerRef.current = null; }
    if (!karaokeMode && playing && ytReady) {
      timePollerRef.current = setInterval(() => {
        setCurrent(ytPlayerRef.current?.getCurrentTime?.() ?? 0);
      }, 250);
    }
    return () => { if (timePollerRef.current) clearInterval(timePollerRef.current); };
  }, [karaokeMode, playing, ytReady]);

  // ── Player controls ───────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    if (playing) {
      karaokeRef.current?.pause();
      ytPlayerRef.current?.pauseVideo?.();
      setPlaying(false);
    } else {
      if (karaokeMode) {
        karaokeRef.current?.play().catch(() => {});
      } else {
        ytPlayerRef.current?.playVideo?.();
      }
      setPlaying(true);
    }
  }, [playing, karaokeMode]);

  function seek(pct: number) {
    if (!duration) return;
    const t = pct * duration;
    setCurrent(t);
    if (karaokeRef.current) karaokeRef.current.currentTime = t;
    ytPlayerRef.current?.seekTo?.(t, true);
  }

  function skip(delta: number) {
    const t = Math.max(0, current + delta);
    setCurrent(t);
    if (karaokeRef.current) karaokeRef.current.currentTime = t;
    ytPlayerRef.current?.seekTo?.(t, true);
  }

  function handleTimeUpdate() {
    if (karaokeMode && karaokeRef.current) setCurrent(karaokeRef.current.currentTime);
  }

  // ── Mode switch (sync time between players) ───────────────────────────────
  function switchMode(toKaraoke: boolean) {
    if (toKaraoke === karaokeMode) return;
    if (toKaraoke) {
      const t = ytPlayerRef.current?.getCurrentTime?.() ?? current;
      ytPlayerRef.current?.pauseVideo?.();
      if (karaokeRef.current) {
        karaokeRef.current.currentTime = t;
        if (playing) karaokeRef.current.play().catch(() => {});
      }
    } else {
      const t = karaokeRef.current?.currentTime ?? current;
      karaokeRef.current?.pause();
      ytPlayerRef.current?.seekTo?.(t, true);
      if (playing) ytPlayerRef.current?.playVideo?.();
    }
    setKaraokeMode(toKaraoke);
  }

  // ── Error screen ──────────────────────────────────────────────────────────
  if (jobError) {
    return (
      <div className={styles.errorPage}>
        <p className={styles.errorMsg}>Erro: {jobError}</p>
        <button className={styles.backBtn} onClick={() => router.back()}>← Voltar</button>
      </div>
    );
  }

  // ── Loading screen ────────────────────────────────────────────────────────
  if (!ready) {
    return (
      <div className={styles.loadingPage}>
        <button className={styles.backBtn} onClick={() => router.back()}>← Voltar</button>
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
          <p className={styles.statusText}>{STATUS_LABEL[jobStatus] ?? "Processando…"}</p>
        </div>
      </div>
    );
  }

  // ── Song page (ready) ─────────────────────────────────────────────────────
  return (
    <div className={styles.songPage}>
      <button className={styles.backBtn} onClick={() => router.back()}>← Voltar</button>

      <div className={styles.splitLayout}>
        {/* ── LEFT: Player ───────────────────────────────────────────── */}
        <div className={styles.playerPanel}>

          {/* Thumbnail (karaoke mode) or YouTube iframe (original mode) */}
          <div className={styles.mediaBlock}>
            <div className={styles.songInfo}>
              <div
                className={styles.songThumb}
                style={{ display: karaokeMode ? undefined : "none" }}
              >
                <Image src={thumbnail} alt={title} fill unoptimized />
              </div>
              <div className={styles.songMeta}>
                <h1 className={styles.songTitle}>{title}</h1>
                <p className={styles.songChannel}>{channel}</p>
              </div>
            </div>
            {/* YouTube iframe — visible in original mode, tiny in karaoke mode */}
            <div
              className={styles.ytEmbed}
              style={karaokeMode ? { width: 1, height: 1, overflow: "hidden", opacity: 0, pointerEvents: "none" } : undefined}
            >
              <div ref={ytContainerRef} style={{ width: "100%", height: "100%" }} />
            </div>
          </div>

          {/* Karaoke audio element */}
          <audio
            ref={karaokeRef}
            onLoadedMetadata={() => {
              if (!duration && karaokeRef.current) setDuration(karaokeRef.current.duration);
              setAudioLoading(false);
            }}
            onTimeUpdate={handleTimeUpdate}
            onWaiting={() => { if (karaokeMode) setAudioLoading(true); }}
            onCanPlay={() => { if (karaokeMode) setAudioLoading(false); }}
            onEnded={() => setPlaying(false)}
            preload="auto"
          />

          {/* Controls */}
          <div className={styles.controls}>
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
          </div>

          {/* Switch: Original ↔ Karaokê */}
          <div className={styles.switchRow}>
            <span className={`${styles.switchLabel} ${!karaokeMode ? styles.switchLabelActive : ""}`}>
              Original
            </span>
            <button
              className={`${styles.switchTrack} ${karaokeMode ? styles.switchOn : ""}`}
              onClick={() => switchMode(!karaokeMode)}
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
            {karaokeMode ? "Sem vocais — cante você!" : "Versão original com vocais"}
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
          ) : lrcLines.length > 0 ? (
            <div className={styles.lyricsLines}>
              {lrcLines.map((line, i) => (
                <p
                  key={i}
                  ref={el => { lineRefs.current[i] = el; }}
                  className={[
                    styles.lyricsLine,
                    i === activeLineIdx ? styles.lyricsLineActive : "",
                    i < activeLineIdx  ? styles.lyricsLinePast   : "",
                  ].join(" ")}
                >
                  {line.text}
                </p>
              ))}
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
