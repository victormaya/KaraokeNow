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
  track: Track | null;
  audioRef: RefObject<HTMLAudioElement>;
  playing: boolean;
  currentTime: number;
  duration: number;
  audioLoading: boolean;
  setTrack: (track: Track, audioUrl: string) => void;
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  applyPitch: (semitones: number) => Promise<void>;
}

const Ctx = createContext<PlayerCtxValue | null>(null);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [track,        setTrackState]  = useState<Track | null>(null);
  const [playing,      setPlaying]     = useState(false);
  const [currentTime,  setCurrentTime] = useState(0);
  const [duration,     setDuration]    = useState(0);
  const [audioLoading, setAudioLoading] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pitchRef   = useRef<any>(null);
  const toneReady  = useRef(false);

  const setTrack = useCallback((newTrack: Track, audioUrl: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = audioUrl;
    }
    setTrackState(newTrack);
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setAudioLoading(true);
    if (pitchRef.current) pitchRef.current.pitch = 0;
  }, []);

  const play  = useCallback(() => { audioRef.current?.play().catch(() => {}); }, []);
  const pause = useCallback(() => { audioRef.current?.pause(); }, []);

  const seek = useCallback((time: number) => {
    if (audioRef.current) audioRef.current.currentTime = time;
    setCurrentTime(time);
  }, []);

  const applyPitch = useCallback(async (semitones: number) => {
    if (!toneReady.current) {
      toneReady.current = true;
      try {
        const { PitchShift, getContext, start, connect } = await import("tone");
        await start();
        const rawCtx = getContext().rawContext as AudioContext;
        if (audioRef.current) {
          const src = rawCtx.createMediaElementSource(audioRef.current);
          const ps  = new PitchShift(semitones);
          ps.toDestination();
          connect(src, ps);
          pitchRef.current = ps;
        }
      } catch {
        toneReady.current = false;
      }
    } else if (pitchRef.current) {
      pitchRef.current.pitch = semitones;
    }
  }, []);

  return (
    <Ctx.Provider value={{
      track, audioRef, playing, currentTime, duration, audioLoading,
      setTrack, play, pause, seek, applyPitch,
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
      {children}
    </Ctx.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}
