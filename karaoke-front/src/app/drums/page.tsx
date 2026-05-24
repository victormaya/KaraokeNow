"use client";

import { useState, useCallback, useEffect, useRef, Suspense } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import SearchBar from "@/components/SearchBar/SearchBar";
import Footer from "@/components/Footer/Footer";
import styles from "./page.module.css";

interface Song { id: string; title: string; channel: string; thumbnail: string; duration: string; }
interface TrendingTrack { name: string; artist: string; art: string; }

const GENRE_TABS = [
  { id: "top",       label: "Top Brasil", emoji: "🇧🇷" },
  { id: "sertanejo", label: "Sertanejo",  emoji: "🤠"  },
  { id: "funk",      label: "Funk",       emoji: "🎤"  },
  { id: "pagode",    label: "Pagode",     emoji: "🥁"  },
  { id: "forro",     label: "Forró",      emoji: "🪗"  },
  { id: "rap",       label: "Rap",        emoji: "🎙️"  },
  { id: "mpb",       label: "MPB",        emoji: "🎵"  },
  { id: "gospel",    label: "Gospel",     emoji: "✝️"  },
] as const;

type TabId = typeof GENRE_TABS[number]["id"];

const trunc = (s: string, n: number) => s.length > n ? s.slice(0, n) + "…" : s;

function DrumsContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const query        = searchParams.get("q") ?? "";

  const [songs,       setSongs]       = useState<Song[]>([]);
  const [searching,   setSearching]   = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [activeTab,  setActiveTab]  = useState<TabId>("top");
  const [tabTracks,  setTabTracks]  = useState<TrendingTrack[]>([]);
  const [tabLoading, setTabLoading] = useState(true);
  const TAB_CACHE_MAX = GENRE_TABS.length;
  const tabCache = useRef<Map<TabId, TrendingTrack[]>>(new Map());

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
        if (tabCache.current.size >= TAB_CACHE_MAX) {
          tabCache.current.delete(tabCache.current.keys().next().value!);
        }
        tabCache.current.set(activeTab, results);
        setTabTracks(results);
      })
      .catch(() => {})
      .finally(() => setTabLoading(false));
  }, [activeTab]);

  useEffect(() => {
    if (!query) { setSongs([]); setSearchError(null); return; }
    setSearching(true);
    setSearchError(null);
    setSongs([]);
    fetch(`/api/search?q=${encodeURIComponent(query)}&limit=12`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => {
        const results = d.results ?? [];
        setSongs(results);
        if (results.length === 0) setSearchError("Nenhuma música encontrada. Tente outra busca.");
      })
      .catch(() => setSearchError("Erro ao buscar. Tente novamente."))
      .finally(() => setSearching(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const handleSearch = useCallback((q: string) => {
    router.push(`/drums?q=${encodeURIComponent(q.trim())}`);
  }, [router]);

  function goToDrums(song: Song) {
    const p = new URLSearchParams({ title: song.title, channel: song.channel, thumbnail: song.thumbnail });
    router.push(`/drums/${song.id}?${p}`);
  }

  const showTabs = !query && !searching;

  return (
    <div className={styles.page}>
      {/* ── Header ───────────────────────────────────────────────────── */}
      <header className={styles.hero}>
        <div className={styles.heroBg} aria-hidden />
        <button className={styles.logo} onClick={() => router.push("/")} aria-label="Ir para a página inicial">
          <div className={styles.logoIcon}>🎤</div>
          <span className={styles.logoText}>VOKAO</span>
        </button>
        <p className={styles.tagline}>
          Remove a bateria de qualquer música com IA. Pratique no seu ritmo.
        </p>
        <SearchBar onSearch={handleSearch} loading={searching} defaultValue={query} />

        <div className={styles.modeRow}>
          <button className={styles.modeBtn} onClick={() => router.push("/")}>
            🎤 Karaokê
          </button>
          <button className={`${styles.modeBtn} ${styles.modeBtnActive}`}>
            🥁 Bateria
          </button>
        </div>
      </header>

      {/* ── Main ─────────────────────────────────────────────────────── */}
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
                      <Image src={track.art} alt={track.name} fill sizes="44px" />
                    </div>
                    <div className={styles.trendingInfo}>
                      <span className={styles.trendingName}>{trunc(track.name, 30)}</span>
                      <span className={styles.trendingArtist}>{trunc(track.artist, 24)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        ) : (
          <>
            {(searching || songs.length > 0) && (
              <div className={styles.aiSectionHeader}>
                <span>🥁</span>
                <span>Remover bateria com IA</span>
                <span className={styles.aiSectionSub}>selecione a música</span>
              </div>
            )}
            {songs.length > 0 && (
              <div className={styles.grid}>
                {songs.map(song => (
                  <button key={song.id} className={styles.card} onClick={() => goToDrums(song)}>
                    <div className={styles.thumb}>
                      <Image src={song.thumbnail} alt={song.title} fill sizes="180px" />
                      <span className={styles.duration}>{song.duration}</span>
                      <div className={styles.playOverlay} aria-hidden>
                        <svg width="40" height="40" viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="12" fill="rgba(0,0,0,0.55)" />
                          <polygon points="10,8 18,12 10,16" fill="white" />
                        </svg>
                      </div>
                    </div>
                    <div className={styles.cardInfo}>
                      <p className={styles.cardTitle}>{song.title}</p>
                      <p className={styles.cardChannel}>{song.channel}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {searching && (
              <div className={styles.grid}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className={styles.cardSkeleton} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}

export default function DrumsPage() {
  return <Suspense><DrumsContent /></Suspense>;
}
