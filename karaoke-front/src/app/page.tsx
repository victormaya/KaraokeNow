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
  { id: "top",       label: "Top Brasil", emoji: "🇧🇷" },
  { id: "sertanejo", label: "Sertanejo",  emoji: "🤠"  },
  { id: "funk",      label: "Funk",       emoji: "🎤"  },
  { id: "pagode",    label: "Pagode",     emoji: "🥁"  },
  { id: "forro",     label: "Forró",      emoji: "🪗"  },
  { id: "rap",       label: "Rap",        emoji: "🎙️"  },
  { id: "mpb",       label: "MPB",        emoji: "🎵"  },
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
  const [tabTracks,    setTabTracks]    = useState<TrendingTrack[]>([]);
  const [tabLoading,   setTabLoading]   = useState(true);
  const tabCache = useRef<Map<TabId, TrendingTrack[]>>(new Map());

  // Fetch Apple Music chart for active tab
  useEffect(() => {
    if (tabCache.current.has(activeTab)) {
      setTabTracks(tabCache.current.get(activeTab)!);
      setTabLoading(false);
      return;
    }
    setTabLoading(true);
    setTabTracks([]);
    fetch(`/api/trending?genre=${activeTab}`)
      .then(r => r.json())
      .then(d => {
        const results = d.results ?? [];
        tabCache.current.set(activeTab, results);
        setTabTracks(results);
      })
      .catch(() => {})
      .finally(() => setTabLoading(false));
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

            {/* Apple Music chart — same card format for all tabs */}
            {tabLoading ? (
              <div className={styles.trendingGrid}>
                {Array.from({ length: 20 }).map((_, i) => (
                  <div key={i} className={styles.trendingCardSkeleton} />
                ))}
              </div>
            ) : (
              <div className={styles.trendingGrid}>
                {tabTracks.map((track, i) => (
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

export default function Home() {
  return <Suspense><HomeContent /></Suspense>;
}
