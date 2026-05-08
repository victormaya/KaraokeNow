"use client";

import { useState, useCallback, useEffect, Suspense } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import type { Song } from "@/types";
import SearchBar from "@/components/SearchBar/SearchBar";
import SongGrid from "@/components/SongGrid/SongGrid";
import styles from "./page.module.css";

interface TrendingTrack {
  name: string;
  artist: string;
  art: string;
}

// ── Inner component uses useSearchParams (requires Suspense boundary) ────────
function HomeContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const query        = searchParams.get("q") ?? "";

  const [songs,        setSongs]        = useState<Song[]>([]);
  const [searching,    setSearching]    = useState(false);
  const [searchError,  setSearchError]  = useState<string | null>(null);
  const [trending,     setTrending]     = useState<TrendingTrack[]>([]);
  const [trendingLoad, setTrendingLoad] = useState(true);

  // Fetch trending once
  useEffect(() => {
    fetch("/api/trending")
      .then(r => r.json())
      .then(d => setTrending(d.results ?? []))
      .catch(() => {})
      .finally(() => setTrendingLoad(false));
  }, []);

  // React to URL query changes (handles back/forward and direct links)
  useEffect(() => {
    if (!query) {
      setSongs([]);
      setSearchError(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    setSongs([]);
    fetch(`/api/search?q=${encodeURIComponent(query)}&limit=12`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => {
        setSongs(d.results ?? []);
        if ((d.results ?? []).length === 0)
          setSearchError("Nenhuma música encontrada. Tente outra busca.");
      })
      .catch(e => setSearchError(`Erro ao buscar: ${e instanceof Error ? e.message : e}`))
      .finally(() => setSearching(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // handleSearch only updates the URL — the effect above does the work
  const handleSearch = useCallback((q: string) => {
    router.push(`/?q=${encodeURIComponent(q.trim())}`);
  }, [router]);

  const showTrending = !query && !searching;

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
        <SearchBar onSearch={handleSearch} loading={searching} defaultValue={query} />
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
                      <Image src={track.art} alt={track.name} fill unoptimized sizes="44px" />
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

// ── Suspense wrapper required by useSearchParams in Next.js App Router ───────
export default function Home() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  );
}
