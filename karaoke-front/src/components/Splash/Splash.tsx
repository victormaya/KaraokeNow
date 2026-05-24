"use client";

import { useEffect, useState } from "react";
import styles from "./Splash.module.css";

export default function Splash() {
  const [visible, setVisible] = useState(false);
  const [hiding, setHiding]   = useState(false);

  useEffect(() => {
    setVisible(true);
    const hideTimer   = setTimeout(() => setHiding(true), 1600);
    const removeTimer = setTimeout(() => setVisible(false), 2150);
    return () => {
      clearTimeout(hideTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className={`${styles.overlay} ${hiding ? styles.hiding : ""}`}>
      <span className={styles.icon}>🎤</span>
      <span className={styles.logo}>VOKAO</span>
      <span className={styles.tagline}>karaoke ao vivo</span>
    </div>
  );
}
