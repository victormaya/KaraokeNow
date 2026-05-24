"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./page.module.css";

interface Song {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
  duration: string;
}

function DrumsContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const query        = searchParams.get("q") ?? "";

  const [inputVal,  setInputVal]  = useState(query);
  const [songs,     setSongs]     = useState<Song[]>([]);
  const [searching, setSearching] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => {
    setInputVal(query);
    if (!query) { setSongs([]); setError(null); return; }

    setSearching(true);
    setError(null);
    setSongs([]);

    fetch(`/api/search?q=${encodeURIComponent(query)}&limit=12`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => {
        const results = d.results ?? [];
        setSongs(results);
        if (results.length === 0) setError("Nenhuma música encontrada. Tente outra busca.");
      })
      .catch(() => setError("Erro ao buscar. Tente novamente."))
      .finally(() => setSearching(false));
  }, [query]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const q = inputVal.trim();
    router.push(q ? `/drums?q=${encodeURIComponent(q)}` : "/drums");
  }, [inputVal, router]);

  function goToDrums(song: Song) {
    const p = new URLSearchParams({
      title: song.title, channel: song.channel, thumbnail: song.thumbnail,
    });
    router.push(`/drums/${song.id}?${p}`);
  }

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.heroIcon}>🥁</div>
        <h1 className={styles.heroTitle}>Play Along — Bateria</h1>
        <p className={styles.heroDesc}>
          Remove a bateria de qualquer música com IA. Pratique no seu ritmo.
        </p>
      </div>

      <form className={styles.searchForm} onSubmit={handleSubmit}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Buscar música para praticar…"
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          autoFocus
        />
        <button type="submit" className={styles.searchBtn}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          Buscar
        </button>
      </form>

      {searching && (
        <p className={styles.hint}>
          <span className={styles.spinner} /> Buscando…
        </p>
      )}
      {error && !searching && <p className={styles.hint}>{error}</p>}

      {songs.length > 0 && (
        <section className={styles.resultsSection}>
          <p className={styles.resultsCount}>{songs.length} resultado(s)</p>
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
        </section>
      )}

      <a className={styles.backLink} href="/">← Voltar para o VOKAO</a>
    </div>
  );
}

export default function DrumsPage() {
  return (
    <Suspense>
      <DrumsContent />
    </Suspense>
  );
}
