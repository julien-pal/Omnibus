'use client';
import React, { useRef, useEffect } from 'react';
import { AudioLines } from 'lucide-react';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useT } from '@/i18n';

function formatTime(s: number): string {
  if (!isFinite(s)) return '0:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

interface ChapterDrawerProps {
  open: boolean;
  onClose: () => void;
}

export default function ChapterDrawer({ open, onClose }: ChapterDrawerProps) {
  const t = useT();
  const chapters = usePlayerStore((s) => s.chapters);
  const currentChapterIndex = usePlayerStore((s) => s.currentChapterIndex);
  const seek = usePlayerStore((s) => s.seek);
  const track = usePlayerStore((s) => s.track);
  const transcriptStatus = usePlayerStore((s) => s.transcriptStatus);
  const transcriptProgress = usePlayerStore((s) => s.transcriptProgress);
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll to current chapter when opening
  useEffect(() => {
    if (open && listRef.current) {
      const activeEl = listRef.current.querySelector('[data-active="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [open, currentChapterIndex]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-30" onClick={onClose} />
      {/* Panel */}
      <div className="fixed bottom-[136px] md:bottom-[72px] right-0 md:right-4 z-40 w-80 md:w-96 max-h-80 flex flex-col bg-surface-card border border-surface-border rounded-t-xl md:rounded-xl shadow-modal overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border flex-shrink-0">
          <span className="text-sm font-medium text-ink">{t('player_chapters')}</span>
        </div>
        <div ref={listRef} className="flex-1 overflow-y-auto">
          {chapters.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-ink-muted">
              {t('player_no_chapters')}
            </div>
          ) : (
            chapters.map((chapter, i) => {
              const isActive = i === currentChapterIndex;
              const fileIndex = track?.fileIndex ?? 0;
              const fileDone = (transcriptProgress?.done ?? []).includes(fileIndex);
              const withinCurrent =
                (transcriptProgress?.inProgress ?? []).includes(fileIndex) &&
                chapter.startTime < (transcriptProgress?.fileProgress?.[fileIndex] ?? 0);
              const isTranscribed = transcriptStatus === 'ready' || fileDone || withinCurrent;
              const isDone = transcriptStatus === 'ready';
              return (
                <button
                  key={chapter.index}
                  data-active={isActive ? 'true' : 'false'}
                  onClick={() => {
                    seek(chapter.startTime);
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-elevated ${
                    isActive ? 'bg-indigo-500/15 text-indigo-300' : 'text-ink'
                  }`}
                >
                  <span className="text-sm truncate">{chapter.title}</span>
                  <span className="flex items-center gap-1.5 flex-shrink-0">
                    {isTranscribed && (
                      <AudioLines
                        className={`w-3 h-3 flex-shrink-0 ${isDone ? 'text-green-400' : 'text-indigo-400'}`}
                      />
                    )}
                    <span
                      className={`text-xs tabular-nums ${isActive ? 'text-indigo-400' : 'text-ink-muted'}`}
                    >
                      {formatTime(chapter.startTime)}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
