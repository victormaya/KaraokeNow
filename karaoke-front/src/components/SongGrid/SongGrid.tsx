"use client";

import { useEffect, useState } from "react";
import type { Song } from "@/types";
import SongCard from "@/components/SongCard/SongCard";
import styles from "./SongGrid.module.css";

interface Props {
  songs: Song[];
  loading?: boolean;
}

function SkeletonCard() {
  return (
    <div className={styles.skeletonCard} aria-hidden>
      <div className={`${styles.skeletonThumb} ${styles.shimmer}`} />
      <div className={`${styles.skeletonLine} ${styles.shimmer}`} />
      <div className={`${styles.skeletonLine} ${styles.shimmer}`} />
    </div>
  );
}

export default function SongGrid({ songs, loading }: Props) {
  const [processedIds, setProcessedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!songs.length) return;
    const ids = songs.map(s => s.id).join(",");
    fetch(`/api/processed?ids=${ids}`)
      .then(r => r.ok ? r.json() : { processed: [] })
      .then(data => setProcessedIds(new Set(data.processed ?? [])))
      .catch(() => {});
  }, [songs]);

  return (
    <section className={styles.section}>
      {songs.length > 0 && !loading && (
        <p className={styles.heading}>{songs.length} resultado(s) encontrado(s)</p>
      )}
      <div className={styles.grid} role="list">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
          : songs.map((song) => (
              <div key={song.id} role="listitem">
                <SongCard song={song} processed={processedIds.has(song.id)} />
              </div>
            ))}
      </div>
    </section>
  );
}
