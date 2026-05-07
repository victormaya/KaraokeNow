"use client";

import { useState, useCallback } from "react";
import type { Song } from "@/types";
import SearchBar from "@/components/SearchBar/SearchBar";
import SongGrid from "@/components/SongGrid/SongGrid";
import styles from "./page.module.css";

const SUGGESTIONS = [
  "Bohemian Rhapsody – Queen",
  "Blinding Lights – The Weeknd",
  "Shape of You – Ed Sheeran",
  "Hotel California – Eagles",
  "As It Was – Harry Styles",
];

export default function Home() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const handleSearch = useCallback(async (query: string) => {
    setSearching(true);
    setSearchError(null);
    setSongs([]);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=12`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSongs(data.results ?? []);
      if ((data.results ?? []).length === 0) {
        setSearchError("Nenhuma música encontrada. Tente outra busca.");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setSearchError(`Erro ao buscar: ${msg}. Verifique se o backend está rodando.`);
    } finally {
      setSearching(false);
    }
  }, []);

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

        {!searching && songs.length === 0 && !searchError ? (
          <div className={styles.welcome} aria-label="Bem-vindo">
            <div className={styles.welcomeIcon} aria-hidden>🎵</div>
            <p className={styles.welcomeTitle}>O que você quer cantar hoje?</p>
            <div className={styles.welcomeHints} role="list" aria-label="Sugestões">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  className={styles.hint}
                  role="listitem"
                  onClick={() => handleSearch(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <SongGrid songs={songs} loading={searching} />
        )}
      </main>
    </div>
  );
}
