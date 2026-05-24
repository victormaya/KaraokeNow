"use client";

import { useEffect, useState } from "react";
import type { Song } from "@/types";
import SongCard from "@/components/SongCard/SongCard";
import styles from "./SongGrid.module.css";

interface Props {
  songs: Song[];
  loading?: boolean;
}

// Module-level cache: avoids re-fetching IDs already checked this session
const checkedIds = new Map<string, boolean>();

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

    const unchecked = songs.map(s => s.id).filter(id => !checkedIds.has(id));

    // All IDs already in cache — no fetch needed
    if (!unchecked.length) {
      setProcessedIds(new Set(songs.map(s => s.id).filter(id => checkedIds.get(id))));
      return;
    }

    fetch(`/api/processed?ids=${unchecked.join(",")}`)
      .then(r => r.ok ? r.json() : { processed: [] })
      .then(data => {
        const processed = new Set<string>(data.processed ?? []);
        unchecked.forEach(id => checkedIds.set(id, processed.has(id)));
        setProcessedIds(new Set(songs.map(s => s.id).filter(id => checkedIds.get(id))));
      })
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
