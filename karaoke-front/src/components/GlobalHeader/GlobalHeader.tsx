"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import styles from "./GlobalHeader.module.css";

export default function GlobalHeader() {
  const router   = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");

  if (pathname === "/" || pathname === "/drums") return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.push(query.trim() ? `/?q=${encodeURIComponent(query.trim())}` : "/");
  }

  return (
    <header className={styles.header}>
      <button className={styles.logo} onClick={() => router.push("/")}>
        🎤 <span>VOKAO</span>
      </button>
      <Link href="/drums" className={styles.navLink}>
        🥁 Bateria
      </Link>
      <form className={styles.form} onSubmit={handleSubmit}>
        <input
          type="search"
          className={styles.input}
          placeholder="Buscar música…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          aria-label="Buscar música"
        />
        <button type="submit" className={styles.btn} aria-label="Buscar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
      </form>
    </header>
  );
}
