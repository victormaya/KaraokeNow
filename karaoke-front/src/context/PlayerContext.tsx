"use client";

import {
  createContext, useContext, useRef, useState, useCallback, useEffect,
  type RefObject,
} from "react";
import type { PitchShift } from "tone";

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
  applyPitch: (semitones: number) => Promise<void>;
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

  const karaokePSRef  = useRef<PitchShift | null>(null);
  const originalPSRef = useRef<PitchShift | null>(null);
  const toneReady       = useRef(false);
  const pitchRestoreRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pre-import Tone.js on mount so the module is cached when the user first
  // clicks a pitch button, eliminating the ~500 ms cold-import delay.
  useEffect(() => { import("tone").catch(() => {}); }, []);

  const setTrack = useCallback((newTrack: Track, audioUrl: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = audioUrl;
      audioRef.current.volume = 1;
    }
    if (originalRef.current) {
      originalRef.current.pause();
      originalRef.current.src = "";
      originalRef.current.volume = 1;
    }
    setTrackState(newTrack);
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setAudioLoading(true);
    setHasOriginal(false);
    setKaraokeMode(true);
    setPitch(0);
    if (karaokePSRef.current)  karaokePSRef.current.pitch  = 0;
    if (originalPSRef.current) originalPSRef.current.pitch = 0;
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

  const applyPitch = useCallback(async (semitones: number) => {
    setPitch(semitones);

    // Mute immediately — clears any previous restore timer so rapid clicks
    // keep audio muted until the user stops clicking.
    if (pitchRestoreRef.current) clearTimeout(pitchRestoreRef.current);
    if (audioRef.current)    audioRef.current.volume    = 0;
    if (originalRef.current) originalRef.current.volume = 0;

    if (!toneReady.current) {
      toneReady.current = true;
      try {
        const { PitchShift, getContext, start, connect } = await import("tone");
        await start();
        const rawCtx = getContext().rawContext as AudioContext;
        if (audioRef.current) {
          const src = rawCtx.createMediaElementSource(audioRef.current);
          const ps  = new PitchShift({ pitch: semitones, windowSize: 0.05 });
          ps.toDestination();
          connect(src, ps);
          karaokePSRef.current = ps;
        }
        if (originalRef.current) {
          const src = rawCtx.createMediaElementSource(originalRef.current);
          const ps  = new PitchShift({ pitch: semitones, windowSize: 0.05 });
          ps.toDestination();
          connect(src, ps);
          originalPSRef.current = ps;
        }
      } catch {
        toneReady.current = false;
      }
    } else {
      if (karaokePSRef.current)  karaokePSRef.current.pitch  = semitones;
      if (originalPSRef.current) originalPSRef.current.pitch = semitones;
    }

    // Restore volume after the PitchShift window has flushed (~60 ms).
    pitchRestoreRef.current = setTimeout(() => {
      if (audioRef.current)    audioRef.current.volume    = 1;
      if (originalRef.current) originalRef.current.volume = 1;
    }, 80);
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
        onCanPlay={() => setAudioLoading(false)}
        onLoadedData={() => setAudioLoading(false)}
        onError={() => setAudioLoading(false)}
        preload="auto"
      />
      <audio ref={originalRef} muted preload="none" />
      {children}
    </Ctx.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}
