"use client";

import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { usePlayer } from "@/context/PlayerContext";
import styles from "./GlobalPlayer.module.css";

export default function GlobalPlayer() {
  const {
    track, playing, currentTime, duration, audioLoading,
    play, pause, seek,
    pitch, applyPitch,
    hasOriginal, karaokeMode, switchMode,
  } = usePlayer();
  const router   = useRouter();
  const pathname = usePathname();
  const isDrums  = pathname?.startsWith("/drums") ?? false;

  if (!track) return null;

  const pct = duration ? currentTime / duration : 0;
  const pitchLabel = pitch === 0
    ? "0"
    : `${pitch > 0 ? "+" : ""}${Number.isInteger(pitch) ? pitch : pitch.toFixed(1)}`;

  function handleProgressClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    seek(((e.clientX - rect.left) / rect.width) * duration);
  }

  function goToSong() {
    if (!track) return;
    const params = new URLSearchParams({
      title:     track.title,
      channel:   track.channel,
      thumbnail: track.thumbnail,
    });
    router.push(`/song/${track.id}?${params}`);
  }

  return (
    <div className={styles.player}>
      <div className={styles.progress} onClick={handleProgressClick} role="progressbar">
        <div className={styles.progressFill} style={{ width: `${pct * 100}%` }} />
      </div>

      <div className={styles.inner}>
        {/* Track info */}
        <button className={styles.info} onClick={goToSong}>
          <div className={styles.thumb}>
            <Image src={track.thumbnail} alt={track.title} fill unoptimized sizes="44px" />
          </div>
          <div className={styles.meta}>
            <p className={styles.title}>{track.title}</p>
            <p className={styles.channel}>{track.channel}</p>
          </div>
        </button>

        {/* Controls */}
        <div className={styles.controls}>
          {/* Voice / drums toggle */}
          {hasOriginal && (
            <button
              className={`${styles.modeBtn} ${(isDrums ? !karaokeMode : karaokeMode) ? styles.modeBtnActive : ""}`}
              onClick={() => switchMode(!karaokeMode)}
              title={isDrums
                ? (!karaokeMode ? "Com bateria (clique para remover)" : "Sem bateria (clique para adicionar)")
                : (karaokeMode ? "Modo karaokê (sem voz)" : "Modo original (com voz)")}
            >
              {isDrums ? "🥁" : (karaokeMode ? "🎤" : "🎵")}
            </button>
          )}

          {/* Pitch — hidden in drums mode */}
          {!isDrums && (
            <div className={styles.pitch}>
              <button
                className={styles.pitchBtn}
                onClick={() => applyPitch(Math.max(-12, pitch - 0.5))}
                aria-label="Diminuir tom"
              >♭</button>
              <span className={styles.pitchVal}>{pitchLabel}<span className={styles.pitchUnit}>st</span></span>
              <button
                className={styles.pitchBtn}
                onClick={() => applyPitch(Math.min(12, pitch + 0.5))}
                aria-label="Aumentar tom"
              >♯</button>
            </div>
          )}

          {/* Skip backward 10s */}
          <button
            className={styles.skipBtn}
            onClick={() => seek(Math.max(0, currentTime - 10))}
            disabled={audioLoading}
            aria-label="Recuar 10 segundos"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
            </svg>
            <span className={styles.skipNum}>10</span>
          </button>

          {/* Play / Pause */}
          <button
            className={styles.playBtn}
            onClick={() => (playing ? pause() : play())}
            disabled={audioLoading}
            aria-label={playing ? "Pausar" : "Reproduzir"}
          >
            {audioLoading ? (
              <span className={styles.spinner} aria-hidden />
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
          {/* Skip forward 10s */}
          <button
            className={styles.skipBtn}
            onClick={() => seek(Math.min(duration || Infinity, currentTime + 10))}
            disabled={audioLoading}
            aria-label="Avançar 10 segundos"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18 13c0 3.31-2.69 6-6 6s-6-2.69-6-6 2.69-6 6-6v4l5-5-5-5v4c-4.42 0-8 3.58-8 8s3.58 8 8 8 8-3.58 8-8h-2z"/>
            </svg>
            <span className={styles.skipNum}>10</span>
          </button>
        </div>
      </div>
    </div>
  );
}
