"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import type { JobStatus } from "@/types";
import { usePlayer } from "@/context/PlayerContext";
import styles from "./page.module.css";

interface LrcLine { time: number; text: string; }
interface YtKaraoke { id: string; title: string; channel: string; thumbnail: string; }

function parseLrc(lrc: string): LrcLine[] {
  const re = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;
  const lines: LrcLine[] = [];
  for (const raw of lrc.split("\n")) {
    const m = raw.match(re);
    if (!m) continue;
    const time = parseInt(m[1]) * 60 + parseInt(m[2]) + parseInt(m[3]) / (m[3].length === 3 ? 1000 : 100);
    const text = m[4].trim();
    if (text) lines.push({ time, text });
  }
  return lines.sort((a, b) => a.time - b.time);
}

function parseSongMeta(rawTitle: string): { artist: string; songTitle: string } {
  const seps = [" - ", " – ", " — "];
  for (const sep of seps) {
    if (rawTitle.includes(sep)) {
      const [first, ...rest] = rawTitle.split(sep);
      const songTitle = rest.join(sep).replace(/\(.*?\)|\[.*?\]/g, "").trim();
      return { artist: first.trim(), songTitle };
    }
  }
  return { artist: "", songTitle: rawTitle.replace(/\(.*?\)|\[.*?\]/g, "").trim() };
}

const STATUS_LABEL: Record<string, string> = {
  pending:     "Iniciando processamento…",
  downloading: "Baixando áudio…",
  separating:  "Removendo vocais com IA…",
  done:        "Concluído!",
};

export default function SongClient() {
  const params       = useParams();
  const searchParams = useSearchParams();
  const router       = useRouter();
  const player       = usePlayer();

  const videoId   = params.id as string;
  const title     = searchParams.get("title")     ?? "";
  const channel   = searchParams.get("channel")   ?? "";
  const thumbnail = searchParams.get("thumbnail") ?? "";
  const direct    = searchParams.get("direct")    === "1";

  // ── Job state ─────────────────────────────────────────────────────────────
  const [jobStatus,   setJobStatus]   = useState<JobStatus>("pending");
  const [progress,    setProgress]    = useState(0);
  const [karaokeUrl,  setKaraokeUrl]  = useState<string | null>(null);
  const [jobError,    setJobError]    = useState<string | null>(null);
  const [ready,       setReady]       = useState(direct);
  const [isFirstTime, setIsFirstTime] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── YouTube karaoke suggestions ───────────────────────────────────────────
  const [ytKaraokes,     setYtKaraokes]     = useState<YtKaraoke[]>([]);
  const [ytKaraokesDone, setYtKaraokesDone] = useState(false);

  // ── Lyrics ────────────────────────────────────────────────────────────────
  const [lrcLines,      setLrcLines]      = useState<LrcLine[]>([]);
  const [lyrics,        setLyrics]        = useState<string | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(true);
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([]);

  // ── Share ─────────────────────────────────────────────────────────────────
  const [copied,         setCopied]         = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);

  // ── Progress animation ────────────────────────────────────────────────────
  useEffect(() => {
    const targets: Record<string, number> = {
      pending: 8, downloading: 45, separating: 88, done: 100,
    };
    const target = targets[jobStatus] ?? 0;
    if (jobStatus === "done") { setProgress(100); return; }
    const id = setInterval(() => {
      setProgress(prev => prev < target ? Math.min(prev + 0.5, target) : prev);
    }, 400);
    return () => clearInterval(id);
  }, [jobStatus]);

  // ── Start job + lyrics on mount ───────────────────────────────────────────
  useEffect(() => {
    startJob();
    fetchLyrics();
    if (!direct) fetchYtKaraokes();
    return () => clearPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startJob() {
    try {
      const endpoint = direct ? `/api/direct/${videoId}` : `/api/process/${videoId}`;
      const res = await fetch(endpoint, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.status === "done") {
        setJobStatus("done");
        setKaraokeUrl(`/api/audio/${data.job_id}`);
        if (!direct) setTimeout(() => setReady(true), 600);
      } else {
        if (!direct) setIsFirstTime(true);
        startPolling(data.job_id);
      }
    } catch (e) {
      setJobError(e instanceof Error ? e.message : String(e));
    }
  }

  function startPolling(jobId: string) {
    clearPolling();
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/job/${jobId}`);
        if (!res.ok) return;
        const job = await res.json();
        setJobStatus(job.status);
        if (job.status === "done") {
          clearPolling();
          setKaraokeUrl(job.audio_url);
          setTimeout(() => setReady(true), 600);
        }
        if (job.status === "error") {
          clearPolling();
          setJobError(job.error ?? "Erro desconhecido.");
        }
      } catch { /* keep polling */ }
    }, 2500);
  }

  function clearPolling() {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
  }

  async function fetchLyrics() {
    setLyricsLoading(true);
    const { artist, songTitle } = parseSongMeta(title);
    try {
      const q = new URLSearchParams({ artist, title: songTitle });
      const res = await fetch(`/api/lyrics?${q}`);
      if (res.ok) {
        const data = await res.json();
        if (data.lrc)  setLrcLines(parseLrc(data.lrc));
        else           setLyrics(data.lyrics || null);
      }
    } catch { /* ignore */ }
    setLyricsLoading(false);
  }

  async function fetchYtKaraokes() {
    if (!title) { setYtKaraokesDone(true); return; }
    try {
      const res = await fetch(`/api/karaoke-search?q=${encodeURIComponent(title)}`);
      if (res.ok) {
        const data = await res.json();
        setYtKaraokes(data.results ?? []);
      }
    } catch { /* ignore */ }
    setYtKaraokesDone(true);
  }

  function goDirectKaraoke(song: YtKaraoke) {
    const p = new URLSearchParams({
      title: song.title, channel: song.channel,
      thumbnail: song.thumbnail, direct: "1",
    });
    router.push(`/song/${song.id}?${p}`);
  }

  // ── Register track in global player when ready ────────────────────────────
  useEffect(() => {
    if (!ready || !karaokeUrl) return;
    if (player.track?.id !== videoId) {
      player.setTrack({ id: videoId, title, channel, thumbnail }, karaokeUrl);
    }
    if (!direct) player.setOriginalTrack(`/api/original/${videoId}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, karaokeUrl]);

  // ── Lyrics active line ─────────────────────────────────────────────────────
  const activeLineIdx = useMemo(() => {
    if (!lrcLines.length) return -1;
    let idx = -1;
    for (let i = 0; i < lrcLines.length; i++) {
      if (lrcLines[i].time <= player.currentTime) idx = i;
      else break;
    }
    return idx;
  }, [lrcLines, player.currentTime]);

  useEffect(() => {
    lineRefs.current[activeLineIdx]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeLineIdx]);

  async function copyLink() {
    const url = window.location.href;
    try { await navigator.clipboard.writeText(url); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.cssText = "position:fixed;top:-9999px;left:-9999px";
      document.body.appendChild(ta); ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (jobError) {
    return (
      <div className={styles.errorPage}>
        <p className={styles.errorMsg}>Erro: {jobError}</p>
        <button className={styles.backBtn} onClick={() => router.back()}>← Voltar</button>
      </div>
    );
  }

  // ── Loading screen ────────────────────────────────────────────────────────
  if (!ready) {
    return (
      <div className={styles.loadingPage}>
        <button className={styles.backBtn} onClick={() => router.back()}>← Voltar</button>
        <div className={styles.loadingContent}>
          {thumbnail && (
            <div className={styles.loadingThumb}>
              <Image src={thumbnail} alt={title} fill unoptimized />
            </div>
          )}
          <h2 className={styles.loadingTitle}>{title || "Carregando…"}</h2>
          {channel && <p className={styles.loadingChannel}>{channel}</p>}
          <div className={styles.progressWrap}>
            <div className={styles.progressTrack}>
              <div
                className={styles.progressFill}
                style={{
                  width: `${progress}%`,
                  transition: jobStatus === "done" ? "width 0.3s ease" : "width 0.8s ease",
                }}
              />
            </div>
            <span className={styles.progressPct}>{Math.round(progress)}%</span>
          </div>
          <p className={styles.statusText}>{STATUS_LABEL[jobStatus] ?? "Processando…"}</p>

          {!direct && isFirstTime && (
            <>
              <div className={styles.cacheNotice}>
                <span className={styles.cacheNoticeIcon}>⚡</span>
                <span>Isso acontece só na primeira vez. Após o processamento, a música fica salva para sempre — próximas reproduções serão instantâneas.</span>
              </div>
              <div className={styles.navWarning}>
                <span className={styles.navWarningIcon}>⚠️</span>
                <span>Não atualize a página nem volte agora. Se sair e escolher a mesma música novamente, o carregamento será reiniciado do zero.</span>
              </div>
            </>
          )}

          {!direct && ytKaraokesDone && ytKaraokes.length > 0 && (
            <div className={styles.ytKaraokeBox}>
              <div className={styles.ytKaraokeHeader}>
                <span>🎬</span>
                <span>Karaokês prontos no YouTube</span>
                <span className={styles.ytKaraokeTag}>Instantâneo</span>
              </div>
              {ytKaraokes.map(song => (
                <button key={song.id} className={styles.ytKaraokeItem} onClick={() => goDirectKaraoke(song)}>
                  <div className={styles.ytKaraokeThumb}>
                    <Image src={song.thumbnail} alt={song.title} fill unoptimized sizes="48px" />
                  </div>
                  <div className={styles.ytKaraokeInfo}>
                    <span className={styles.ytKaraokeTitle}>{song.title}</span>
                    <span className={styles.ytKaraokeChannel}>{song.channel}</span>
                  </div>
                  <span className={styles.ytKaraokePlay}>▶ Usar este</span>
                </button>
              ))}
              <p className={styles.ytKaraokeNote}>Ou aguarde o processamento com IA para melhor qualidade</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Player page (ready) ───────────────────────────────────────────────────
  return (
    <div className={styles.songPage}>
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => router.back()}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Voltar
        </button>
        <button className={styles.shareBtn} onClick={() => setShareModalOpen(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
          {copied ? "Copiado!" : "Compartilhar"}
        </button>
      </div>

      <div className={styles.splitLayout}>
        {/* ── LEFT: Song info ──────────────────────────────────────────── */}
        <div className={styles.playerPanel}>
          <div className={styles.songInfo}>
            <div className={styles.songThumb}>
              <Image src={thumbnail} alt={title} fill unoptimized />
            </div>
            <div className={styles.songMeta}>
              <h1 className={styles.songTitle}>{title}</h1>
              <p className={styles.songChannel}>{channel}</p>
            </div>
          </div>

          {direct && <div className={styles.ytBadge}>🎬 Karaokê do YouTube</div>}

          {!direct && ytKaraokes.length > 0 && (
            <div className={styles.ytAltBox}>
              <p className={styles.ytAltHeader}>🎬 Karaokês prontos no YouTube</p>
              {ytKaraokes.map(song => (
                <button key={song.id} className={styles.ytAltItem} onClick={() => goDirectKaraoke(song)}>
                  <div className={styles.ytAltThumb}>
                    <Image src={song.thumbnail} alt={song.title} fill unoptimized sizes="44px" />
                  </div>
                  <div className={styles.ytAltInfo}>
                    <span className={styles.ytAltTitle}>{song.title}</span>
                    <span className={styles.ytAltChannel}>{song.channel}</span>
                  </div>
                  <span className={styles.ytAltPlay}>▶</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── RIGHT: Lyrics ────────────────────────────────────────────── */}
        <div className={styles.lyricsPanel}>
          <h2 className={styles.lyricsHeading}>Letra</h2>
          {lyricsLoading ? (
            <div className={styles.lyricsPlaceholder}>
              <span className={styles.spinner} />
              <span>Carregando letra…</span>
            </div>
          ) : lrcLines.length > 0 ? (
            <div className={styles.lyricsLines}>
              {lrcLines.map((line, i) => (
                <p
                  key={i}
                  ref={el => { lineRefs.current[i] = el; }}
                  className={[
                    styles.lyricsLine,
                    i === activeLineIdx ? styles.lyricsLineActive : "",
                    i < activeLineIdx  ? styles.lyricsLinePast   : "",
                  ].join(" ")}
                >
                  {line.text}
                </p>
              ))}
            </div>
          ) : lyrics ? (
            <pre className={styles.lyricsText}>{lyrics}</pre>
          ) : (
            <p className={styles.lyricsEmpty}>Letra não encontrada para esta música.</p>
          )}
        </div>
      </div>

      {/* ── Share modal ───────────────────────────────────────────────── */}
      {shareModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setShareModalOpen(false)}>
          <div className={styles.modalBox} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>Compartilhar karaokê</span>
              <button className={styles.modalClose} onClick={() => setShareModalOpen(false)} aria-label="Fechar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className={styles.modalUrlRow} onClick={copyLink} title="Clique para copiar">
              <span className={styles.modalUrl}>{typeof window !== "undefined" ? window.location.href : ""}</span>
            </div>
            <button className={`${styles.copyBtn} ${copied ? styles.copyBtnDone : ""}`} onClick={copyLink}>
              {copied ? (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Link copiado!
                </>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copiar link
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
