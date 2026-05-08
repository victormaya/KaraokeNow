"use client";

import { useState, useCallback, useEffect } from "react";
import Image from "next/image";
import type { Song } from "@/types";
import SearchBar from "@/components/SearchBar/SearchBar";
import SongGrid from "@/components/SongGrid/SongGrid";
import styles from "./page.module.css";

interface TrendingTrack {
  name: string;
  artist: string;
  art: string;
}

export default function Home() {
  const [songs,         setSongs]         = useState<Song[]>([]);
  const [searching,     setSearching]     = useState(false);
  const [searchError,   setSearchError]   = useState<string | null>(null);
  const [hasSearched,   setHasSearched]   = useState(false);
  const [trending,      setTrending]      = useState<TrendingTrack[]>([]);
  const [trendingLoad,  setTrendingLoad]  = useState(true);

  useEffect(() => {
    fetch("/api/trending")
      .then(r => r.json())
      .then(d => setTrending(d.results ?? []))
      .catch(() => {})
      .finally(() => setTrendingLoad(false));
  }, []);

  const handleSearch = useCallback(async (query: string) => {
    setSearching(true);
    setSearchError(null);
    setSongs([]);
    setHasSearched(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=12`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSongs(data.results ?? []);
      if ((data.results ?? []).length === 0)
        setSearchError("Nenhuma música encontrada. Tente outra busca.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setSearchError(`Erro ao buscar: ${msg}`);
    } finally {
      setSearching(false);
    }
  }, []);

  const showTrending = !hasSearched && !searching;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroBg} aria-hidden />
        <div className={styles.logo}>
          <div className={styles.logoIcon}>🎤</div>
          <span className={styles.logoText}>KaraokeNow</span>
        </div>
        <p className={styles.tagline}>
          Busque qualquer música do YouTube e remova os vocais instantaneamente.
          Karaokê sem limites.
        </p>
        <SearchBar onSearch={handleSearch} loading={searching} />
      </header>

      <main className={styles.main}>
        {searchError && (
          <div className={styles.errorBanner} role="alert">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {searchError}
          </div>
        )}

        {showTrending ? (
          <section className={styles.trendingSection}>
            <div className={styles.trendingHeader}>
              <span className={styles.trendingFlag}>🇧🇷</span>
              <h2 className={styles.trendingTitle}>Top Brasil</h2>
              <span className={styles.trendingBadge}>Apple Music</span>
            </div>

            {trendingLoad ? (
              <div className={styles.trendingGrid}>
                {Array.from({ length: 20 }).map((_, i) => (
                  <div key={i} className={styles.trendingCardSkeleton} />
                ))}
              </div>
            ) : (
              <div className={styles.trendingGrid}>
                {trending.slice(0, 20).map((track, i) => (
                  <button
                    key={i}
                    className={styles.trendingCard}
                    onClick={() => handleSearch(`${track.name} ${track.artist}`)}
                  >
                    <div className={styles.trendingRank} data-top={i < 3 ? "true" : undefined}>{i + 1}</div>
                    <div className={styles.trendingArt}>
                      <Image
                        src={track.art}
                        alt={track.name}
                        fill
                        unoptimized
                        sizes="64px"
                      />
                    </div>
                    <div className={styles.trendingInfo}>
                      <span className={styles.trendingName}>{track.name}</span>
                      <span className={styles.trendingArtist}>{track.artist}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        ) : (
          <SongGrid songs={songs} loading={searching} />
        )}
      </main>
    </div>
  );
}
