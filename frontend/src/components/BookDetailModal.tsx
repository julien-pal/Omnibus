'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  BookOpen,
  BookMarked,
  Clock,
  Mic,
  File,
  Headphones,
  Search,
  Pencil,
  Zap,
  Trash2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Play,
  CheckCircle,
  BookOpenCheck,
  AudioLines,
  RotateCcw,
  FolderOpen,
  Sparkles,
  Send,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/store/useToastStore';
import { MergedBook, BookMetadata, ProgressEntry, PlayerTrack, ReaderProgressEntry } from '@/types';
import { useT } from '@/i18n';
import { libraryService, playerService, readerService, syncService } from '@/api';
import { settingsService } from '@/api/settingsService';
import { coverUrl, formatBytes } from '@/lib/utils';
import Tooltip from '@/components/Tooltip';

/** Cross-platform autocomplete input — works on mobile Safari/Android */
function SuggestInput({
  value,
  onChange,
  suggestions,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filtered = suggestions
    .filter(
      (s) =>
        s.toLowerCase().includes(value.toLowerCase()) && s.toLowerCase() !== value.toLowerCase(),
    )
    .slice(0, 8);

  function handleBlur() {
    // Delay closing so a tap/click on an item can fire first
    closeTimerRef.current = setTimeout(() => setOpen(false), 200);
  }

  function handleSelect(s: string) {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    onChange(s);
    setOpen(false);
  }

  return (
    <div className="relative w-full">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />
      {open && filtered.length > 0 && (
        <ul
          className="absolute z-50 left-0 right-0 top-full mt-0.5 bg-surface-card border border-surface-border rounded-xl shadow-lg max-h-48 overflow-y-auto"
          style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
          // Prevent blur from firing when the user starts scrolling inside the list
          onPointerDown={(e) => e.preventDefault()}
        >
          {filtered.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => handleSelect(s)}
                className="w-full text-left px-3 py-2.5 text-sm text-ink hover:bg-surface-elevated active:bg-surface-elevated transition-colors"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
import MetadataPickerModal from '@/components/MetadataPickerModal';
import TorrentSearchModal from '@/components/TorrentSearchModal';
import DeleteConfirmModal from '@/components/DeleteConfirmModal';
import FileBrowserModal from '@/components/FileBrowserModal';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useReaderStore } from '@/store/useReaderStore';
import { useSyncPrefStore } from '@/store/useSyncPrefStore';
import useStore from '@/store/useStore';
import ProgressSyncDialog, { type syncInfo } from '@/components/ProgressSyncDialog';
import logger from '@/lib/logger';

const SOURCE_LABEL = {
  audible: { text: 'Audible', cls: 'bg-orange-500/15 text-orange-400 border-orange-500/25' },
  openlibrary: { text: 'Open Library', cls: 'bg-sky-500/15 text-sky-400 border-sky-500/25' },
  googlebooks: { text: 'Google Books', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/25' },
};

export function FormatBadges({ book, mode = 'overlay' }: { book: MergedBook; mode?: string }) {
  const t = useT();
  const ebookPresent = book._ebookPresent;
  const audioPresent = book._audioPresent;
  const ebookWish = book._ebookWish;
  const audioWish = book._audioWish;

  const ebookDownloading = !ebookPresent && book._downloadingEbook;
  const audioDownloading = !audioPresent && book._downloadingAudiobook;
  const ebookNotFound = !ebookPresent && book._notFoundEbook;
  const audioNotFound = !audioPresent && book._notFoundAudiobook;

  const showEbook = ebookPresent || ebookWish;
  const showAudio = audioPresent || audioWish;
  if (!showEbook && !showAudio) return null;

  const small = mode === 'overlay-sm';
  const sz = small ? 'w-4 h-4' : 'w-6 h-6';
  const iconSz = small ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5';

  function wishCls(downloading: boolean | undefined, notFound: boolean | undefined): string {
    if (downloading) return 'bg-black/40 text-blue-400 border-blue-500/70';
    if (notFound) return 'bg-black/40 text-red-400  border-red-500/70';
    return 'bg-black/35 text-white/40 border-white/15';
  }

  function Tooltip({ label }: { label: string }) {
    return (
      <span
        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-1.5 py-0.5 rounded
                       text-[10px] whitespace-nowrap bg-black/85 text-white
                       opacity-0 group-hover/badge:opacity-100 transition-opacity pointer-events-none z-20"
      >
        {label}
      </span>
    );
  }

  const icons = (
    <>
      {showEbook && (
        <span
          className={`relative group/badge flex items-center justify-center ${sz} rounded-md backdrop-blur-sm border ${
            ebookPresent
              ? 'bg-blue-500/80 text-white border-transparent'
              : wishCls(ebookDownloading, ebookNotFound)
          }`}
        >
          <BookOpen className={iconSz} />
          {!ebookPresent && (ebookDownloading || ebookNotFound) && (
            <Tooltip label={ebookDownloading ? t('book_downloading') : t('book_not_found')} />
          )}
        </span>
      )}
      {showAudio && (
        <span
          className={`relative group/badge flex items-center justify-center ${sz} rounded-md backdrop-blur-sm border ${
            audioPresent
              ? 'bg-violet-500/80 text-white border-transparent'
              : wishCls(audioDownloading, audioNotFound)
          }`}
        >
          <Headphones className={iconSz} />
          {!audioPresent && (audioDownloading || audioNotFound) && (
            <Tooltip label={audioDownloading ? t('book_downloading') : t('book_not_found')} />
          )}
        </span>
      )}
    </>
  );

  if (mode === 'inline') {
    return <span className="flex items-center gap-0.5 flex-shrink-0">{icons}</span>;
  }
  return (
    <span
      className={`absolute flex items-center gap-0.5 ${small ? 'bottom-0.5 right-0.5' : 'bottom-1.5 right-1.5'}`}
    >
      {icons}
    </span>
  );
}

export default function BookDetailModal({
  book,
  onClose,
  onDeleted,
}: {
  book: MergedBook;
  onSelect?: (book: MergedBook) => void;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const t = useT();
  if (!book) return null;

  const [meta, setMeta] = useState<BookMetadata | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [audioCollapsed, setAudioCollapsed] = useState(false);
  const [ebookCollapsed, setEbookCollapsed] = useState(false);
  const [sendingToReader, setSendingToReader] = useState(false);
  const [showReaderEmailPrompt, setShowReaderEmailPrompt] = useState(false);
  const [readerEmailInput, setReaderEmailInput] = useState('');

  const { data: suggestions } = useQuery<{
    authors: string[];
    series: string[];
    narrators: string[];
  }>({
    queryKey: ['library-suggestions'],
    queryFn: () => libraryService.getSuggestions().then((r) => r.data),
    enabled: editing,
    staleTime: 5 * 60 * 1000,
  });
  const [showTorrentSearch, setShowTorrentSearch] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCoverPicker, setShowCoverPicker] = useState(false);
  const [transcriptStatus, setTranscriptStatus] = useState<
    'none' | 'building' | 'ready' | 'error' | null
  >(null);
  const [transcriptBuilding, setTranscriptBuilding] = useState(false);
  const [transcriptProgress, setTranscriptProgress] = useState<{
    total: number;
    done: number[];
    inProgress: number[];
    fileProgress: Record<number, number>;
    fileErrors?: Record<number, string>;
  } | null>(null);

  const currentTrack = usePlayerStore((s) => s.track);
  const isCurrentlyPlaying = currentTrack?.bookPath === book.path;
  const openReader = useReaderStore((s) => s.open);
  const { pref } = useSyncPrefStore();
  const syncEnabled = useStore((s) => s.syncEnabled);
  const queryClient = useQueryClient();
  const [bookProgress, setBookProgress] = useState<{
    percentage?: number;
    completed?: boolean;
  } | null>(null);
  const [playerFileIndex, setPlayerFileIndex] = useState<number | null>(null);
  const [syncDialog, setSyncDialog] = useState<{
    track: PlayerTrack;
    playerPos: number;
    syncCfi?: string;
    syncInfo?: syncInfo;
  } | null>(null);

  const hasAudio = !!book._audioPresent || (book.audiobookFiles?.length ?? 0) > 0;
  const hasEbook = !!book._ebookPresent || (book.ebookFiles?.length ?? 0) > 0;
  const both = hasAudio && hasEbook;

  useEffect(() => {
    const encoded = encodeURIComponent(book.path);
    Promise.all([
      playerService.getProgress(book.path).catch(() => ({ data: null })),
      readerService.getProgress(book.path).catch(() => ({ data: null })),
    ]).then(([player, reader]) => {
      const p = player.data;
      const r = reader.data;
      if (p?.fileIndex !== undefined) setPlayerFileIndex(p.fileIndex);
      if (!p && !r) return;
      if (!p) return setBookProgress(r);
      if (!r) return setBookProgress(p);
      // Keep whichever has higher percentage
      setBookProgress((p.percentage ?? 0) >= (r.percentage ?? 0) ? p : r);
    });
  }, [book.path]);

  async function handleMarkComplete() {
    const calls = [];
    if (book._audioPresent || (book.audiobookFiles?.length ?? 0) > 0)
      calls.push(playerService.markComplete(book.path));
    if (book._ebookPresent || (book.ebookFiles?.length ?? 0) > 0)
      calls.push(readerService.markComplete(book.path));
    if (!calls.length) calls.push(playerService.markComplete(book.path));
    await Promise.all(calls);
    queryClient.invalidateQueries({ queryKey: ['player-progress-all'] });
    queryClient.invalidateQueries({ queryKey: ['reader-progress-all'] });
    setBookProgress({ percentage: 1, completed: true });
  }

  async function handleSendToReader() {
    setSendingToReader(true);
    try {
      const settingsRes = await settingsService.getEmailSettings();
      const readerEmail = settingsRes.data.readerEmail;
      if (!readerEmail) {
        setSendingToReader(false);
        setShowReaderEmailPrompt(true);
        return;
      }
      await doSendToReader(readerEmail);
    } catch (err) {
      toast.error((err as Error).message);
      setSendingToReader(false);
    }
  }

  async function doSendToReader(email: string) {
    setSendingToReader(true);
    const EBOOK_EXTS = new Set(['.epub', '.mobi', '.azw3', '.pdf']);
    const ebookPath =
      book.ebookFiles?.[0]?.path ||
      book.files?.find((f) => EBOOK_EXTS.has('.' + f.ext))?.path;
    if (!ebookPath) {
      toast.error('No ebook file found');
      setSendingToReader(false);
      return;
    }
    try {
      await libraryService.sendToReader(ebookPath);
      toast.success(t('send_to_reader_sent').replace('{email}', email));
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e.response?.data?.error || (err as Error).message);
    } finally {
      setSendingToReader(false);
    }
  }

  async function handleReaderEmailConfirm() {
    if (!readerEmailInput) return;
    try {
      await settingsService.updateEmailSettings({ readerEmail: readerEmailInput });
      setShowReaderEmailPrompt(false);
      await doSendToReader(readerEmailInput);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function handleBuildTranscript() {
    setTranscriptBuilding(true);
    try {
      await syncService.buildTranscript({
        bookPath: book.path,
        audioFiles: (book.audiobookFiles || []).map((f) => ({ path: f.path })),
        epubPath: book.ebookFiles?.[0]?.path,
      });
      setTranscriptStatus('building');
      setTranscriptProgress({
        total: book.audiobookFiles?.length ?? 0,
        done: [],
        inProgress: [],
        fileProgress: {},
      });
      toast.success(t('whisper_transcript_building'));
      prevTranscriptStatusRef.current = 'building';
      if (pollTranscriptRef.current) clearTimeout(pollTranscriptRef.current);
      pollTranscriptRef.current = setTimeout(pollTranscriptStatus, 10000);
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      toast.error(e.response?.data?.error || e.message || 'Error');
    } finally {
      setTranscriptBuilding(false);
    }
  }

  const cover = coverUrl(meta?.cover || book.cover);

  async function handlePlay() {
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
      title: meta?.title || book.title,
      author: meta?.author || book.author || '',
      cover: meta?.cover ? coverUrl(meta.cover) : book.cover ? coverUrl(book.cover) : null,
      files: book.audiobookFiles || [],
      fileIndex: p?.fileIndex ?? 0,
    };
    const playerPos = p?.position ?? 0;
    const readerPct = r?.percentage ?? 0;
    const ebookUpdatedAt = r?.updatedAt ?? 0;
    const audioUpdatedAt = p?.updatedAt ?? 0;

    const { play } = usePlayerStore.getState();

    if (both && ebookUpdatedAt > audioUpdatedAt && pref !== 'ignore') {
      if (pref === 'sync') {
        // Auto-sync via text-based ebook-to-audio
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
            onClose();
            play({ ...track, fileIndex: res.data.fileIndex }, res.data.fileSeconds);
            return;
          }
        } catch {
          /* fall through */
        }
        onClose();
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

    onClose();
    play(track, playerPos);
  }

  useEffect(() => {
    if (book.savedMeta) setMeta(book.savedMeta);
  }, [book.savedMeta]);

  // Load transcript status when both formats are present
  const pollTranscriptRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptPollCancelledRef = useRef(false);
  const prevTranscriptStatusRef = useRef<string | undefined>(undefined);

  const pollTranscriptStatus = useCallback(async () => {
    if (transcriptPollCancelledRef.current) return;
    try {
      const [statusRes, progressRes] = await Promise.all([
        syncService.getTranscriptStatus(book.path),
        syncService.getTranscriptProgress(book.path).catch(() => ({ data: null })),
      ]);
      if (transcriptPollCancelledRef.current) return;
      const { status, error } = statusRes.data;
      const prev = prevTranscriptStatusRef.current;
      prevTranscriptStatusRef.current = status;
      setTranscriptStatus(status as 'none' | 'building' | 'ready' | 'error');
      if (status === 'building') {
        setTranscriptProgress(
          progressRes.data
            ? {
                total: progressRes.data.total,
                done: progressRes.data.done ?? [],
                inProgress: progressRes.data.inProgress ?? [],
                fileProgress: progressRes.data.fileProgress ?? {},
                fileErrors: progressRes.data.fileErrors,
              }
            : null,
        );
        pollTranscriptRef.current = setTimeout(pollTranscriptStatus, 10000);
      } else {
        setTranscriptProgress(null);
        if (prev === 'building') {
          if (status === 'ready') toast.success(t('whisper_transcript_ready'));
          else toast.error(error || t('whisper_test_fail'));
        }
      }
    } catch {
      /* whisper not configured, ignore */
    }
  }, [book.path, t]);

  useEffect(() => {
    if (!both || (book.audiobookFiles?.length ?? 0) === 0) return;
    transcriptPollCancelledRef.current = false;
    prevTranscriptStatusRef.current = undefined;
    pollTranscriptStatus();
    return () => {
      transcriptPollCancelledRef.current = true;
      if (pollTranscriptRef.current) clearTimeout(pollTranscriptRef.current);
    };
  }, [book.path, both, pollTranscriptStatus]);

  function startEditing() {
    const src = meta || book.savedMeta || {};
    const seriesRaw = typeof src.series === 'string' ? src.series : '';
    const sm = seriesRaw.match(/^(.+?)\s+#(\d+(?:\.\d+)?)$/);
    setEditFields({
      title: src.title || book.title || '',
      author: src.author || book.author || '',
      cover: src.cover || '',
      seriesName: sm ? sm[1].trim() : seriesRaw,
      seriesSequence: sm ? sm[2] : src.seriesSequence || '',
      year: src.year || '',
      narrator: src.narrator || '',
      runtime: src.runtime || '',
      description: src.description || '',
    });
    setEditing(true);
  }

  function field(key: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setEditFields((f) => ({ ...f, [key]: e.target.value }));
  }

  async function saveMetadata() {
    if (!book.path) return setMetaError(t('book_no_results'));
    setSaving(true);
    setMetaError('');
    try {
      const seriesStr = editFields.seriesSequence
        ? `${editFields.seriesName} #${editFields.seriesSequence}`
        : editFields.seriesName;
      const r = await libraryService.updateBook({
        path: book.path,
        ...editFields,
        series: seriesStr,
        year: editFields['year'] ? parseInt(editFields['year'], 10) : null,
        source: meta?.source || 'manual',
      });
      setMeta(r.data);
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['library'] });
      queryClient.invalidateQueries({ queryKey: ['library-suggestions'] });
      toast.success(t('book_meta_saved'));
    } catch (e) {
      const err = e as import('axios').AxiosError<{ error: string }>;
      setMetaError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  }

  async function applyPick(item: BookMetadata) {
    setShowPicker(false);
    setMetaLoading(true);
    setMetaError('');
    try {
      if (book.path) {
        const saved = await libraryService.updateBook({
          path: book.path,
          ...item,
          year: item.year ? parseInt(String(item.year), 10) : null,
        });
        setMeta(saved.data);
        queryClient.invalidateQueries({ queryKey: ['library'] });
        toast.success(t('book_meta_updated'));
      } else {
        setMeta(item);
      }
    } catch (e) {
      const err = e as import('axios').AxiosError<{ error: string }>;
      setMetaError(err.response?.data?.error || err.message);
      toast.error(t('book_meta_error'));
    } finally {
      setMetaLoading(false);
    }
  }

  const sourceInfo = meta?.source
    ? SOURCE_LABEL[meta.source as keyof typeof SOURCE_LABEL]
    : undefined;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <div
          className="relative bg-surface-card border border-surface-border rounded-2xl w-full max-w-4xl shadow-modal overflow-hidden flex flex-col max-h-[80dvh] md:max-h-[95vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Edit form or display view */}
          {editing ? (
            <div className="flex flex-col gap-4 p-5 border-b border-surface-border overflow-y-auto flex-1 min-h-0">
              {/* Form header */}
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink">{t('book_edit')}</h3>
                <button
                  onClick={() => setEditing(false)}
                  className="btn-ghost w-8 h-8 p-0 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {/* Cover preview + URL/path input + file picker btn */}
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-24 aspect-square bg-surface-elevated rounded-xl overflow-hidden shadow">
                  {editFields.cover || cover ? (
                    <img
                      src={
                        editFields.cover
                          ? (coverUrl(editFields.cover) ?? undefined)
                          : (cover ?? undefined)
                      }
                      alt=""
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <BookOpen className="w-6 h-6 text-ink-faint" />
                    </div>
                  )}
                </div>
                <div className="flex-1 flex flex-col gap-2">
                  <label className="text-[11px] text-ink-faint">{t('book_cover_label')}</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={editFields.cover}
                      onChange={field('cover')}
                      placeholder={t('book_cover_placeholder')}
                      className="input text-[11px] px-2 py-1 h-auto flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCoverPicker(true)}
                      className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border border-surface-border text-ink-muted hover:bg-surface-elevated hover:text-ink transition-colors"
                      title={t('book_cover_browse')}
                    >
                      <FolderOpen className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
              {/* Fields grid */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 content-start">
                <div className="col-span-2">
                  <label className="block text-[11px] text-ink-faint mb-0.5">
                    {t('book_title_label')}
                  </label>
                  <input
                    type="text"
                    value={editFields.title}
                    onChange={field('title')}
                    className="input text-sm w-full"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-ink-faint mb-0.5">
                    {t('book_author_label')}
                  </label>
                  <SuggestInput
                    value={editFields.author}
                    onChange={(v) => setEditFields((f) => ({ ...f, author: v }))}
                    suggestions={suggestions?.authors ?? []}
                    className="input text-sm w-full"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-ink-faint mb-0.5">
                    {t('book_year_label')}
                  </label>
                  <input
                    type="number"
                    value={editFields.year}
                    onChange={field('year')}
                    className="input text-sm w-full"
                  />
                </div>
                <div className="col-span-2 grid grid-cols-[1fr_80px] gap-2">
                  <div>
                    <label className="block text-[11px] text-ink-faint mb-0.5">
                      {t('book_series_label')}
                    </label>
                    <SuggestInput
                      value={editFields.seriesName}
                      onChange={(v) => setEditFields((f) => ({ ...f, seriesName: v }))}
                      suggestions={suggestions?.series ?? []}
                      placeholder={t('book_series_placeholder')}
                      className="input text-sm w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-ink-faint mb-0.5">
                      {t('book_volume_label')}
                    </label>
                    <input
                      type="text"
                      value={editFields.seriesSequence}
                      onChange={field('seriesSequence')}
                      placeholder={t('book_volume_placeholder')}
                      className="input text-sm w-full"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-ink-faint mb-0.5">
                    {t('book_duration_label')}
                  </label>
                  <input
                    type="text"
                    value={editFields.runtime}
                    onChange={field('runtime')}
                    placeholder={t('book_duration_placeholder')}
                    className="input text-sm w-full"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[11px] text-ink-faint mb-0.5">
                    {t('book_narrator_label')}
                  </label>
                  <SuggestInput
                    value={editFields.narrator}
                    onChange={(v) => setEditFields((f) => ({ ...f, narrator: v }))}
                    suggestions={suggestions?.narrators ?? []}
                    className="input text-sm w-full"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[11px] text-ink-faint mb-0.5">
                    {t('book_description_label')}
                  </label>
                  <textarea
                    value={editFields.description}
                    onChange={field('description')}
                    rows={5}
                    className="input text-sm w-full resize-none"
                  />
                </div>
              </div>
            </div>
          ) : (
            /* Display view — fixed, not scrollable */
            <div className="flex-shrink-0 relative flex flex-col sm:flex-row items-start gap-3 px-4 pt-4 pb-4 border-b border-surface-border">
              <button
                onClick={onClose}
                className="absolute top-3 right-3 btn-ghost w-8 h-8 p-0 rounded-lg z-10"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="relative w-1/2 mx-auto sm:mx-0 sm:w-36 flex-shrink-0 aspect-square bg-surface-elevated rounded-xl overflow-hidden shadow group/cover">
                {cover ? (
                  <img src={cover} alt={book.title} className="w-full h-full object-contain" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <BookOpen className="w-6 h-6 text-ink-faint" />
                  </div>
                )}

                {/* Progress bar */}
                {(bookProgress?.completed ||
                  (bookProgress?.percentage && bookProgress.percentage > 0)) && (
                  <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/30">
                    <div
                      className={`h-full ${bookProgress.completed ? 'bg-green-500' : 'bg-indigo-500'}`}
                      style={{
                        width: bookProgress.completed
                          ? '100%'
                          : `${Math.min((bookProgress.percentage ?? 0) * 100, 100)}%`,
                      }}
                    />
                  </div>
                )}

                {/* Split overlay: top = audio, bottom = ebook */}
                {(book._audioPresent || book._ebookPresent) &&
                  (() => {
                    const hasAudio = !!book._audioPresent;
                    const hasEbook = !!book._ebookPresent;
                    const both = hasAudio && hasEbook;
                    return (
                      <div className="absolute inset-0 transition-opacity">
                        {hasAudio && (
                          <button
                            onClick={handlePlay}
                            className={`absolute left-0 right-0 ${both ? 'top-0 h-1/2' : 'inset-0'} flex items-center justify-center bg-black/50 hover:bg-black/60 transition-colors`}
                          >
                            <span
                              className={`flex items-center justify-center w-9 h-9 rounded-full shadow ${isCurrentlyPlaying ? 'bg-indigo-500' : 'bg-white/90'}`}
                            >
                              <Play
                                className={`w-4 h-4 ${isCurrentlyPlaying ? 'text-white' : 'text-indigo-600'} translate-x-0.5`}
                                fill="currentColor"
                              />
                            </span>
                          </button>
                        )}
                        {both && (
                          <div className="absolute left-4 right-4 top-1/2 -translate-y-px h-px bg-white/20" />
                        )}
                        {hasEbook && (
                          <button
                            onClick={() => {
                              openReader(book);
                              onClose();
                            }}
                            className={`absolute left-0 right-0 ${both ? 'bottom-0 h-1/2' : 'inset-0'} flex items-center justify-center bg-black/50 hover:bg-black/60 transition-colors`}
                          >
                            <span className="flex items-center justify-center w-9 h-9 rounded-full shadow bg-white/90">
                              <BookOpenCheck className="w-4 h-4 text-blue-600" />
                            </span>
                          </button>
                        )}
                      </div>
                    );
                  })()}
              </div>
              <div className="flex-1 min-w-0 w-full sm:w-auto pt-0.5 flex flex-col min-h-0">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-sm font-semibold text-ink leading-tight">
                    {meta?.title || book.title}
                  </h2>
                </div>
                {/* Author + narrator inline */}
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <p className="text-xs text-ink-muted">{meta?.author || book.author}</p>
                  {meta?.narrator && (
                    <span className="flex items-center gap-1 text-[11px] px-1.5 py-0 rounded-full bg-surface-elevated text-ink-faint border border-surface-border">
                      <Mic className="w-2.5 h-2.5" />
                      {meta.narrator}
                    </span>
                  )}
                </div>

                {/* Meta pills */}
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {meta?.series && (
                    <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/25">
                      <BookMarked className="w-2.5 h-2.5" />
                      {meta.series}
                    </span>
                  )}
                  {meta?.year && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-surface-elevated text-ink-muted border border-surface-border">
                      {meta.year}
                    </span>
                  )}
                  {meta?.runtime && (
                    <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-surface-elevated text-ink-muted border border-surface-border">
                      <Clock className="w-2.5 h-2.5" />
                      {meta.runtime}
                    </span>
                  )}
                  {sourceInfo && (
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full border ${sourceInfo.cls}`}
                    >
                      {sourceInfo.text}
                    </span>
                  )}
                  {!!meta?.savedAt && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {t('book_saved_badge')}
                    </span>
                  )}
                </div>

                {/* Description — scrollable, no more/less toggle */}
                {meta?.description && (
                  <div className="mt-2 overflow-y-auto max-h-24 sm:max-h-32 pr-1">
                    <div
                      className="text-[11px] text-ink-muted leading-relaxed prose prose-xs max-w-none"
                      dangerouslySetInnerHTML={{ __html: meta.description }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Scrollable file list ── */}
          {!editing &&
            ((book.ebookFiles?.length ?? 0) > 0 || (book.audiobookFiles?.length ?? 0) > 0 ? (
              <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-surface-border">
                {(book.audiobookFiles?.length ?? 0) > 0 && (
                  <>
                    <button
                      onClick={() => setAudioCollapsed((v) => !v)}
                      className="w-full flex items-center gap-1.5 px-5 py-2 bg-surface-elevated hover:bg-surface-elevated/80 transition-colors"
                    >
                      <Headphones className="w-3 h-3 text-violet-400" />
                      <span className="text-[11px] font-medium text-violet-400 flex-1 text-left">
                        Audiobook
                      </span>
                      <span className="text-[11px] text-ink-faint">
                        {book.audiobookFiles!.length}
                      </span>
                      {audioCollapsed ? (
                        <ChevronDown className="w-3 h-3 text-ink-faint" />
                      ) : (
                        <ChevronUp className="w-3 h-3 text-ink-faint" />
                      )}
                    </button>
                    {!audioCollapsed &&
                      book.audiobookFiles!.map((f, i) => {
                        const isProcessing =
                          transcriptStatus === 'building' &&
                          (transcriptProgress?.inProgress ?? []).includes(i);
                        const isDone =
                          transcriptStatus === 'ready' ||
                          (transcriptProgress?.done ?? []).includes(i);
                        const fileError = transcriptProgress?.fileErrors?.[i];
                        const hasError = !!fileError;
                        const isListened =
                          bookProgress?.completed ||
                          (playerFileIndex !== null && i < playerFileIndex);
                        return (
                          <div
                            key={i}
                            className="flex items-center gap-2.5 px-5 py-2 text-xs text-ink-muted hover:bg-surface-elevated transition-colors"
                          >
                            {isProcessing ? (
                              <AudioLines className="w-3.5 h-3.5 flex-shrink-0 text-indigo-400 animate-pulse" />
                            ) : hasError ? (
                              <AudioLines className="w-3.5 h-3.5 flex-shrink-0 text-red-400" />
                            ) : isDone ? (
                              <AudioLines className="w-3.5 h-3.5 flex-shrink-0 text-green-400" />
                            ) : (
                              <File className="w-3.5 h-3.5 flex-shrink-0 text-ink-faint" />
                            )}
                            <span className="flex-1 truncate" title={fileError}>
                              {f.name}
                            </span>
                            <span className="flex-shrink-0 text-ink-faint">
                              {f.ext?.toUpperCase()}
                            </span>
                            <span className="flex-shrink-0 text-ink-faint tabular-nums">
                              {formatBytes(f.size)}
                            </span>
                            {isListened && (
                              <Tooltip text={t('book_mark_complete')}>
                                <CheckCircle className="w-3.5 h-3.5 flex-shrink-0 text-green-400" />
                              </Tooltip>
                            )}
                            {hasError && !transcriptBuilding && transcriptStatus !== 'building' && (
                              <button
                                onClick={handleBuildTranscript}
                                className="flex-shrink-0 text-red-400 hover:text-red-300 hover:bg-red-500/15 rounded p-0.5 transition-colors"
                                title={fileError}
                              >
                                <RotateCcw className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                  </>
                )}
                {(book.ebookFiles?.length ?? 0) > 0 && (
                  <>
                    <button
                      onClick={() => setEbookCollapsed((v) => !v)}
                      className="w-full flex items-center gap-1.5 px-5 py-2 bg-surface-elevated hover:bg-surface-elevated/80 transition-colors"
                    >
                      <BookOpen className="w-3 h-3 text-blue-400" />
                      <span className="text-[11px] font-medium text-blue-400 flex-1 text-left">
                        Ebook
                      </span>
                      <span className="text-[11px] text-ink-faint">{book.ebookFiles!.length}</span>
                      {ebookCollapsed ? (
                        <ChevronDown className="w-3 h-3 text-ink-faint" />
                      ) : (
                        <ChevronUp className="w-3 h-3 text-ink-faint" />
                      )}
                    </button>
                    {!ebookCollapsed &&
                      book.ebookFiles!.map((f, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2.5 px-5 py-2 text-xs text-ink-muted hover:bg-surface-elevated transition-colors"
                        >
                          <File className="w-3.5 h-3.5 flex-shrink-0 text-ink-faint" />
                          <span className="flex-1 truncate">{f.name}</span>
                          <span className="flex-shrink-0 text-ink-faint">
                            {f.ext?.toUpperCase()}
                          </span>
                          <span className="flex-shrink-0 text-ink-faint tabular-nums">
                            {formatBytes(f.size)}
                          </span>
                        </div>
                      ))}
                  </>
                )}
              </div>
            ) : (
              (book.files || []).length > 0 && (
                <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-surface-border">
                  {(book.files || []).map((f, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2.5 px-5 py-2 text-xs text-ink-muted hover:bg-surface-elevated transition-colors"
                    >
                      <File className="w-3.5 h-3.5 flex-shrink-0 text-ink-faint" />
                      <span className="flex-1 truncate">{f.name}</span>
                      <span className="flex-shrink-0 text-ink-faint">{f.ext?.toUpperCase()}</span>
                      <span className="flex-shrink-0 text-ink-faint tabular-nums">
                        {formatBytes(f.size)}
                      </span>
                    </div>
                  ))}
                </div>
              )
            ))}

          {metaError && (
            <div className="mx-4 mt-3 mb-3 p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 flex items-center gap-2 flex-shrink-0">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {metaError}
            </div>
          )}

          {/* Inline Kindle email prompt */}
          {showReaderEmailPrompt && (
            <div className="absolute inset-0 bg-surface-base/80 backdrop-blur-sm flex items-center justify-center z-10 rounded-2xl">
              <div className="bg-surface-card border border-surface-border rounded-xl p-5 w-72 space-y-3 shadow-modal">
                <p className="text-sm font-medium text-ink">{t('send_to_reader_no_email')}</p>
                <input
                  type="email"
                  value={readerEmailInput}
                  onChange={(e) => setReaderEmailInput(e.target.value)}
                  placeholder="yourname@kindle.com"
                  className="input w-full"
                  onKeyDown={(e) => e.key === 'Enter' && handleReaderEmailConfirm()}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button onClick={handleReaderEmailConfirm} className="btn-primary flex-1">{t('send_to_reader_confirm')}</button>
                  <button onClick={() => setShowReaderEmailPrompt(false)} className="btn-secondary flex-1">{t('book_cancel')}</button>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="p-4 pt-3 flex items-center justify-between flex-shrink-0 border-t border-surface-border">
            {editing ? (
              <>
                <button onClick={() => setEditing(false)} className="btn-secondary flex-1">
                  {t('book_cancel')}
                </button>
                <button
                  onClick={saveMetadata}
                  disabled={saving}
                  className="btn-primary flex-1 flex items-center justify-center gap-1.5"
                >
                  {saving ? (
                    <>
                      <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8v8H4z"
                        />
                      </svg>{' '}
                      {t('book_saving')}
                    </>
                  ) : (
                    <>
                      <BookMarked className="w-3.5 h-3.5" /> {t('book_save')}
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                {onDeleted && (
                  <Tooltip text={t('book_delete')}>
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      title={t('book_delete')}
                      className="h-10 px-3 flex items-center justify-center rounded-xl border border-red-500/30 text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </Tooltip>
                )}
                {both && transcriptStatus !== null && syncEnabled && (
                  <Tooltip
                    text={t(
                      transcriptStatus === 'ready'
                        ? 'whisper_build_transcript_rebuild'
                        : transcriptStatus === 'building'
                          ? 'whisper_transcript_building'
                          : 'whisper_build_transcript',
                    )}
                  >
                    <button
                      onClick={handleBuildTranscript}
                      disabled={transcriptBuilding || transcriptStatus === 'building'}
                      title={t(transcriptStatus === 'ready' ? 'whisper_build_transcript_rebuild' : transcriptStatus === 'building' ? 'whisper_transcript_building' : 'whisper_build_transcript')}
                      className={`h-10 px-3 flex items-center justify-center rounded-xl border transition-colors ${
                        transcriptStatus === 'ready'
                          ? 'border-green-500/30 text-green-400 hover:bg-green-500/15'
                          : transcriptStatus === 'building'
                            ? 'border-amber-500/30 text-amber-400 cursor-default'
                            : 'border-surface-border text-ink-muted hover:bg-surface-elevated'
                      }`}
                    >
                      <AudioLines
                        className={`w-4 h-4 ${transcriptStatus === 'building' ? 'animate-pulse' : ''}`}
                      />
                    </button>
                  </Tooltip>
                )}
                {((book.audiobookFiles?.length ?? 0) > 0 ||
                  (book.ebookFiles?.length ?? 0) > 0) && (
                  <Tooltip text={t('book_mark_complete')}>
                    <button
                      onClick={handleMarkComplete}
                      title={t('book_mark_complete')}
                      className="h-10 px-3 flex items-center justify-center rounded-xl border border-surface-border text-ink-muted hover:bg-green-500/15 hover:border-green-500/30 hover:text-green-400 transition-colors"
                    >
                      <CheckCircle className="w-4 h-4" />
                    </button>
                  </Tooltip>
                )}
                {hasEbook && (
                  <Tooltip text={t('send_to_reader')}>
                    <button
                      onClick={handleSendToReader}
                      disabled={sendingToReader}
                      className="h-10 px-3 flex items-center justify-center rounded-xl border border-surface-border text-ink-muted hover:bg-indigo-500/15 hover:border-indigo-500/30 hover:text-indigo-300 transition-colors disabled:opacity-50"
                    >
                      {sendingToReader
                        ? <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
                        : <Send className="w-4 h-4" />
                      }
                    </button>
                  </Tooltip>
                )}
                {(book.wishlist ||
                  book.savedMeta?.wishlist ||
                  (book as MergedBook)._ebookWish ||
                  (book as MergedBook)._audioWish) && (
                  <Tooltip text={t('book_download')}>
                    <button
                      onClick={() => setShowTorrentSearch(true)}
                      title={t('book_download')}
                      className="h-10 px-3 sm:px-4 flex items-center justify-center gap-1.5 rounded-xl border border-amber-500/25 text-amber-400 hover:bg-amber-500/15 transition-colors text-sm font-medium"
                    >
                      <Zap className="w-4 h-4" />
                      <span className="hidden sm:inline">{t('book_download')}</span>
                    </button>
                  </Tooltip>
                )}
                <Tooltip text={t('book_edit')}>
                  <button
                    onClick={startEditing}
                    title={t('book_edit')}
                    className="h-10 px-3 sm:px-4 flex items-center justify-center gap-1.5 rounded-xl border border-surface-border text-ink-muted hover:bg-surface-elevated transition-colors text-sm font-medium"
                  >
                    <Pencil className="w-4 h-4" />
                    <span className="hidden sm:inline">{t('book_edit')}</span>
                  </button>
                </Tooltip>
                <Tooltip text={t('book_enrich')}>
                  <button
                    onClick={() => setShowPicker(true)}
                    disabled={metaLoading}
                    title={t('book_enrich')}
                    className="h-10 px-3 sm:px-4 flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors text-sm font-medium disabled:opacity-50"
                  >
                    {metaLoading ? (
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    <span className="hidden sm:inline">{t('book_enrich')}</span>
                  </button>
                </Tooltip>
              </>
            )}
          </div>
        </div>
      </div>

      {showPicker && (
        <MetadataPickerModal
          book={book}
          onSelect={applyPick}
          onClose={() => setShowPicker(false)}
        />
      )}

      {showCoverPicker && (
        <FileBrowserModal
          mode="file"
          title={t('book_cover_browse')}
          initialPath={book.path ? book.path.replace(/[/\\][^/\\]+$/, '') : undefined}
          onSelect={(p) => {
            setEditFields((f) => ({ ...f, cover: p }));
            setShowCoverPicker(false);
          }}
          onClose={() => setShowCoverPicker(false)}
        />
      )}

      {showTorrentSearch && (
        <TorrentSearchModal book={book} onClose={() => setShowTorrentSearch(false)} />
      )}

      {showDeleteConfirm && (
        <DeleteConfirmModal
          title={meta?.title || book.title}
          onConfirm={async (deleteFiles) => {
            await libraryService.deleteBook(book.path, deleteFiles);
            onDeleted?.();
          }}
          onClose={() => setShowDeleteConfirm(false)}
        />
      )}

      {syncDialog && (
        <ProgressSyncDialog
          sourceFormat="ebook"
          syncInfo={syncDialog.syncInfo}
          onSync={async () => {
            const d = syncDialog;
            setSyncDialog(null);
            onClose();
            logger.debug('[sync:e→a] BookDetailModal onSync', { bookPath: book.path });

            try {
              const res = await syncService.ebookToAudio({
                bookPath: book.path,
                cfi: d.syncCfi ?? undefined,
              });
              const result = res.data;
              logger.debug('[sync:e→a] BookDetailModal result:', {
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
                  `[sync:e→a] BookDetailModal → play file ${result.fileIndex} @ ${result.fileSeconds.toFixed(1)}s`,
                );
                usePlayerStore
                  .getState()
                  .play({ ...d.track, fileIndex: result.fileIndex }, result.fileSeconds);
                return;
              }
            } catch (err) {
              logger.error('[sync:e→a] BookDetailModal ebook-to-audio failed:', err);
            }

            logger.debug('[sync:e→a] BookDetailModal → no high confidence, play at saved position');
            usePlayerStore.getState().play(d.track, d.playerPos);
          }}
          onKeep={() => {
            const d = syncDialog;
            setSyncDialog(null);
            onClose();
            usePlayerStore.getState().play(d.track, d.playerPos);
          }}
          onClose={() => setSyncDialog(null)}
        />
      )}
    </>
  );
}
