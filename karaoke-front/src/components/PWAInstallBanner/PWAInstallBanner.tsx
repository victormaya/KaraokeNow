"use client";

import { useState, useEffect } from "react";
import styles from "./PWAInstallBanner.module.css";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "android" | "ios" | null;

interface Props {
  hasPlayer: boolean;
}

export default function PWAInstallBanner({ hasPlayer }: Props) {
  const [platform, setPlatform] = useState<Platform>(null);
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true;
    if (isStandalone) return;

    if (localStorage.getItem("pwa-install-dismissed")) return;

    const ua = navigator.userAgent;
    const isIOS = /iphone|ipad|ipod/i.test(ua);

    if (isIOS) {
      const t = setTimeout(() => setPlatform("ios"), 3000);
      return () => clearTimeout(t);
    }

    let t: ReturnType<typeof setTimeout>;
    function onPrompt(e: Event) {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
      t = setTimeout(() => setPlatform("android"), 3000);
    }

    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      clearTimeout(t);
    };
  }, []);

  function dismiss() {
    localStorage.setItem("pwa-install-dismissed", "1");
    setPlatform(null);
    setShowGuide(false);
  }

  async function installAndroid() {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") setPlatform(null);
    setPrompt(null);
  }

  if (!platform) return null;

  return (
    <>
      <div className={`${styles.banner} ${hasPlayer ? styles.bannerAbovePlayer : ""}`}>
        <div className={styles.left}>
          <span className={styles.appIcon}>🎤</span>
          <div className={styles.text}>
            <span className={styles.appName}>VOKAO</span>
            <span className={styles.subtitle}>
              {platform === "ios"
                ? "Adicione à tela inicial do iPhone"
                : "Instale o app para acesso rápido"}
            </span>
          </div>
        </div>

        <div className={styles.right}>
          {platform === "android" ? (
            <button className={styles.installBtn} onClick={installAndroid}>
              Instalar
            </button>
          ) : (
            <button className={styles.installBtn} onClick={() => setShowGuide(true)}>
              Como instalar
            </button>
          )}
          <button className={styles.closeBtn} onClick={dismiss} aria-label="Fechar">
            <CloseIcon />
          </button>
        </div>
      </div>

      {showGuide && (
        <div className={styles.overlay} onClick={() => setShowGuide(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHandle} />
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>Instalar no iPhone / iPad</span>
              <button className={styles.modalClose} onClick={() => setShowGuide(false)} aria-label="Fechar">
                <CloseIcon />
              </button>
            </div>
            <p className={styles.modalSub}>
              Abra esta página no <strong>Safari</strong> e siga os passos:
            </p>

            <ol className={styles.steps}>
              <li className={styles.step}>
                <span className={styles.stepNum}>1</span>
                <span>
                  Toque no ícone <strong>Compartilhar</strong>{" "}
                  <ShareIcon />{" "}
                  na barra do Safari
                </span>
              </li>
              <li className={styles.step}>
                <span className={styles.stepNum}>2</span>
                <span>
                  Role e toque em{" "}
                  <strong>"Adicionar à Tela de Início"</strong>
                </span>
              </li>
              <li className={styles.step}>
                <span className={styles.stepNum}>3</span>
                <span>
                  Toque em <strong>Adicionar</strong> para confirmar
                </span>
              </li>
            </ol>

            <button className={styles.gotItBtn} onClick={() => setShowGuide(false)}>
              Entendi
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="1" y1="1" x2="11" y2="11" />
      <line x1="11" y1="1" x2="1" y2="11" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "inline", verticalAlign: "middle", marginBottom: 2 }}
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}
