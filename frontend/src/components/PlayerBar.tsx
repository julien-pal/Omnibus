'use client';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Moon,
  List,
  ChevronUp,
  ChevronDown,
  CheckCircle,
  X,
  BookOpen,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { playerService, readerService, syncService } from '@/api';
import { usePlayerStore, registerAudioElement, loadPersistedPlayer } from '@/store/usePlayerStore';
import { useSyncPrefStore } from '@/store/useSyncPrefStore';
import { useT } from '@/i18n';
import ChapterDrawer from '@/components/ChapterDrawer';
import SleepTimerPopover from '@/components/SleepTimerPopover';
import ProgressSyncDialog, { type syncInfo } from '@/components/ProgressSyncDialog';
import Tooltip from '@/components/Tooltip';
import type { ReaderProgressEntry, ProgressEntry } from '@/types';
import logger from '@/lib/logger';

function formatTime(s: number): string {
  if (!isFinite(s)) return '0:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

const SPEEDS = [1, 1.25, 1.5, 2, 0.75];

export default function PlayerBar() {
  const t = useT();
  const track = usePlayerStore((s) => s.track);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const position = usePlayerStore((s) => s.position);
  const duration = usePlayerStore((s) => s.duration);
  const speed = usePlayerStore((s) => s.speed);
  const chapters = usePlayerStore((s) => s.chapters);
  const currentChapterIndex = usePlayerStore((s) => s.currentChapterIndex);
  const sleepTimer = usePlayerStore((s) => s.sleepTimer);

  const pause = usePlayerStore((s) => s.pause);
  const resume = usePlayerStore((s) => s.resume);
  const seek = usePlayerStore((s) => s.seek);
  const skipBack = usePlayerStore((s) => s.skipBack);
  const skipForward = usePlayerStore((s) => s.skipForward);
  const setSpeed = usePlayerStore((s) => s.setSpeed);
  const setPosition = usePlayerStore((s) => s.setPosition);
  const setDuration = usePlayerStore((s) => s.setDuration);
  const saveProgress = usePlayerStore((s) => s.saveProgress);
  const setFileIndex = usePlayerStore((s) => s.setFileIndex);

  const close = usePlayerStore((s) => s.close);
  const queryClient = useQueryClient();

  async function handleMarkComplete() {
    await playerService.markComplete(track?.bookPath!);
    queryClient.invalidateQueries({ queryKey: ['player-progress-all'] });
  }

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSaveRef = useRef<number>(0);
  const touchStartX = useRef<number>(0);
  const [showChapters, setShowChapters] = useState(false);
  const [showInlineChapters, setShowInlineChapters] = useState(false);
  const [showSleepTimer, setShowSleepTimer] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const chapterListRef = useRef<HTMLDivElement>(null);
  const [swipeX, setSwipeX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const [readerProgress, setReaderProgress] = useState<ReaderProgressEntry | null>(null);
  const [ebookSyncDialog, setEbookSyncDialog] = useState<{ syncInfo?: syncInfo } | null>(null);
  const { pref: syncPref } = useSyncPrefStore();

  const SWIPE_THRESHOLD = 80;

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    setSwiping(true);
  }

  function onTouchMove(e: React.TouchEvent) {
    const dx = e.touches[0].clientX - touchStartX.current;
    setSwipeX(dx);
  }

  function onTouchEnd() {
    if (Math.abs(swipeX) >= SWIPE_THRESHOLD) close();
    setSwipeX(0);
    setSwiping(false);
  }

  const prevChapter = useCallback(() => {
    const state = usePlayerStore.getState();
    if (state.chapters.length > 0) {
      const prevIdx = state.currentChapterIndex - 1;
      if (prevIdx >= 0) {
        seek(state.chapters[prevIdx].startTime);
      } else {
        seek(0);
      }
    } else if (state.track) {
      const prevFile = state.track.fileIndex - 1;
      if (prevFile >= 0) setFileIndex(prevFile);
      else seek(0);
    }
  }, [seek, setFileIndex]);

  const nextChapter = useCallback(() => {
    const state = usePlayerStore.getState();
    if (state.chapters.length > 0) {
      const nextIdx = state.currentChapterIndex + 1;
      if (nextIdx < state.chapters.length) {
        seek(state.chapters[nextIdx].startTime);
      } else if (state.track) {
        const nextFile = state.track.fileIndex + 1;
        if (nextFile < state.track.files.length) setFileIndex(nextFile);
      }
    } else if (state.track) {
      const nextFile = state.track.fileIndex + 1;
      if (nextFile < state.track.files.length) setFileIndex(nextFile);
    }
  }, [seek, setFileIndex]);

  useEffect(() => {
    if (showInlineChapters && chapterListRef.current) {
      const active = chapterListRef.current.querySelector('[data-active="true"]');
      active?.scrollIntoView({ block: 'nearest' });
    }
  }, [showInlineChapters]);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    registerAudioElement(audio);

    function onTimeUpdate() {
      setPosition(audio.currentTime);
      // Throttle progress save: only save if 5+ seconds have elapsed
      const now = Date.now();
      if (now - lastSaveRef.current >= 5000) {
        lastSaveRef.current = now;
        saveProgress();
      }

      // Sleep timer: handle "end of chapter" (-1) special value
      const state = usePlayerStore.getState();
      if (state.sleepTimer === -1) {
        const chapter = state.chapters[state.currentChapterIndex];
        if (chapter && audio.currentTime >= chapter.endTime) {
          state.pause();
          usePlayerStore.setState({ sleepTimer: null });
        }
      }
    }

    function onLoadedMetadata() {
      setDuration(audio.duration);
    }

    function onEnded() {
      const state = usePlayerStore.getState();
      if (!state.track) return;
      const nextIndex = state.track.fileIndex + 1;
      if (nextIndex < state.track.files.length) {
        setFileIndex(nextIndex);
      } else {
        usePlayerStore.setState({ isPlaying: false });
        saveProgress();
      }
    }

    function onPlay() {
      usePlayerStore.setState({ isPlaying: true });
    }

    function onPause() {
      usePlayerStore.setState({ isPlaying: false });
    }

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restoredBookPathRef = useRef<string | null>(null);

  // Restore player from localStorage on first mount
  useEffect(() => {
    const persisted = loadPersistedPlayer();
    if (!persisted) return;
    restoredBookPathRef.current = persisted.track.bookPath;
    const { restore } = usePlayerStore.getState();
    restore(persisted.track, persisted.position, persisted.speed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch reader progress; auto-show dialog only when track is restored from localStorage
  useEffect(() => {
    if (!track) {
      setReaderProgress(null);
      return;
    }
    const isRestoredTrack = restoredBookPathRef.current === track.bookPath;
    if (isRestoredTrack) restoredBookPathRef.current = null;
    Promise.all([
      readerService.getProgress(track.bookPath),
      playerService.getProgress(track.bookPath).catch(() => ({ data: null })),
    ])
      .then(([readerRes, playerRes]) => {
        const rp = readerRes.data;
        const pp = playerRes.data;
        setReaderProgress(rp);
        const ebookUpdatedAt = rp?.updatedAt ?? 0;
        const audioUpdatedAt = pp?.updatedAt ?? 0;
        logger.debug('[sync:track-load] ebook:', {
          pct: rp?.percentage,
          updatedAt: ebookUpdatedAt ? new Date(ebookUpdatedAt).toLocaleString() : 'n/a',
          chapter: rp?.chapterTitle,
        });
        logger.debug('[sync:track-load] audio:', {
          pct: pp?.percentage,
          updatedAt: audioUpdatedAt ? new Date(audioUpdatedAt).toLocaleString() : 'n/a',
          chapter: pp?.chapterTitle,
        });
        logger.debug('[sync:track-load] condition →', {
          syncPref,
          isRestoredTrack,
          ebookAhead: ebookUpdatedAt > audioUpdatedAt,
          willShowDialog:
            isRestoredTrack &&
            syncPref !== 'ignore' &&
            syncPref !== 'sync' &&
            ebookUpdatedAt > audioUpdatedAt,
        });
        // Only show auto-dialog when restoring from localStorage (not when play() was called)
        if (!isRestoredTrack) return;
        if (syncPref === 'ignore' || syncPref === 'sync') return;
        const ebookHasPosition = !!rp && ((rp.percentage ?? 0) > 0 || !!rp.cfi);
        if (ebookHasPosition && ebookUpdatedAt > audioUpdatedAt) {
          const rawPath = pp != null ? (track.files[pp.fileIndex]?.path ?? '') : '';
          const audioFileName = rawPath.split(/[/\\]/).pop() || null;
          setEbookSyncDialog({
            syncInfo: {
              loading: false,
              ebookChapter: rp.chapterTitle ?? null,
              ebookUpdatedAt: rp.updatedAt ?? null,
              ...(rp.snippet && { ebookText: rp.snippet }),
              audioFileName,
              audioUpdatedAt: pp?.updatedAt ?? null,
              ...(pp?.snippet && { audioText: pp.snippet }),
            },
          });
        }
      })
      .catch(() => setReaderProgress(null));
  }, [track?.bookPath]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync ebook→audio handler
  const handleEbookToAudioSync = useCallback(async () => {
    if (!track || !readerProgress) return;
    try {
      const res = await syncService.ebookToAudio({
        bookPath: track.bookPath,
        ebookPct: readerProgress.percentage,
        cfi: readerProgress.cfi ?? undefined,
      });
      const result = res.data;
      logger.debug('[sync:e→a] ebook-to-audio result:', {
        confidence: result.confidence,
        fileIndex: result.fileIndex,
        fileSeconds: result.fileSeconds,
        currentFileIndex: track.fileIndex,
      });
      if (result.confidence === 'high' && result.fileIndex != null && result.fileSeconds != null) {
        if (result.fileIndex !== track.fileIndex) {
          logger.debug(
            `[sync:e→a] switching file ${track.fileIndex} → ${result.fileIndex}, seek to ${result.fileSeconds.toFixed(1)}s`,
          );
          usePlayerStore
            .getState()
            .play({ ...track, fileIndex: result.fileIndex }, result.fileSeconds);
        } else {
          logger.debug(`[sync:e→a] same file, seek to ${result.fileSeconds.toFixed(1)}s + resume`);
          seek(result.fileSeconds);
          resume();
        }
      } else {
        logger.warn('[sync:e→a] low or no confidence — not navigating');
      }
    } catch (err) {
      logger.error('[sync:e→a] ebook-to-audio failed:', err);
    }
  }, [track, readerProgress, seek, resume]);

  // Update MediaSession metadata when track changes
  useEffect(() => {
    if (!track) return;
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.author,
      artwork: track.cover ? [{ src: track.cover }] : [],
    });

    navigator.mediaSession.setActionHandler('play', resume);
    navigator.mediaSession.setActionHandler('pause', pause);
    navigator.mediaSession.setActionHandler('seekbackward', () => skipBack());
    navigator.mediaSession.setActionHandler('seekforward', () => skipForward());
  }, [track, resume, pause, skipBack, skipForward]);

  if (!track) return null;

  const currentChapter = chapters[currentChapterIndex] ?? null;
  const currentFile = track.files[track.fileIndex];
  const downloadUrl = currentFile
    ? `/api/player/download?path=${encodeURIComponent(currentFile.path)}`
    : null;

  const hasPrevChapter = chapters.length > 0 ? currentChapterIndex > 0 : track.fileIndex > 0;
  const hasNextChapter =
    chapters.length > 0
      ? currentChapterIndex < chapters.length - 1
      : track.fileIndex < track.files.length - 1;

  return (
    <>
      <ChapterDrawer open={showChapters} onClose={() => setShowChapters(false)} />
      <SleepTimerPopover open={showSleepTimer} onClose={() => setShowSleepTimer(false)} />

      {/* ── Expanded player panel ── */}
      {(() => {
        const globalPct =
          duration > 0
            ? track.files.length > 1
              ? (track.fileIndex + position / duration) / track.files.length
              : position / duration
            : 0;
        const remaining =
          duration > 0
            ? duration - position + duration * Math.max(0, track.files.length - 1 - track.fileIndex)
            : 0;
        return (
          expanded && (
            <div className="absolute bottom-[4.5rem] md:bottom-2 left-2 right-2 md:left-0 md:right-0 z-50 flex justify-center pointer-events-none">
              <div
                className="w-full md:w-1/3 md:min-w-[420px] pointer-events-auto bg-surface-card/70 backdrop-blur-md border border-white/10 rounded-xl shadow-lg flex flex-col"
                style={{
                  transform: `translateX(${swipeX}px)`,
                  opacity: swiping ? Math.max(0.4, 1 - Math.abs(swipeX) / 200) : 1,
                  transition: swiping ? 'none' : 'transform 0.2s ease, opacity 0.2s ease',
                }}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
              >
                {/* Collapse notch */}
                <div className="flex justify-end items-center gap-1 pr-4 -mt-5">
                  <Tooltip text={t('player_close')} position="top">
                    <button
                      onClick={close}
                      className="hidden md:flex items-center justify-center w-8 h-5 rounded-t-md bg-surface-card/70 backdrop-blur-md border border-b-0 border-white/10"
                    >
                      <X className="w-3.5 h-3.5 text-ink-muted" />
                    </button>
                  </Tooltip>
                  <Tooltip text={t('player_collapse')} position="top">
                    <button
                      onClick={() => setExpanded(false)}
                      className="flex items-center justify-center w-12 h-5 rounded-t-md bg-surface-card/70 backdrop-blur-md border border-b-0 border-white/10"
                    >
                      <ChevronDown className="w-5 h-5 text-ink-muted" />
                    </button>
                  </Tooltip>
                </div>

                <div className="flex flex-col items-center gap-4 px-6 pt-2 pb-5">
                  {/* Cover + info */}
                  <div className="flex items-center gap-4 w-full">
                    {track.cover ? (
                      <img
                        src={track.cover}
                        alt={track.title}
                        className="w-20 h-20 rounded-lg object-cover flex-shrink-0 shadow-lg"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-lg bg-surface-elevated flex-shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-semibold text-ink leading-snug line-clamp-2">
                        {track.title}
                      </p>
                      <p className="text-sm text-ink-muted mt-0.5">{track.author}</p>
                    </div>
                  </div>

                  {/* Current chapter */}
                  {currentChapter && (
                    <div className="w-full text-center -mb-2">
                      <p className="text-xs font-medium text-indigo-400 truncate">
                        {currentChapter.title}
                      </p>
                    </div>
                  )}

                  {/* Progress */}
                  <div className="flex flex-col gap-1.5 w-full">
                    {duration > 0 && (
                      <div className="flex items-center justify-center gap-3 w-full">
                        <span className="text-[10px] text-ink-faint tabular-nums">
                          {Math.round(globalPct * 100)}%
                        </span>
                        <span className="text-[10px] text-ink-faint">·</span>
                        <span className="text-[10px] text-ink-faint tabular-nums">
                          -{formatTime(remaining)}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 w-full">
                      <span className="text-[11px] text-ink-muted tabular-nums flex-shrink-0">
                        {formatTime(position)}
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={duration || 1}
                        step={1}
                        value={position}
                        onChange={(e) => seek(Number(e.target.value))}
                        className="flex-1 h-1.5 accent-indigo-500 cursor-pointer"
                      />
                      <span className="text-[11px] text-ink-muted tabular-nums flex-shrink-0">
                        {formatTime(duration)}
                      </span>
                    </div>
                  </div>

                  {/* Main controls */}
                  <div className="flex items-center justify-between w-full px-2">
                    <Tooltip text={t('player_prev_chapter')} position="top">
                      <button
                        onClick={prevChapter}
                        disabled={!hasPrevChapter}
                        className="btn-ghost w-12 h-12 p-0 rounded-xl flex items-center justify-center disabled:opacity-30"
                      >
                        <SkipBack className="w-6 h-6" />
                      </button>
                    </Tooltip>
                    <Tooltip text={t('player_skip_back_30')} position="top">
                      <button
                        onClick={skipBack}
                        className="btn-ghost w-12 h-12 p-0 rounded-xl flex flex-col items-center justify-center"
                      >
                        <SkipBack className="w-5 h-5" />
                        <span className="text-[10px] leading-none -mt-0.5">30</span>
                      </button>
                    </Tooltip>
                    <button
                      onClick={isPlaying ? pause : resume}
                      className="btn-primary w-16 h-16 p-0 rounded-full flex items-center justify-center"
                    >
                      {isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7" />}
                    </button>
                    <Tooltip text={t('player_skip_forward_30')} position="top">
                      <button
                        onClick={skipForward}
                        className="btn-ghost w-12 h-12 p-0 rounded-xl flex flex-col items-center justify-center"
                      >
                        <SkipForward className="w-5 h-5" />
                        <span className="text-[10px] leading-none -mt-0.5">30</span>
                      </button>
                    </Tooltip>
                    <Tooltip text={t('player_next_chapter')} position="top">
                      <button
                        onClick={nextChapter}
                        disabled={!hasNextChapter}
                        className="btn-ghost w-12 h-12 p-0 rounded-xl flex items-center justify-center disabled:opacity-30"
                      >
                        <SkipForward className="w-6 h-6" />
                      </button>
                    </Tooltip>
                  </div>

                  {/* Secondary row: speed, sleep, chapters */}
                  <div className="flex items-center justify-center gap-6 w-full">
                    {/* Speed cycle */}
                    <Tooltip text={t('player_speed')} position="top">
                      <button
                        onClick={() => {
                          const idx = SPEEDS.indexOf(speed);
                          setSpeed(SPEEDS[(idx + 1) % SPEEDS.length]);
                        }}
                        className="btn-ghost w-12 h-12 rounded-xl text-sm font-semibold tabular-nums flex items-center justify-center"
                      >
                        {speed === 1 ? '1×' : `${speed}×`}
                      </button>
                    </Tooltip>
                    {/* Sleep timer */}
                    <Tooltip text={t('player_sleep_timer')} position="top">
                      <button
                        onClick={() => setShowSleepTimer((v) => !v)}
                        className={`btn-ghost w-12 h-12 p-0 rounded-xl flex items-center justify-center relative ${sleepTimer !== null ? 'text-indigo-400 bg-indigo-500/10' : ''}`}
                      >
                        <Moon className="w-5 h-5" />
                        {sleepTimer !== null && sleepTimer !== -1 && (
                          <span className="absolute -top-1 -right-1 text-[9px] leading-none bg-indigo-500 text-white rounded px-0.5 tabular-nums">
                            {formatTime(sleepTimer)}
                          </span>
                        )}
                        {sleepTimer === -1 && (
                          <span className="absolute -top-1 -right-1 text-[9px] leading-none bg-indigo-500 text-white rounded px-0.5">
                            ∞
                          </span>
                        )}
                      </button>
                    </Tooltip>
                    {/* Chapter list */}
                    <Tooltip text={t('player_chapters')} position="top">
                      <button
                        onClick={() => setShowInlineChapters((v) => !v)}
                        className={`btn-ghost w-12 h-12 p-0 rounded-xl flex items-center justify-center ${showInlineChapters ? 'text-indigo-400 bg-indigo-500/10' : ''}`}
                      >
                        <List className="w-5 h-5" />
                      </button>
                    </Tooltip>
                    {/* Sync ebook→audio */}
                    {readerProgress && (readerProgress.percentage ?? 0) > 0 && (
                      <Tooltip text={t('sync_to_audio')} position="top">
                        <button
                          onClick={() => {
                            if (syncPref === 'sync') {
                              handleEbookToAudioSync();
                            } else if (syncPref !== 'ignore') {
                              setEbookSyncDialog({
                                syncInfo: {
                                  ebookChapter: readerProgress.chapterTitle ?? null,
                                  ebookUpdatedAt: readerProgress.updatedAt ?? null,
                                },
                              });
                            }
                          }}
                          className="btn-ghost w-12 h-12 p-0 rounded-xl flex items-center justify-center text-indigo-400 hover:bg-indigo-500/10"
                        >
                          <BookOpen className="w-5 h-5" />
                        </button>
                      </Tooltip>
                    )}
                    {/* Mark as read */}
                    <Tooltip text={t('player_mark_complete')} position="top">
                      <button
                        onClick={handleMarkComplete}
                        className="btn-ghost w-12 h-12 p-0 rounded-xl flex items-center justify-center text-green-400 hover:bg-green-500/10"
                      >
                        <CheckCircle className="w-5 h-5" />
                      </button>
                    </Tooltip>
                  </div>

                  {/* Inline chapter list */}
                  {showInlineChapters && (
                    <div
                      ref={chapterListRef}
                      className="w-full max-h-48 overflow-y-auto rounded-xl border border-white/10 bg-black/20"
                    >
                      {chapters.length === 0 && track.files.length <= 1 && (
                        <p className="text-sm text-ink-muted text-center px-4 py-6">
                          {t('player_no_chapters')}
                        </p>
                      )}
                      {/* Embedded chapters */}
                      {chapters.length > 0 &&
                        chapters.map((chapter, i) => {
                          const isActive = i === currentChapterIndex;
                          return (
                            <button
                              key={chapter.index}
                              data-active={isActive ? 'true' : 'false'}
                              onClick={() => seek(chapter.startTime)}
                              className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/5 ${
                                isActive ? 'text-indigo-300' : 'text-ink'
                              }`}
                            >
                              <span className="text-sm truncate">{chapter.title}</span>
                              <span
                                className={`text-xs flex-shrink-0 tabular-nums ${isActive ? 'text-indigo-400' : 'text-ink-muted'}`}
                              >
                                {formatTime(chapter.startTime)}
                              </span>
                            </button>
                          );
                        })}
                      {/* File-based chapters (multi-file audiobooks) */}
                      {chapters.length === 0 &&
                        track.files.map((file, i) => {
                          const isActive = i === track.fileIndex;
                          const name = file.name.replace(/\.[^/.]+$/, '');
                          return (
                            <button
                              key={i}
                              data-active={isActive ? 'true' : 'false'}
                              onClick={() => setFileIndex(i)}
                              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/5 ${
                                isActive ? 'text-indigo-300' : 'text-ink'
                              }`}
                            >
                              <span className="text-sm truncate">{name}</span>
                            </button>
                          );
                        })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        );
      })()}

      {/* ── Mini player bar ── */}
      {!expanded && (
        <div className="absolute bottom-[4.5rem] md:bottom-2 left-2 right-2 md:left-0 md:right-0 z-40 flex justify-center pointer-events-none">
          <div className="w-full md:w-1/3 md:min-w-[420px] pointer-events-auto">
            {/* Expand notch */}
            <div className="flex justify-end pr-4">
              <Tooltip text={t('player_expand')} position="top">
                <button
                  onClick={() => setExpanded(true)}
                  className="flex items-center justify-center w-12 h-5 rounded-t-md bg-surface-card/70 backdrop-blur-md border border-b-0 border-white/10"
                >
                  <ChevronUp className="w-5 h-5 text-ink-muted" />
                </button>
              </Tooltip>
            </div>

            {/* Bar */}
            <div
              className="bg-surface-card/70 backdrop-blur-md border border-white/10 rounded-xl shadow-lg px-2 flex items-stretch gap-2"
              style={{
                height: '64px',
                transform: `translateX(${swipeX}px)`,
                opacity: swiping ? Math.max(0.4, 1 - Math.abs(swipeX) / 200) : 1,
                transition: swiping ? 'none' : 'transform 0.2s ease, opacity 0.2s ease',
              }}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            >
              {/* Cover */}
              <div className="flex items-center py-2 flex-shrink-0">
                {track.cover ? (
                  <img
                    src={track.cover}
                    alt={track.title}
                    className="h-full w-auto aspect-square rounded object-cover"
                  />
                ) : (
                  <div className="h-full aspect-square rounded bg-surface-elevated" />
                )}
              </div>

              {/* Title + progress */}
              <div className="flex flex-col justify-center min-w-0 flex-1 py-2 gap-1">
                <p className="text-xs font-medium text-ink truncate leading-tight">{track.title}</p>
                {currentChapter && (
                  <p className="text-[10px] text-indigo-400 truncate leading-none">
                    {currentChapter.title}
                  </p>
                )}
                {/* Progress */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] text-ink-muted tabular-nums flex-shrink-0">
                    {formatTime(position)}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={duration || 1}
                    step={1}
                    value={position}
                    onChange={(e) => seek(Number(e.target.value))}
                    className="flex-1 h-1 accent-indigo-500 cursor-pointer"
                  />
                  <span className="text-[9px] text-ink-muted tabular-nums flex-shrink-0">
                    {formatTime(duration)}
                  </span>
                </div>
              </div>

              {/* Controls — full height */}
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <Tooltip text={t('player_skip_back_30')} position="top">
                  <button
                    onClick={skipBack}
                    className="btn-ghost h-full px-2 rounded flex flex-col items-center justify-center gap-0.5"
                  >
                    <SkipBack className="w-3.5 h-3.5" />
                    <span className="text-[8px] leading-none">30</span>
                  </button>
                </Tooltip>
                <button
                  onClick={isPlaying ? pause : resume}
                  className="btn-primary w-9 h-9 p-0 rounded-full flex items-center justify-center mx-1"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <Tooltip text={t('player_skip_forward_30')} position="top">
                  <button
                    onClick={skipForward}
                    className="btn-ghost h-full px-2 rounded flex flex-col items-center justify-center gap-0.5"
                  >
                    <SkipForward className="w-3.5 h-3.5" />
                    <span className="text-[8px] leading-none">30</span>
                  </button>
                </Tooltip>
                <Tooltip text={t('player_close')} position="top">
                  <button
                    onClick={close}
                    className="btn-ghost h-full px-2 rounded items-center justify-center hidden md:flex"
                  >
                    <X className="w-3.5 h-3.5 text-ink-muted" />
                  </button>
                </Tooltip>
              </div>
            </div>
          </div>
        </div>
      )}

      {ebookSyncDialog && (
        <ProgressSyncDialog
          sourceFormat="ebook"
          syncInfo={ebookSyncDialog.syncInfo}
          onSync={async () => {
            logger.debug('[sync:e→a] PlayerBar ebookSyncDialog onSync called');
            setEbookSyncDialog(null);
            await handleEbookToAudioSync();
          }}
          onKeep={() => setEbookSyncDialog(null)}
          onClose={() => setEbookSyncDialog(null)}
        />
      )}
    </>
  );
}
