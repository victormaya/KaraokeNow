"use client";

import { FormEvent, useState } from "react";
import styles from "./SearchBar.module.css";

interface Props {
  onSearch: (query: string) => void;
  loading?: boolean;
}

export default function SearchBar({ onSearch, loading }: Props) {
  const [value, setValue] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onSearch(trimmed);
  }

  return (
    <div className={styles.wrapper}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.inputWrap}>
          <span className={styles.icon} aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            className={styles.input}
            type="text"
            placeholder="Buscar música, artista ou álbum…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={loading}
            aria-label="Buscar música"
          />
        </div>
        <button
          type="submit"
          className={styles.button}
          disabled={loading || !value.trim()}
        >
          {loading ? "Buscando…" : "Buscar"}
        </button>
      </form>
    </div>
  );
}
