"use client";

import { useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { Song } from "@/types";
import styles from "./SongCard.module.css";

interface Props {
  song: Song;
}

export default function SongCard({ song }: Props) {
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function startPreview() {
    if (audioRef.current) return;
    const audio = new Audio(`/api/stream/${song.id}`);
    audio.volume = 0.35;
    audio.play().catch(() => {});
    audioRef.current = audio;
    timerRef.current = setTimeout(stopPreview, 8000);
  }

  function stopPreview() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
  }

  function handleClick() {
    stopPreview();
    const params = new URLSearchParams({
      title: song.title,
      channel: song.channel,
      thumbnail: song.thumbnail,
      duration: song.duration,
    });
    router.push(`/song/${song.id}?${params}`);
  }

  return (
    <article
      className={styles.card}
      onClick={handleClick}
      onMouseEnter={startPreview}
      onMouseLeave={stopPreview}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && handleClick()}
      aria-label={`${song.title} — ${song.channel}`}
    >
      <div className={styles.thumbWrap}>
        <Image
          src={song.thumbnail}
          alt={song.title}
          fill
          className={styles.thumb}
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          unoptimized
        />
        <span className={styles.duration}>{song.duration}</span>
        <div className={styles.playIcon} aria-hidden>
          <svg width="44" height="44" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="12" fill="rgba(0,0,0,0.55)" />
            <polygon points="10,8 18,12 10,16" fill="white" />
          </svg>
        </div>
        <div className={styles.previewBadge} aria-hidden>
          <span />
          <span />
          <span />
          Preview
        </div>
      </div>

      <div className={styles.info}>
        <p className={styles.title}>{song.title}</p>
        <p className={styles.channel}>{song.channel}</p>
      </div>
    </article>
  );
}
