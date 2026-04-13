'use client';
import React, { useState, useEffect, useRef } from 'react';
import { BookOpen, Play, Info, BookOpenCheck, AudioLines } from 'lucide-react';
import { MergedBook, ProgressEntry, PlayerTrack, ReaderProgressEntry } from '@/types';
import { coverUrl } from '@/lib/utils';
import { extractSeries, extractSeriesNumber } from '@/lib/libraryUtils';
import { FormatBadges } from '@/components/BookDetailModal';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useReaderStore } from '@/store/useReaderStore';
import { useSyncPrefStore } from '@/store/useSyncPrefStore';
import { useT } from '@/i18n';
import Tooltip from '@/components/Tooltip';
import ProgressSyncDialog, { type syncInfo } from '@/components/ProgressSyncDialog';
import { playerService, readerService, syncService } from '@/api';
import { useActiveBuilds } from '@/hooks/useActiveBuilds';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import logger from '@/lib/logger';

export default function CoverCard({
  book,
  onClick,
  onSelectSeries,
  progress,
  completed,
}: {
  book: MergedBook;
  onClick: (book: MergedBook) => void;
  onSelectSeries?: (series: string) => void;
  progress?: number;
  completed?: boolean;
}) {
  const t = useT();
  const { play } = usePlayerStore();
  const openReader = useReaderStore((s) => s.open);
  const { pref } = useSyncPrefStore();
  const queryClient = useQueryClient();
  const activeBuilds = useActiveBuilds();
  const isTranscribing = activeBuilds.has(book.path);
  const wasTranscribingRef = useRef(false);
  useEffect(() => {
    if (wasTranscribingRef.current && !isTranscribing) {
      queryClient.invalidateQueries({ queryKey: ['transcript-status', book.path] });
    }
    wasTranscribingRef.current = isTranscribing;
  }, [isTranscribing, book.path, queryClient]);

  const hasAudio = !!book._audioPresent || (book.audiobookFiles?.length ?? 0) > 0;
  const hasEbook = !!book._ebookPresent || (book.ebookFiles?.length ?? 0) > 0;
  const both = hasAudio && hasEbook;

  const { data: tsData } = useQuery<{ status: string }>({
    queryKey: ['transcript-status', book.path],
    queryFn: () => syncService.getTranscriptStatus(book.path).then((r) => r.data),
    enabled: both && !isTranscribing,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const transcriptDone = !isTranscribing && tsData?.status === 'ready';
  const transcriptError = !isTranscribing && tsData?.status === 'error';

  const [syncDialog, setSyncDialog] = useState<{
    track: PlayerTrack;
    playerPos: number;
    syncCfi?: string;
    syncInfo?: syncInfo;
  } | null>(null);

  async function handlePlay(e: React.MouseEvent) {
    e.stopPropagation();

    const [playerRes, readerRes] = await Promise.all([
      playerService.getProgress(book.path).catch(() => ({ data: null })),
      both
        ? readerService.getProgress(book.path).catch(() => ({ data: null }))
        : Promise.resolve({ data: null }),
    ]);

    const p = playerRes.data;
    const r = readerRes.data;

    const track: PlayerTrack = {
      bookPath: book.path,
      title: book.savedMeta?.title || book.title,
      author: book.savedMeta?.author || book.author || '',
      cover: book.savedMeta?.cover
        ? coverUrl(book.savedMeta.cover)
        : book.cover
          ? coverUrl(book.cover)
          : null,
      files: book.audiobookFiles || [],
      fileIndex: p?.fileIndex ?? 0,
    };
    const playerPos = p?.position ?? 0;
    const readerPct = r?.percentage ?? 0;
    const ebookUpdatedAt = r?.updatedAt ?? 0;
    const audioUpdatedAt = p?.updatedAt ?? 0;

    if (both && ebookUpdatedAt > audioUpdatedAt && pref !== 'ignore') {
      if (pref === 'sync') {
        try {
          const res = await syncService.ebookToAudio({
            bookPath: book.path,
            ebookPct: readerPct,
            cfi: r?.cfi ?? undefined,
          });
          if (
            res.data.fileSeconds !== undefined &&
            res.data.fileIndex !== undefined &&
            res.data.confidence === 'high'
          ) {
            play({ ...track, fileIndex: res.data.fileIndex }, res.data.fileSeconds);
            return;
          }
        } catch {
          /* fall through */
        }
        play(track, playerPos);
        return;
      }
      const rawPath = p != null ? (track.files[p.fileIndex]?.path ?? '') : '';
      const audioFileName = rawPath.split(/[/\\]/).pop() || null;
      setSyncDialog({
        track,
        playerPos,
        syncCfi: r?.cfi ?? undefined,
        syncInfo: {
          loading: false,
          ebookChapter: r?.chapterTitle ?? null,
          ebookUpdatedAt: r?.updatedAt ?? null,
          ...(r?.snippet && { ebookText: r.snippet }),
          audioFileName,
          audioUpdatedAt: p?.updatedAt ?? null,
          ...(p?.snippet && { audioText: p.snippet }),
        },
      });
      return;
    }

    play(track, playerPos);
  }

  function handleRead(e: React.MouseEvent) {
    e.stopPropagation();
    openReader(book);
  }

  return (
    <div
      onClick={() => onClick(book)}
      className="group flex flex-col items-center text-center cursor-pointer"
    >
      <div
        className="aspect-square w-[85%] bg-surface-elevated rounded-xl overflow-hidden mb-2
                      shadow-md group-hover:shadow-xl group-hover:scale-[1.03] transition-all duration-200 relative"
      >
        {coverUrl(book.savedMeta?.cover || book.cover) ? (
          <img
            src={coverUrl(book.savedMeta?.cover || book.cover)!}
            alt={book.title}
            className="w-full h-full object-contain"
          />
        ) : (
          <div
            className="w-full h-full flex flex-col items-center justify-center gap-2 p-3
                          bg-gradient-to-b from-surface-elevated to-surface-card"
          >
            <BookOpen className="w-6 h-6 text-ink-faint" />
            <p className="text-[10px] text-ink-faint text-center leading-tight line-clamp-4">
              {book.title}
            </p>
          </div>
        )}

        <FormatBadges book={book} mode="overlay-sm" />

        {/* Action overlay */}
        {(hasAudio || hasEbook) && (
          <div className="absolute inset-0 transition-opacity">
            {hasAudio && (
              <button
                onClick={handlePlay}
                className={`absolute left-0 right-0 ${both ? 'top-0 h-1/2' : 'inset-0'} flex items-center justify-center bg-black/50 hover:bg-black/60 transition-colors`}
              >
                <span className="flex items-center justify-center w-9 h-9 rounded-full bg-white/90 shadow">
                  <Play className="w-4 h-4 text-indigo-600 translate-x-0.5" fill="currentColor" />
                </span>
              </button>
            )}
            {both && (
              <>
                <div className="absolute left-3 right-3 top-1/2 -translate-y-px h-px bg-white/20 pointer-events-none" />
                {(isTranscribing || transcriptDone || transcriptError) && (
                  <AudioLines
                    className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none w-5 h-5 drop-shadow ${
                      isTranscribing
                        ? 'text-amber-400 animate-pulse'
                        : transcriptError
                          ? 'text-red-400'
                          : 'text-white'
                    }`}
                  />
                )}
              </>
            )}
            {hasEbook && (
              <button
                onClick={handleRead}
                className={`absolute left-0 right-0 ${both ? 'bottom-0 h-1/2' : 'inset-0'} flex items-center justify-center bg-black/50 hover:bg-black/60 transition-colors`}
              >
                <span className="flex items-center justify-center w-9 h-9 rounded-full bg-white/90 shadow">
                  <BookOpenCheck className="w-4 h-4 text-blue-600" />
                </span>
              </button>
            )}
          </div>
        )}

        {/* Detail button */}
        <Tooltip text={t('book_detail')} className="absolute top-1.5 left-1.5 z-10">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClick(book);
            }}
            className="w-6 h-6 rounded-full bg-black/50 flex items-center justify-center transition-opacity hover:bg-black/70"
          >
            <Info className="w-3 h-3 text-white" />
          </button>
        </Tooltip>

        {/* Volume tag — top left */}
        {extractSeriesNumber(book) && (
          <span className="absolute top-1.5 right-1.5 z-10 text-[9px] font-bold leading-none px-1.5 py-1 rounded-md bg-black/60 text-white backdrop-blur-sm">
            #{extractSeriesNumber(book)}
          </span>
        )}

        {/* Progress bar */}
        {(completed || (progress !== undefined && progress > 0)) && (
          <div className="absolute left-0 right-0 h-1 bg-black/30 rounded-b-xl overflow-hidden bottom-0">
            <div
              className={`h-full rounded-b-xl ${completed ? 'bg-green-500' : 'bg-indigo-500'}`}
              style={{ width: completed ? '100%' : `${Math.min(progress! * 100, 100)}%` }}
            />
          </div>
        )}
      </div>

      <p className="text-xs font-medium text-ink truncate leading-snug w-full">{book.title}</p>
      {extractSeries(book) && (
        onSelectSeries ? (
          <button
            onClick={(e) => { e.stopPropagation(); onSelectSeries(extractSeries(book)!); }}
            className="text-[10px] text-indigo-400 truncate mt-0.5 w-full hover:underline"
          >
            {extractSeries(book)}
          </button>
        ) : (
          <p className="text-[10px] text-indigo-400 truncate mt-0.5 w-full">{extractSeries(book)}</p>
        )
      )}
      {book.author && (
        <p className="text-[11px] text-ink-muted truncate mt-0.5 w-full">{book.author}</p>
      )}

      {syncDialog && (
        <ProgressSyncDialog
          sourceFormat="ebook"
          syncInfo={syncDialog.syncInfo}
          onSync={async () => {
            const d = syncDialog;
            setSyncDialog(null);
            logger.debug('[sync:e→a] CoverCard onSync', { bookPath: book.path });

            try {
              const res = await syncService.ebookToAudio({
                bookPath: book.path,
                cfi: d.syncCfi ?? undefined,
              });
              const result = res.data;
              logger.debug('[sync:e→a] CoverCard result:', {
                confidence: result.confidence,
                fileIndex: result.fileIndex,
                fileSeconds: result.fileSeconds,
              });
              if (
                result.fileSeconds !== undefined &&
                result.fileIndex !== undefined &&
                result.confidence === 'high'
              ) {
                logger.debug(
                  `[sync:e→a] CoverCard → play file ${result.fileIndex} @ ${result.fileSeconds.toFixed(1)}s`,
                );
                play({ ...d.track, fileIndex: result.fileIndex }, result.fileSeconds);
                return;
              }
            } catch (err) {
              logger.error('[sync:e→a] CoverCard ebook-to-audio failed:', err);
            }

            logger.debug('[sync:e→a] CoverCard → no high confidence, play at saved position');
            play(d.track, d.playerPos);
          }}
          onKeep={() => {
            const d = syncDialog;
            setSyncDialog(null);
            play(d.track, d.playerPos);
          }}
          onClose={() => setSyncDialog(null)}
        />
      )}
    </div>
  );
}
