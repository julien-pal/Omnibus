'use client';
import { create } from 'zustand';
import type { Chapter, PlayerTrack } from '@/types';
import { playerService } from '@/api/playerService';
import { syncService } from '@/api/syncService';

let audioEl: HTMLAudioElement | null = null;

export function registerAudioElement(el: HTMLAudioElement) {
  audioEl = el;
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

const LS_KEY = 'omnibus_player';

interface PersistedPlayer {
  track: PlayerTrack;
  position: number;
  speed: number;
}

export function loadPersistedPlayer(): PersistedPlayer | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedPlayer;
  } catch {
    return null;
  }
}

function persistPlayer(track: PlayerTrack, position: number, speed: number) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ track, position, speed }));
  } catch {}
}

export function clearPersistedPlayer() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(LS_KEY);
}

interface PlayerState {
  track: PlayerTrack | null;
  isPlaying: boolean;
  position: number;
  duration: number;
  speed: number;
  chapters: Chapter[];
  currentChapterIndex: number;
  sleepTimer: number | null;
  _sleepIntervalHandle: ReturnType<typeof setInterval> | null;
  transcriptStatus: 'none' | 'building' | 'ready' | 'error' | null;
  transcriptProgress: {
    total: number;
    done: number[];
    inProgress: number[];
    fileProgress: Record<number, number>;
    fileErrors?: Record<number, string>;
  } | null;
  _transcriptPollHandle: ReturnType<typeof setTimeout> | null;

  play: (track: PlayerTrack, startPosition?: number, syncPct?: number) => Promise<void>;
  pause: () => void;
  resume: () => void;
  seek: (seconds: number) => void;
  skipBack: () => void;
  skipForward: () => void;
  setSpeed: (speed: number) => void;
  setPosition: (seconds: number) => void;
  setDuration: (seconds: number) => void;
  setChapters: (chapters: Chapter[]) => void;
  setSleepTimer: (seconds: number | null) => void;
  setFileIndex: (index: number) => void;
  saveProgress: () => void;
  restore: (track: PlayerTrack, position: number, speed: number) => Promise<void>;
  close: () => void;
  _pollTranscript: (bookPath: string) => Promise<void>;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  track: null,
  isPlaying: false,
  position: 0,
  duration: 0,
  speed: 1,
  chapters: [],
  currentChapterIndex: 0,
  sleepTimer: null,
  _sleepIntervalHandle: null,
  transcriptStatus: null,
  transcriptProgress: null,
  _transcriptPollHandle: null,

  play: async (track, startPosition = 0, syncPct?: number) => {
    if (!audioEl) return;

    // For multi-file tracks with a sync percentage, navigate to the correct file
    let actualTrack = track;
    let fileFraction = syncPct;
    if (syncPct !== undefined && track.files.length > 1) {
      const n = track.files.length;
      const idx = Math.min(Math.floor(syncPct * n), n - 1);
      actualTrack = { ...track, fileIndex: idx };
      fileFraction = syncPct * n - idx;
    }

    const file = actualTrack.files[actualTrack.fileIndex];
    if (!file) return;

    audioEl.src = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/api/player/stream?path=${encodeURIComponent(file.path)}`;
    audioEl.playbackRate = get().speed;

    if (fileFraction !== undefined) {
      // Use loadedmetadata to seek by percentage (duration is guaranteed known there)
      audioEl.addEventListener(
        'loadedmetadata',
        () => {
          if (isFinite(audioEl!.duration) && audioEl!.duration > 0) {
            audioEl!.currentTime = fileFraction! * audioEl!.duration;
          }
        },
        { once: true },
      );
      audioEl.addEventListener('canplay', () => audioEl!.play(), { once: true });
    } else {
      audioEl.addEventListener(
        'canplay',
        () => {
          if (startPosition > 0) audioEl!.currentTime = startPosition;
          audioEl!.play();
        },
        { once: true },
      );
    }
    audioEl.load();

    set({
      track: actualTrack,
      isPlaying: true,
      position: startPosition,
      chapters: [],
      currentChapterIndex: 0,
    });
    persistPlayer(actualTrack, startPosition, get().speed);

    // Fetch chapters in background
    try {
      const { data } = await playerService.getChapters(file.path);
      set({ chapters: data });
    } catch {}

    // Start transcript status polling
    get()._pollTranscript(actualTrack.bookPath);
  },

  pause: () => {
    audioEl?.pause();
    get().saveProgress();
    set({ isPlaying: false });
  },

  resume: () => {
    audioEl?.play();
    set({ isPlaying: true });
  },

  seek: (seconds) => {
    if (!audioEl) return;
    audioEl.currentTime = seconds;
    set({ position: seconds });
  },

  skipBack: () => {
    const { position, seek } = get();
    seek(Math.max(0, position - 30));
  },

  skipForward: () => {
    const { position, duration, seek } = get();
    seek(Math.min(duration, position + 30));
  },

  setSpeed: (speed) => {
    if (audioEl) audioEl.playbackRate = speed;
    set({ speed });
    const { track, position } = get();
    if (track) persistPlayer(track, position, speed);
  },

  setPosition: (seconds) => {
    const { chapters } = get();
    let currentChapterIndex = 0;
    for (let i = chapters.length - 1; i >= 0; i--) {
      if (seconds >= chapters[i].startTime) {
        currentChapterIndex = i;
        break;
      }
    }
    set({ position: seconds, currentChapterIndex });
  },

  setDuration: (seconds) => set({ duration: seconds }),
  setChapters: (chapters) => set({ chapters }),

  setSleepTimer: (seconds) => {
    const { _sleepIntervalHandle } = get();
    if (_sleepIntervalHandle) clearInterval(_sleepIntervalHandle);
    if (seconds === null) {
      set({ sleepTimer: null, _sleepIntervalHandle: null });
      return;
    }

    const handle = setInterval(() => {
      const current = get().sleepTimer;
      if (current === null || current <= 0) {
        clearInterval(handle);
        get().pause();
        set({ sleepTimer: null, _sleepIntervalHandle: null });
      } else {
        set({ sleepTimer: current - 1 });
      }
    }, 1000);
    set({ sleepTimer: seconds, _sleepIntervalHandle: handle });
  },

  setFileIndex: (index) => {
    const { track } = get();
    if (!track) return;
    const updated = { ...track, fileIndex: index };
    get().play(updated, 0);
  },

  saveProgress: () => {
    const { track, speed, duration, chapters, currentChapterIndex } = get();
    if (!track || !audioEl) return;
    const position = audioEl.currentTime;
    persistPlayer(track, position, speed);
    const chapterTitle =
      chapters[currentChapterIndex]?.title ??
      track.files[track.fileIndex]?.name.replace(/\.[^.]+$/, '');
    playerService
      .updateProgress({
        bookPath: track.bookPath,
        position,
        fileIndex: track.fileIndex,
        percentage:
          track.files.length > 1
            ? (track.fileIndex + (duration > 0 ? position / duration : 0)) / track.files.length
            : duration > 0
              ? position / duration
              : 0,
        ...(chapterTitle && { chapterTitle }),
      })
      .catch(() => {});
  },

  close: () => {
    audioEl?.pause();
    clearPersistedPlayer();
    const { _transcriptPollHandle } = get();
    if (_transcriptPollHandle) clearTimeout(_transcriptPollHandle);
    set({
      track: null,
      isPlaying: false,
      position: 0,
      duration: 0,
      chapters: [],
      currentChapterIndex: 0,
      sleepTimer: null,
      transcriptStatus: null,
      transcriptProgress: null,
      _transcriptPollHandle: null,
    });
  },

  restore: async (track, position, speed) => {
    if (!audioEl) return;
    const file = track.files[track.fileIndex];
    if (!file) return;
    audioEl.src = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/api/player/stream?path=${encodeURIComponent(file.path)}`;
    audioEl.playbackRate = speed;
    const resumePosition = Math.max(0, position - 10);
    const onCanPlay = () => {
      audioEl!.currentTime = resumePosition;
      audioEl!.removeEventListener('canplay', onCanPlay);
    };
    audioEl.addEventListener('canplay', onCanPlay, { once: true });
    audioEl.load();
    set({
      track,
      isPlaying: false,
      position: resumePosition,
      speed,
      chapters: [],
      currentChapterIndex: 0,
    });
    try {
      const { data } = await playerService.getChapters(file.path);
      set({ chapters: data });
    } catch {}

    get()._pollTranscript(track.bookPath);
  },

  _pollTranscript: async (bookPath: string) => {
    const { _transcriptPollHandle } = get();
    if (_transcriptPollHandle) clearTimeout(_transcriptPollHandle);
    try {
      const [statusRes, progressRes] = await Promise.all([
        syncService.getTranscriptStatus(bookPath),
        syncService.getTranscriptProgress(bookPath).catch(() => ({ data: null })),
      ]);
      const status = statusRes.data.status as 'none' | 'building' | 'ready' | 'error';
      const transcriptProgress = progressRes.data
        ? {
            total: progressRes.data.total,
            done: progressRes.data.done ?? [],
            inProgress: progressRes.data.inProgress ?? [],
            fileProgress: progressRes.data.fileProgress ?? {},
          }
        : null;
      set({ transcriptStatus: status, transcriptProgress, _transcriptPollHandle: null });
      if (status === 'building' && get().track?.bookPath === bookPath) {
        const handle = setTimeout(() => get()._pollTranscript(bookPath), 10000);
        set({ _transcriptPollHandle: handle });
      }
    } catch {
      set({ transcriptStatus: null, transcriptProgress: null, _transcriptPollHandle: null });
    }
  },
}));
