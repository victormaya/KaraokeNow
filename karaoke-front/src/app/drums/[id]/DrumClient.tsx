"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import { usePlayer } from "@/context/PlayerContext";
import styles from "./page.module.css";

const STATUS_LABEL: Record<string, string> = {
  pending:     "Iniciando processamento…",
  downloading: "Baixando áudio…",
  separating:  "Removendo bateria com IA…",
  done:        "Concluído!",
};

const PROGRESS_TARGETS: Record<string, number> = {
  pending: 8, downloading: 45, separating: 88, done: 100,
};

export default function DrumClient() {
  const params       = useParams();
  const searchParams = useSearchParams();
  const router       = useRouter();
  const player       = usePlayer();

  const videoId   = params.id as string;
  const title     = searchParams.get("title")     ?? "";
  const channel   = searchParams.get("channel")   ?? "";
  const thumbnail = searchParams.get("thumbnail") ?? "";

  // Apply drums colour theme to the whole page (including GlobalPlayer)
  useEffect(() => {
    document.documentElement.dataset.theme = "drums";
    return () => { delete document.documentElement.dataset.theme; };
  }, []);

  const [jobStatus, setJobStatus] = useState<string>("pending");
  const [progress,  setProgress]  = useState(0);
  const [audioUrl,  setAudioUrl]  = useState<string | null>(null);
  const [bpm,       setBpm]       = useState<number | null>(null);
  const [jobError,  setJobError]  = useState<string | null>(null);
  const [ready,     setReady]     = useState(player.track?.id === videoId);
  const [speed,     setSpeed]     = useState(1);

  const pollingRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Progress animation
  useEffect(() => {
    const target = PROGRESS_TARGETS[jobStatus] ?? 0;
    if (jobStatus === "done") { setProgress(100); return; }
    const id = setInterval(() => {
      setProgress(prev => prev < target ? Math.min(prev + 0.5, target) : prev);
    }, 400);
    return () => clearInterval(id);
  }, [jobStatus]);

  // Start job on mount
  useEffect(() => {
    startJob();
    return () => {
      clearPolling();
      if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset playback speed on unmount
  useEffect(() => {
    return () => {
      if (player.audioRef.current)    player.audioRef.current.playbackRate    = 1;
      if (player.originalRef.current) player.originalRef.current.playbackRate = 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply speed to both audio elements
  useEffect(() => {
    if (player.audioRef.current)    player.audioRef.current.playbackRate    = speed;
    if (player.originalRef.current) player.originalRef.current.playbackRate = speed;
  }, [speed, player.audioRef, player.originalRef]);

  // Register track in global player when ready
  useEffect(() => {
    if (!ready || !audioUrl) return;
    if (player.track?.id !== videoId) {
      player.setTrack({ id: videoId, title, channel, thumbnail }, audioUrl);
      player.setOriginalTrack(`/api/original/${videoId}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, audioUrl]);

  async function startJob() {
    try {
      const res = await fetch(`/api/drums/${videoId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, channel, thumbnail }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.bpm) setBpm(data.bpm);
      if (data.status === "done") {
        setJobStatus("done");
        setAudioUrl(`/api/audio/no-drums/${data.job_id}`);
        readyTimerRef.current = setTimeout(() => setReady(true), 600);
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
        const res = await fetch(`/api/drums/job/${jobId}`);
        if (res.status === 404) {
          clearPolling();
          setJobError("O servidor foi reiniciado. Por favor, tente novamente.");
          return;
        }
        if (!res.ok) return;
        const job = await res.json();
        setJobStatus(job.status);
        if (job.bpm) setBpm(job.bpm);
        if (job.status === "done") {
          clearPolling();
          setAudioUrl(job.audio_url);
          readyTimerRef.current = setTimeout(() => setReady(true), 600);
        }
        if (job.status === "error") {
          clearPolling();
          setJobError(job.error ?? "Erro desconhecido.");
        }
      } catch { /* keep polling */ }
    }, 2500);
  }

  function clearPolling() {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
  }

  if (jobError) {
    return (
      <div className={styles.errorPage}>
        <p className={styles.errorMsg}>Erro: {jobError}</p>
        <button className={styles.backBtn} onClick={() => router.back()}>← Voltar</button>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className={styles.loadingPage}>
        <button className={styles.backBtn} onClick={() => router.back()}>← Voltar</button>
        <div className={styles.loadingContent}>
          {thumbnail && (
            <div className={styles.loadingThumb}>
              <Image src={thumbnail} alt={title} fill />
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
          {jobStatus === "downloading" || jobStatus === "separating" ? (
            <div className={styles.cacheNotice}>
              <span className={styles.cacheNoticeIcon}>⚡</span>
              <span>Isso acontece só na primeira vez. Próximas reproduções são instantâneas.</span>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const isDrumsOn = !player.karaokeMode;

  return (
    <div className={styles.songPage}>
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => router.back()}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Voltar
        </button>
        <span className={styles.drumsBadge}>🥁 Play Along</span>
      </div>

      <div className={styles.drumLayout}>
        {/* Song info */}
        <div className={styles.songInfo}>
          {thumbnail && (
            <div className={styles.songThumb}>
              <Image src={thumbnail} alt={title} fill />
            </div>
          )}
          <div className={styles.songMeta}>
            <h1 className={styles.songTitle}>{title}</h1>
            <p className={styles.songChannel}>{channel}</p>
            {bpm && <span className={styles.bpmBadge}>🥁 {bpm} BPM</span>}
          </div>
        </div>

        {/* Controls */}
        <div className={styles.controls}>
          {/* Drums toggle */}
          <div className={styles.controlGroup}>
            <p className={styles.controlLabel}>Bateria</p>
            <div className={styles.switchRow}>
              <span className={`${styles.switchLabel} ${!isDrumsOn ? styles.switchLabelActive : ""}`}>
                Sem bateria
              </span>
              <button
                className={`${styles.switchTrack} ${isDrumsOn ? styles.switchOn : ""}`}
                onClick={() => player.switchMode(isDrumsOn)}
                aria-label={isDrumsOn ? "Remover bateria" : "Adicionar bateria"}
              >
                <span className={styles.switchThumb} />
              </button>
              <span className={`${styles.switchLabel} ${isDrumsOn ? styles.switchLabelActive : ""}`}>
                Com bateria
              </span>
            </div>
          </div>

          {/* Speed slider */}
          <div className={styles.controlGroup}>
            <p className={styles.controlLabel}>
              Velocidade: <strong className={styles.speedValue}>{speed.toFixed(2)}x</strong>
            </p>
            <input
              type="range"
              className={styles.speedSlider}
              min={0.5}
              max={1.5}
              step={0.05}
              value={speed}
              onChange={e => setSpeed(parseFloat(e.target.value))}
            />
            <div className={styles.speedMarks}>
              <span>0.5x</span>
              <span>1.0x</span>
              <span>1.5x</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
