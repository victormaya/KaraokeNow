"use client";

import { useState, useCallback, useEffect, useRef, Suspense } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import type { Song } from "@/types";
import SearchBar from "@/components/SearchBar/SearchBar";
import SongGrid from "@/components/SongGrid/SongGrid";
import styles from "./page.module.css";

interface TrendingTrack { name: string; artist: string; art: string; }

const GENRE_TABS = [
  { id: "top",       label: "Top Brasil", emoji: "🇧🇷", query: null },
  { id: "sertanejo", label: "Sertanejo",  emoji: "🤠",  query: "sertanejo mais tocado 2025" },
  { id: "funk",      label: "Funk",       emoji: "🎤",  query: "funk brasil lançamento 2025" },
  { id: "pagode",    label: "Pagode",     emoji: "🥁",  query: "pagode mais tocado 2025" },
  { id: "forro",     label: "Forró",      emoji: "🪗",  query: "forró universitário 2025" },
  { id: "rap",       label: "Rap",        emoji: "🎙️",  query: "rap nacional mais tocado 2025" },
  { id: "mpb",       label: "MPB",        emoji: "🎵",  query: "mpb brasileira mais tocada 2025" },
] as const;

type TabId = typeof GENRE_TABS[number]["id"];

// ── Inner component ──────────────────────────────────────────────────────────
function HomeContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const query        = searchParams.get("q") ?? "";

  // Search state
  const [songs,       setSongs]       = useState<Song[]>([]);
  const [searching,   setSearching]   = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Tabs state
  const [activeTab,    setActiveTab]    = useState<TabId>("top");
  const [trending,     setTrending]     = useState<TrendingTrack[]>([]);
  const [trendingLoad, setTrendingLoad] = useState(true);
  const [genreSongs,   setGenreSongs]   = useState<Song[]>([]);
  const [genreLoading, setGenreLoading] = useState(false);
  const genreCache = useRef<Map<TabId, Song[]>>(new Map());

  // Fetch Apple Music Top Brasil once
  useEffect(() => {
    fetch("/api/trending")
      .then(r => r.json())
      .then(d => setTrending(d.results ?? []))
      .catch(() => {})
      .finally(() => setTrendingLoad(false));
  }, []);

  // Fetch genre tab content
  useEffect(() => {
    const tab = GENRE_TABS.find(t => t.id === activeTab);
    if (!tab || !tab.query) return;

    if (genreCache.current.has(activeTab)) {
      setGenreSongs(genreCache.current.get(activeTab)!);
      return;
    }

    setGenreLoading(true);
    setGenreSongs([]);
    fetch(`/api/search?q=${encodeURIComponent(tab.query)}&limit=12`)
      .then(r => r.json())
      .then(d => {
        const results = d.results ?? [];
        genreCache.current.set(activeTab, results);
        setGenreSongs(results);
      })
      .catch(() => {})
      .finally(() => setGenreLoading(false));
  }, [activeTab]);

  // React to URL query changes
  useEffect(() => {
    if (!query) { setSongs([]); setSearchError(null); return; }
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

  const handleSearch = useCallback((q: string) => {
    router.push(`/?q=${encodeURIComponent(q.trim())}`);
  }, [router]);

  const showTabs = !query && !searching;
  const currentTab = GENRE_TABS.find(t => t.id === activeTab)!;

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

        {showTabs ? (
          <section className={styles.trendingSection}>
            {/* Tab bar */}
            <div className={styles.tabBar}>
              {GENRE_TABS.map(tab => (
                <button
                  key={tab.id}
                  className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ""}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <span>{tab.emoji}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Top Brasil (Apple Music) */}
            {activeTab === "top" && (
              trendingLoad ? (
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
              )
            )}

            {/* Genre tabs (YouTube search) */}
            {activeTab !== "top" && (
              <SongGrid songs={genreSongs} loading={genreLoading} />
            )}
          </section>
        ) : (
          <SongGrid songs={songs} loading={searching} />
        )}
      </main>
    </div>
  );
}

export default function Home() {
  return <Suspense><HomeContent /></Suspense>;
}
