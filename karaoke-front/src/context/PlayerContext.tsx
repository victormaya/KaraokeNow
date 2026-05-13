"use client";

import {
  createContext, useContext, useRef, useState, useCallback,
  type RefObject,
} from "react";

export interface Track {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
}

interface PlayerCtxValue {
  // Main track
  track: Track | null;
  audioRef: RefObject<HTMLAudioElement | null>;
  playing: boolean;
  currentTime: number;
  duration: number;
  audioLoading: boolean;
  setTrack: (track: Track, audioUrl: string) => void;
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  // Pitch
  pitch: number;
  applyPitch: (semitones: number) => void;
  // Voice toggle (original audio)
  originalRef: RefObject<HTMLAudioElement | null>;
  hasOriginal: boolean;
  karaokeMode: boolean;
  setOriginalTrack: (url: string) => void;
  switchMode: (toKaraoke: boolean) => void;
}

const Ctx = createContext<PlayerCtxValue | null>(null);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef    = useRef<HTMLAudioElement>(null);
  const originalRef = useRef<HTMLAudioElement>(null);

  const [track,        setTrackState]   = useState<Track | null>(null);
  const [playing,      setPlaying]      = useState(false);
  const [currentTime,  setCurrentTime]  = useState(0);
  const [duration,     setDuration]     = useState(0);
  const [audioLoading, setAudioLoading] = useState(false);
  const [pitch,        setPitch]        = useState(0);
  const [hasOriginal,  setHasOriginal]  = useState(false);
  const [karaokeMode,  setKaraokeMode]  = useState(true);

  const setTrack = useCallback((newTrack: Track, audioUrl: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = audioUrl;
      audioRef.current.playbackRate = 1;
    }
    if (originalRef.current) {
      originalRef.current.pause();
      originalRef.current.src = "";
      originalRef.current.playbackRate = 1;
    }
    setTrackState(newTrack);
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setAudioLoading(true);
    setHasOriginal(false);
    setKaraokeMode(true);
    setPitch(0);
  }, []);

  const setOriginalTrack = useCallback((url: string) => {
    if (originalRef.current) {
      originalRef.current.src = url;
      originalRef.current.muted = true;
    }
    setHasOriginal(true);
  }, []);

  const switchMode = useCallback((toKaraoke: boolean) => {
    const t = audioRef.current?.currentTime ?? 0;
    if (originalRef.current) originalRef.current.currentTime = t;
    if (audioRef.current)    audioRef.current.muted    = !toKaraoke;
    if (originalRef.current) originalRef.current.muted =  toKaraoke;
    setKaraokeMode(toKaraoke);
  }, []);

  const play = useCallback(() => {
    audioRef.current?.play().catch(() => {});
    if (hasOriginal && originalRef.current) originalRef.current.play().catch(() => {});
  }, [hasOriginal]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    originalRef.current?.pause();
  }, []);

  const seek = useCallback((time: number) => {
    if (audioRef.current)    audioRef.current.currentTime    = time;
    if (originalRef.current) originalRef.current.currentTime = time;
    setCurrentTime(time);
  }, []);

  const applyPitch = useCallback((semitones: number) => {
    setPitch(semitones);
    const rate = Math.pow(2, semitones / 12);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
      audioRef.current.preservesPitch = true;
    }
    if (originalRef.current) {
      originalRef.current.playbackRate = rate;
      originalRef.current.preservesPitch = true;
    }
  }, []);

  return (
    <Ctx.Provider value={{
      track, audioRef, playing, currentTime, duration, audioLoading,
      setTrack, play, pause, seek,
      pitch, applyPitch,
      originalRef, hasOriginal, karaokeMode, setOriginalTrack, switchMode,
    }}>
      <audio
        ref={audioRef}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={() => { if (audioRef.current) setCurrentTime(audioRef.current.currentTime); }}
        onLoadedMetadata={() => { if (audioRef.current) setDuration(audioRef.current.duration); }}
        onWaiting={() => setAudioLoading(true)}
        onCanPlay={() => setAudioLoading(false)}
        preload="auto"
      />
      <audio ref={originalRef} muted preload="auto" />
      {children}
    </Ctx.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}
