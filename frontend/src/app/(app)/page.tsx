'use client';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Library as LibraryIcon,
  BookOpen,
  Headphones,
  Layers,
  X,
  Search,
  User,
  BookText,
  LayoutGrid,
  LayoutList,
  ChevronDown,
  ArrowLeft,
  Trash2,
  Plus,
  CheckCircle,
  SlidersHorizontal,
  Eye,
  EyeOff,
  Send,
} from 'lucide-react';
import { libraryService, playerService, readerService } from '@/api';
import { settingsService, FollowEntry } from '@/api/settingsService';
import { toast } from '@/store/useToastStore';
import BookCard from '@/components/BookCard';
import useStore from '@/store/useStore';
import { ScannerBook, MergedBook } from '@/types';
import { useT } from '@/i18n';
import Link from 'next/link';
import { coverUrl } from '@/lib/utils';
import { extractSeries, mergeBooksByTitle, buildSeriesGroups } from '@/lib/libraryUtils';
import BookDetailModal from '@/components/BookDetailModal';
import Tooltip from '@/components/Tooltip';
import DeleteConfirmModal from '@/components/DeleteConfirmModal';
import SeriesTile from '@/components/library/SeriesTile';
import CoverCard from '@/components/library/CoverCard';
import BookListRow from '@/components/library/BookListRow';
import SeriesListRow from '@/components/library/SeriesListRow';
import SkeletonGrid from '@/components/library/SkeletonGrid';
import { usePlayerStore } from '@/store/usePlayerStore';

const GROUP_MODES = [
  { value: 'author', labelKey: 'library_group_author' as const, Icon: User },
  { value: 'series', labelKey: 'library_group_series' as const, Icon: BookText },
  { value: 'none', labelKey: 'library_group_books' as const, Icon: LayoutGrid },
];

const TYPE_ICON = {
  audiobook: Headphones,
  mixed: Layers,
  ebook: BookOpen,
};

export default function Library() {
  const t = useT();
  const queryClient = useQueryClient();
  const track = usePlayerStore((s) => s.track);
  const [selectedLibrary, setSelectedLibraryState] = useState<
    (import('@/types').Library & { type: string }) | null
  >(null);
  const [openBook, setOpenBook] = useState<MergedBook | null>(null);
  const [deleteSeriesTarget, setDeleteSeriesTarget] = useState<{
    name: string;
    books: MergedBook[];
  } | null>(null);
  const [sendingSeriesAll, setSendingSeriesAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [groupBy, setGroupBy] = useState<string>(() =>
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('group') ||
        localStorage.getItem('library_groupBy') ||
        'author'
      : 'author',
  );
  const [libPickerOpen, setLibPickerOpen] = useState(false);
  const libPickerRef = useRef<HTMLDivElement | null>(null);
  const libPickerRefDesktop = useRef<HTMLDivElement | null>(null);
  const [displayMenuOpen, setDisplayMenuOpen] = useState(false);
  const displayMenuRefMobile = useRef<HTMLDivElement | null>(null);
  const displayMenuRefDesktop = useRef<HTMLDivElement | null>(null);
  const [follows, setFollows] = useState<{ authors: FollowEntry[]; series: FollowEntry[] }>({
    authors: [],
    series: [],
  });
  const [followFormatMenu, setFollowFormatMenu] = useState<{
    type: 'author' | 'series';
    name: string;
    author?: string;
  } | null>(null);
  const prevLibIdRef = useRef<string | undefined>(undefined);
  const prevGroupByRef = useRef<string>(groupBy);
  const [selectedSeries, setSelectedSeries] = useState<string | null>(() =>
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('series')
      : null,
  );
  const [mergeSeries, setMergeSeries] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const v = localStorage.getItem('library_mergeSeries');
    return v === null ? true : v === 'true';
  });
  const [viewMode, setViewMode] = useState<string>(() =>
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('view') ||
        localStorage.getItem('library_viewMode') ||
        'grid'
      : 'grid',
  );

  function setSelectedLibrary(lib: (import('@/types').Library & { type: string }) | null) {
    setSelectedLibraryState(lib);
    if (lib && typeof window !== 'undefined') localStorage.setItem('library_selectedId', lib.id);
    pushURLState({ lib: lib?.id ?? null, series: null });
  }
  function setGroupByPersist(v: string) {
    setGroupBy(v);
    if (typeof window !== 'undefined') localStorage.setItem('library_groupBy', v);
    pushURLState({ group: v === 'author' ? null : v, series: null });
  }
  function setViewModePersist(v: string) {
    setViewMode(v);
    if (typeof window !== 'undefined') localStorage.setItem('library_viewMode', v);
    pushURLState({ view: v === 'grid' ? null : v });
  }
  function isFollowingAuthor(name: string) {
    return follows.authors.some((a) => a.name === name);
  }
  function isFollowingSeries(name: string) {
    return follows.series.some((s) => s.name === name);
  }
  async function toggleFollowAuthor(name: string, format?: 'ebook' | 'audiobook' | 'both') {
    try {
      if (isFollowingAuthor(name)) {
        const res = await settingsService.unfollowAuthor(name);
        setFollows((res.data as { follows: typeof follows }).follows ?? res.data as typeof follows);
      } else if (format) {
        const res = await settingsService.followAuthor(name, format, selectedLibrary?.id);
        setFollows((res.data as { follows: typeof follows }).follows);
        setFollowFormatMenu(null);
      } else {
        setFollowFormatMenu({ type: 'author', name });
      }
    } catch { /* ignore */ }
  }
  async function toggleFollowSeries(name: string, author?: string, format?: 'ebook' | 'audiobook' | 'both') {
    try {
      if (isFollowingSeries(name)) {
        const res = await settingsService.unfollowSeries(name);
        setFollows((res.data as { follows: typeof follows }).follows ?? res.data as typeof follows);
      } else if (format) {
        const res = await settingsService.followSeries(name, author, format, selectedLibrary?.id);
        setFollows((res.data as { follows: typeof follows }).follows);
        setFollowFormatMenu(null);
      } else {
        setFollowFormatMenu({ type: 'series', name, author });
      }
    } catch { /* ignore */ }
  }

  function toggleMergeSeries() {
    setMergeSeries((v) => {
      const next = !v;
      if (typeof window !== 'undefined') localStorage.setItem('library_mergeSeries', String(next));
      return next;
    });
    setSelectedSeries(null);
    pushURLState({ series: null });
  }
  function pushURLState(updates: Record<string, string | null>) {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) sp.delete(key);
      else sp.set(key, value);
    }
    const qs = sp.toString();
    window.history.replaceState(
      null,
      '',
      qs ? `${window.location.pathname}?${qs}` : window.location.pathname,
    );
  }
  function handleSeriesChange(name: string | null) {
    setSelectedSeries(name);
    pushURLState({ series: name });
  }

  async function handleSendSeriesAllToReader(books: MergedBook[]) {
    const EBOOK_EXTS = new Set(['.epub', '.mobi', '.azw3', '.pdf']);
    const ebookPaths = books.flatMap((b) => {
      const fromFiles = b.ebookFiles?.map((f) => f.path) || [];
      if (fromFiles.length) return fromFiles;
      return b.files?.filter((f) => EBOOK_EXTS.has('.' + f.ext)).map((f) => f.path) || [];
    }).filter(Boolean);
    if (!ebookPaths.length) {
      toast.error(t('send_to_reader_no_email'));
      return;
    }
    setSendingSeriesAll(true);
    try {
      const settingsRes = await settingsService.getEmailSettings();
      const readerEmail = settingsRes.data.readerEmail;
      if (!readerEmail) {
        toast.error(t('send_to_reader_no_email'));
        setSendingSeriesAll(false);
        return;
      }
      await Promise.all(ebookPaths.map((p) => libraryService.sendToReader(p)));
      toast.success(t('send_to_reader_sent').replace('{email}', readerEmail));
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e.response?.data?.error || (err as Error).message);
    } finally {
      setSendingSeriesAll(false);
    }
  }

  const { data: librariesData, isLoading: librariesLoading } = useQuery({
    queryKey: ['libraries'],
    queryFn: async () => {
      const res = await libraryService.getAll();
      return res.data;
    },
  });

  const allLibraries = useMemo(
    () =>
      librariesData
        ? [
            ...(librariesData.ebook || []).map((l: import('@/types').Library) => ({
              ...l,
              type: 'ebook' as const,
            })),
            ...(librariesData.audiobook || []).map((l: import('@/types').Library) => ({
              ...l,
              type: 'audiobook' as const,
            })),
            ...(librariesData.mixed || []).map((l: import('@/types').Library) => ({
              ...l,
              type: 'mixed' as const,
            })),
          ]
        : [],
    [librariesData],
  );

  useEffect(() => {
    settingsService.getFollows().then((res) => setFollows(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (allLibraries.length > 0 && !selectedLibrary) {
      const urlLibId =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('lib')
          : null;
      const savedId =
        urlLibId ||
        (typeof window !== 'undefined' ? localStorage.getItem('library_selectedId') : null);
      const saved = savedId ? allLibraries.find((l) => l.id === savedId) : null;
      const lib = saved || allLibraries[0];
      setSelectedLibraryState(lib);
      if (lib) {
        if (typeof window !== 'undefined') localStorage.setItem('library_selectedId', lib.id);
        if (!urlLibId) pushURLState({ lib: lib.id });
      }
    }
  }, [allLibraries.length]);

  useEffect(() => {
    if (prevLibIdRef.current !== undefined && prevLibIdRef.current !== selectedLibrary?.id) {
      setSearchQuery('');
      setSelectedSeries(null);
    }
    prevLibIdRef.current = selectedLibrary?.id;
  }, [selectedLibrary?.id]);
  useEffect(() => {
    if (prevGroupByRef.current !== groupBy) {
      setSelectedSeries(null);
    }
    prevGroupByRef.current = groupBy;
  }, [groupBy]);

  useEffect(() => {
    if (!libPickerOpen) return;
    function handleClick(e: MouseEvent) {
      const inMobile = libPickerRef.current?.contains(e.target as Node);
      const inDesktop = libPickerRefDesktop.current?.contains(e.target as Node);
      if (!inMobile && !inDesktop) setLibPickerOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [libPickerOpen]);

  useEffect(() => {
    if (!displayMenuOpen) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        displayMenuRefMobile.current?.contains(target) ||
        displayMenuRefDesktop.current?.contains(target)
      ) return;
      setDisplayMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [displayMenuOpen]);

  const { data: playerProgress } = useQuery({
    queryKey: ['player-progress-all'],
    queryFn: async () => {
      const res = await playerService.getAllProgress();
      return res.data as Record<string, { percentage: number; completed?: boolean }>;
    },
    staleTime: 10_000,
    refetchInterval: 10_000,
  });

  const { data: readerProgress } = useQuery({
    queryKey: ['reader-progress-all'],
    queryFn: async () => {
      const res = await readerService.getAllProgress();
      return res.data as Record<string, { percentage: number; completed?: boolean }>;
    },
    staleTime: 10_000,
    refetchInterval: 10_000,
  });

  // Merge both progress maps — reader takes precedence for ebooks
  const allProgress = useMemo(() => {
    const merged: Record<string, { percentage: number; completed?: boolean }> = {};
    for (const [k, v] of Object.entries(playerProgress || {})) merged[k] = v;
    for (const [k, v] of Object.entries(readerProgress || {})) {
      if (!merged[k] || (v.percentage ?? 0) > (merged[k].percentage ?? 0)) merged[k] = v;
    }
    return merged;
  }, [playerProgress, readerProgress]);

  const { data: libraryData, isLoading: scanLoading } = useQuery({
    queryKey: ['library', selectedLibrary?.id],
    queryFn: async () => {
      const res = await libraryService.getBooks(selectedLibrary!.id);
      return res.data;
    },
    enabled: !!selectedLibrary,
  });

  const authorGroups = libraryData?.tree || [];

  const allBooks = useMemo(() => {
    const flat = authorGroups.flatMap((g: import('@/types').ScannerAuthorGroup) =>
      (g.books || []).map((b: ScannerBook) => {
        const sm = b.savedMeta || {};
        return {
          ...b,
          author: sm.author || b.author || g.author,
          title: sm.title || b.title,
          series: typeof sm.series === 'string' && sm.series ? sm.series : undefined,
        };
      }),
    );
    return mergeBooksByTitle(flat);
  }, [authorGroups]);

  const q = searchQuery.trim().toLowerCase();
  const filteredBooks = useMemo(() => {
    if (!q) return allBooks;
    return allBooks.filter(
      (b) =>
        b.title?.toLowerCase().includes(q) ||
        b.author?.toLowerCase().includes(q) ||
        (b.series || extractSeries(b))?.toLowerCase().includes(q),
    );
  }, [allBooks, q]);

  const seriesMap = useMemo(() => buildSeriesGroups(filteredBooks), [filteredBooks]);

  type DisplayGroup = {
    label: string | null;
    books?: MergedBook[];
    series?: { name: string; books: MergedBook[] }[];
    ungrouped?: MergedBook[];
  };
  const displayGroups = useMemo((): DisplayGroup[] => {
    if (groupBy === 'none') {
      if (!filteredBooks.length) return [];
      if (mergeSeries) {
        const { series, ungrouped } = buildSeriesGroups(filteredBooks);
        return [{ label: null, series, ungrouped }];
      }
      return [{ label: null, books: filteredBooks }];
    }

    if (groupBy === 'series') {
      const map = new Map<string, MergedBook[]>();
      for (const book of filteredBooks) {
        const raw = extractSeries(book) || '';
        const key = raw.replace(/\s+#\d+(?:\.\d+)?$/, '').trim() || '—';
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(book);
      }
      return [...map.entries()]
        .sort(([a], [b]) => (a === '—' ? 1 : b === '—' ? -1 : a.localeCompare(b, 'fr')))
        .map(([label, books]) => ({
          label,
          books: books.slice().sort((a, b) => {
            const na = parseFloat(
              (extractSeries(a) || '').match(/#(\d+(?:\.\d+)?)$/)?.[1] ?? 'Infinity',
            );
            const nb = parseFloat(
              (extractSeries(b) || '').match(/#(\d+(?:\.\d+)?)$/)?.[1] ?? 'Infinity',
            );
            return na - nb;
          }),
        }));
    }

    const map = new Map<string, MergedBook[]>();
    for (const book of filteredBooks) {
      const key = book.author || t('library_unknown_author');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(book);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'fr'))
      .map(([label, books]) => ({ label, ...buildSeriesGroups(books) }));
  }, [filteredBooks, groupBy, mergeSeries]);

  const totalBooks = allBooks.length;
  const filteredTotal = filteredBooks.length;

  function FollowBtn({ following, onClick }: { following: boolean; onClick: () => void }) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
          following
            ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
            : 'text-ink-faint border-surface-border hover:text-ink hover:border-surface-strong'
        }`}
      >
        {following ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
        {following ? t('follow_btn_following') : t('follow_btn')}
      </button>
    );
  }

  return (
    <div className="flex flex-col -m-4 md:-m-6 h-[calc(100dvh-4rem)] md:h-screen overflow-hidden">
      {/* ── Top bar ── */}
      <div className="flex-shrink-0 border-b border-surface-border bg-surface-sidebar">
        {/* Mobile row */}
        <div className="flex md:hidden items-center gap-2 px-3 h-11">
          {librariesLoading && (
            <div className="h-7 w-32 bg-surface-elevated rounded-lg animate-pulse" />
          )}
          {!librariesLoading && (
            <div className="relative" ref={libPickerRef}>
              <button
                onClick={() => setLibPickerOpen((v) => !v)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25"
              >
                {selectedLibrary ? (
                  <>
                    {React.createElement(
                      TYPE_ICON[selectedLibrary.type as keyof typeof TYPE_ICON] || BookOpen,
                      { className: 'w-3.5 h-3.5 flex-shrink-0' },
                    )}
                    {selectedLibrary.name}
                  </>
                ) : (
                  <span className="text-ink-faint">{t('library_choose')}</span>
                )}
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${libPickerOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {libPickerOpen && (
                <div
                  className="absolute top-full left-0 mt-1 bg-surface-card border border-surface-border rounded-xl shadow-modal z-50 min-w-[200px] py-1 overflow-hidden"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {allLibraries.length === 0 && (
                    <p className="text-xs text-ink-faint px-4 py-2">{t('library_no_libraries')}</p>
                  )}
                  {allLibraries.map((lib) => {
                    const Icon = TYPE_ICON[lib.type as keyof typeof TYPE_ICON] || BookOpen;
                    const active = selectedLibrary?.id === lib.id;
                    return (
                      <button
                        key={lib.id}
                        onClick={() => {
                          setSelectedLibrary(lib);
                          setLibPickerOpen(false);
                        }}
                        className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                          active
                            ? 'bg-indigo-500/15 text-indigo-300'
                            : 'text-ink hover:bg-surface-elevated'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                        {lib.name}
                        {active && (
                          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {/* Mobile controls */}
          {selectedLibrary && (
            <div ref={displayMenuRefMobile} className="relative ml-auto flex-shrink-0">
              <button
                onClick={() => setDisplayMenuOpen((v) => !v)}
                className={`flex items-center justify-center w-8 h-8 rounded-lg border transition-colors ${displayMenuOpen ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' : 'text-ink-dim hover:text-ink hover:bg-surface-elevated border-surface-border'}`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
              </button>
              {displayMenuOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 w-52 bg-surface-card border border-surface-border rounded-xl shadow-lg p-3 flex flex-col gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-ink-faint mb-1.5">{t('library_group_by')}</p>
                    <div className="flex rounded-lg overflow-hidden border border-surface-border">
                      {GROUP_MODES.map(({ value, labelKey, Icon }) => (
                        <button
                          key={value}
                          onClick={() => setGroupByPersist(value)}
                          className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] font-medium transition-colors ${groupBy === value ? 'bg-indigo-600 text-white' : 'text-ink-dim hover:text-ink hover:bg-surface-elevated'}`}
                        >
                          <Icon className="w-3 h-3" />
                          {t(labelKey)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-ink-faint mb-1.5">{t('library_series')}</p>
                    <button
                      onClick={toggleMergeSeries}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${mergeSeries ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' : 'text-ink-dim hover:text-ink hover:bg-surface-elevated border-surface-border'}`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      {t('library_merge_series_title')}
                    </button>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-ink-faint mb-1.5">{t('library_view')}</p>
                    <div className="flex rounded-lg overflow-hidden border border-surface-border">
                      <button
                        onClick={() => setViewModePersist('grid')}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium transition-colors ${viewMode === 'grid' ? 'bg-indigo-600 text-white' : 'text-ink-dim hover:text-ink hover:bg-surface-elevated'}`}
                      >
                        <LayoutGrid className="w-3.5 h-3.5" />
                        {t('library_view_grid')}
                      </button>
                      <button
                        onClick={() => setViewModePersist('list')}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium transition-colors ${viewMode === 'list' ? 'bg-indigo-600 text-white' : 'text-ink-dim hover:text-ink hover:bg-surface-elevated'}`}
                      >
                        <LayoutList className="w-3.5 h-3.5" />
                        {t('library_view_list')}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mobile search row */}
        {selectedLibrary && (
          <div className="md:hidden px-3 pb-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-faint pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('library_search_placeholder')}
                className="input pl-8 text-sm h-8 py-0 w-full"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Desktop row: library | search (centered) | controls */}
        {selectedLibrary && (
          <div className="hidden md:flex items-center px-4 h-14">
            {/* Left: library selector */}
            <div ref={libPickerRefDesktop} className="relative flex-none">
              <button
                onClick={() => setLibPickerOpen((v) => !v)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25"
              >
                {selectedLibrary ? (
                  <>
                    {React.createElement(
                      TYPE_ICON[selectedLibrary.type as keyof typeof TYPE_ICON] || BookOpen,
                      { className: 'w-3.5 h-3.5 flex-shrink-0' },
                    )}
                    {selectedLibrary.name}
                  </>
                ) : (
                  <span className="text-ink-faint">{t('library_choose')}</span>
                )}
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${libPickerOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {libPickerOpen && (
                <div
                  className="absolute top-full left-0 mt-1 bg-surface-card border border-surface-border rounded-xl shadow-modal z-50 min-w-[200px] py-1 overflow-hidden"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {allLibraries.length === 0 && (
                    <p className="text-xs text-ink-faint px-4 py-2">{t('library_no_libraries')}</p>
                  )}
                  {allLibraries.map((lib) => {
                    const Icon = TYPE_ICON[lib.type as keyof typeof TYPE_ICON] || BookOpen;
                    const active = selectedLibrary?.id === lib.id;
                    return (
                      <button
                        key={lib.id}
                        onClick={() => {
                          setSelectedLibrary(lib);
                          setLibPickerOpen(false);
                        }}
                        className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${active ? 'bg-indigo-500/15 text-indigo-300' : 'text-ink hover:bg-surface-elevated'}`}
                      >
                        <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                        {lib.name}
                        {active && (
                          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex-1" />
            {/* Center: search */}
            <div className="w-[32rem] flex-none">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-faint pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('library_search_placeholder')}
                  className="input pl-8 text-sm h-8 py-0 w-full"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1" />
            {/* Right: controls */}
            <div ref={displayMenuRefDesktop} className="relative flex-none">
              <button
                onClick={() => setDisplayMenuOpen((v) => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${displayMenuOpen ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' : 'text-ink-dim hover:text-ink hover:bg-surface-elevated border-surface-border'}`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                {t('library_display')}
              </button>
              {displayMenuOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 w-56 bg-surface-card border border-surface-border rounded-xl shadow-lg p-3 flex flex-col gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-ink-faint mb-1.5">{t('library_group_by')}</p>
                    <div className="flex rounded-lg overflow-hidden border border-surface-border">
                      {GROUP_MODES.map(({ value, labelKey, Icon }) => (
                        <button
                          key={value}
                          onClick={() => setGroupByPersist(value)}
                          className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] font-medium transition-colors ${groupBy === value ? 'bg-indigo-600 text-white' : 'text-ink-dim hover:text-ink hover:bg-surface-elevated'}`}
                        >
                          <Icon className="w-3 h-3" />
                          {t(labelKey)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-ink-faint mb-1.5">{t('library_series')}</p>
                    <button
                      onClick={toggleMergeSeries}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${mergeSeries ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' : 'text-ink-dim hover:text-ink hover:bg-surface-elevated border-surface-border'}`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      {t('library_merge_series_title')}
                    </button>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-ink-faint mb-1.5">{t('library_view')}</p>
                    <div className="flex rounded-lg overflow-hidden border border-surface-border">
                      <button
                        onClick={() => setViewModePersist('grid')}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium transition-colors ${viewMode === 'grid' ? 'bg-indigo-600 text-white' : 'text-ink-dim hover:text-ink hover:bg-surface-elevated'}`}
                      >
                        <LayoutGrid className="w-3.5 h-3.5" />
                        {t('library_view_grid')}
                      </button>
                      <button
                        onClick={() => setViewModePersist('list')}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium transition-colors ${viewMode === 'list' ? 'bg-indigo-600 text-white' : 'text-ink-dim hover:text-ink hover:bg-surface-elevated'}`}
                      >
                        <LayoutList className="w-3.5 h-3.5" />
                        {t('library_view_list')}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Content ── */}
      <div className={`flex-1 overflow-y-auto ${track ? 'pb-36 md:pb-28' : 'pb-4 md:pb-4'}`}>
        {!librariesLoading && allLibraries.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-16 h-16 rounded-2xl bg-surface-elevated flex items-center justify-center mb-4">
              <LibraryIcon className="w-7 h-7 text-ink-faint" />
            </div>
            <p className="text-base font-medium text-ink-muted">{t('library_no_libraries')}</p>
            <Link
              href="/settings?tab=libraries"
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25 border border-indigo-500/30 text-sm font-medium transition-colors"
            >
              <LibraryIcon className="w-4 h-4" />
              {t('library_go_settings')}
            </Link>
          </div>
        )}

        {scanLoading && (
          <div className="px-6 py-6">
            <SkeletonGrid />
          </div>
        )}

        {/* Series tiles view */}
        {!scanLoading && groupBy === 'series' && !selectedSeries && mergeSeries && seriesMap && (
          <div className="px-6 py-6 space-y-10">
            {seriesMap.series.length > 0 &&
              (viewMode === 'grid' ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 md:gap-5">
                  {seriesMap.series.map((s) => (
                    <SeriesTile
                      key={s.name}
                      name={s.name}
                      books={s.books}
                      onClick={() => handleSeriesChange(s.name)}
                      allProgress={allProgress}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col">
                  {seriesMap.series.map((s) => (
                    <SeriesListRow
                      key={s.name}
                      name={s.name}
                      books={s.books}
                      onClick={() => handleSeriesChange(s.name)}
                      isFollowed={isFollowingSeries(s.name)}
                      onFollowToggle={() => toggleFollowSeries(s.name, s.books[0]?.author)}
                    />
                  ))}
                </div>
              ))}
            {seriesMap.ungrouped.length > 0 && (
              <section>
                <h2 className="text-xl font-bold text-ink mb-4 text-ink-muted">
                  {t('library_no_series')}
                </h2>
                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 md:gap-5">
                    {seriesMap.ungrouped.map((book, i) => (
                      <CoverCard
                        key={i}
                        book={{ ...book, _libType: selectedLibrary?.type }}
                        onClick={setOpenBook}
                        progress={allProgress?.[book.path]?.percentage}
                        completed={allProgress?.[book.path]?.completed}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col">
                    {seriesMap.ungrouped.map((book, i) => (
                      <BookListRow
                        key={i}
                        book={{ ...book, _libType: selectedLibrary?.type }}
                        onClick={setOpenBook}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}

        {/* Series grouped view (mergeSeries off) */}
        {!scanLoading &&
          groupBy === 'series' &&
          !selectedSeries &&
          !mergeSeries &&
          displayGroups.length > 0 && (
            <div className="px-6 py-6 space-y-10">
              {displayGroups.map((group, gi) => (
                <section key={group.label ?? gi}>
                  {group.label !== null && (
                    <h2 className="text-xl font-bold text-ink mb-4 flex items-center gap-2">
                      {group.label}
                      <span className="text-xs font-medium px-2 py-0.5 rounded-md text-indigo-400 border border-indigo-500/40 tabular-nums">
                        {group.books?.length ?? 0}
                      </span>
                      <FollowBtn
                        following={isFollowingSeries(group.label)}
                        onClick={() => toggleFollowSeries(group.label!)}
                      />
                    </h2>
                  )}
                  {viewMode === 'grid' ? (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 md:gap-5">
                      {(group.books ?? []).map((book, i) => (
                        <CoverCard
                          key={i}
                          book={{ ...book, _libType: selectedLibrary?.type }}
                          onClick={setOpenBook}
                          progress={allProgress?.[book.path]?.percentage}
                          completed={allProgress?.[book.path]?.completed}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      {(group.books ?? []).map((book, i) => (
                        <BookListRow
                          key={i}
                          book={{ ...book, _libType: selectedLibrary?.type }}
                          onClick={setOpenBook}
                        />
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}

        {/* Series drill-down view — works from any groupBy */}
        {!scanLoading &&
          selectedSeries &&
          (() => {
            const entry = seriesMap.series.find((s) => s.name === selectedSeries);
            if (!entry) return null;
            return (
              <div className="px-6 py-6">
                <div className="mb-6">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => handleSeriesChange(null)}
                      className="btn-ghost flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      {t('library_back')}
                    </button>
                    <div className="flex items-center gap-2">
                      <Tooltip text={t('send_to_reader')}>
                        <button
                          onClick={() => handleSendSeriesAllToReader(entry.books)}
                          disabled={sendingSeriesAll}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/25 transition-colors disabled:opacity-50"
                        >
                          {sendingSeriesAll
                            ? <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
                            : <Send className="w-3.5 h-3.5" />
                          }
                        </button>
                      </Tooltip>
                      <Tooltip text={t('book_mark_series_complete')}>
                        <button
                          onClick={async () => {
                            await Promise.all(
                              entry.books.map((b) => playerService.markComplete(b.path)),
                            );
                            queryClient.invalidateQueries({ queryKey: ['player-progress-all'] });
                          }}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-green-400 bg-green-500/10 hover:bg-green-500/20 border border-green-500/25 transition-colors"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      </Tooltip>
                      <Tooltip text={t('book_delete_series')}>
                        <button
                          onClick={() =>
                            setDeleteSeriesTarget({ name: selectedSeries, books: entry.books })
                          }
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </Tooltip>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <h2 className="text-xl font-bold text-ink">{selectedSeries}</h2>
                    <span className="text-[11px] px-2 py-0.5 rounded-lg bg-indigo-500/15 text-indigo-300 border border-indigo-500/25 tabular-nums">
                      {entry.books.length}
                    </span>
                    <FollowBtn
                      following={isFollowingSeries(selectedSeries)}
                      onClick={() => toggleFollowSeries(selectedSeries, entry.books[0]?.author)}
                    />
                  </div>
                </div>
                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 md:gap-5">
                    {entry.books.map((book, i) => (
                      <CoverCard
                        key={i}
                        book={{ ...book, _libType: selectedLibrary?.type }}
                        onClick={setOpenBook}
                        progress={allProgress?.[book.path]?.percentage}
                        completed={allProgress?.[book.path]?.completed}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col">
                    {entry.books.map((book, i) => (
                      <BookListRow
                        key={i}
                        book={{ ...book, _libType: selectedLibrary?.type }}
                        onClick={setOpenBook}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

        {/* Author / flat view */}
        {!scanLoading && !selectedSeries && groupBy !== 'series' && displayGroups.length > 0 && (
          <div className="px-6 py-6 space-y-10">
            {displayGroups.map((group, gi) => {
              const totalCount =
                (group.series || []).reduce((s, g) => s + g.books.length, 0) +
                (group.ungrouped || group.books || []).length;
              return (
                <section key={group.label ?? gi}>
                  {group.label !== null && (
                    <h2 className="text-xl font-bold text-ink mb-4 flex items-center gap-2">
                      {group.label}
                      <span className="text-xs font-medium px-2 py-0.5 rounded-md text-indigo-400 border border-indigo-500/40 tabular-nums">
                        {totalCount}
                      </span>
                      <FollowBtn
                        following={isFollowingAuthor(group.label)}
                        onClick={() => toggleFollowAuthor(group.label!)}
                      />
                    </h2>
                  )}
                  {(group.series?.length ?? 0) > 0 &&
                    (mergeSeries ? (
                      viewMode === 'grid' ? (
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 md:gap-5 mb-5">
                          {group.series!.map((s) => (
                            <SeriesTile
                              key={s.name}
                              name={s.name}
                              books={s.books}
                              onClick={() => handleSeriesChange(s.name)}
                              allProgress={allProgress}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col mb-1">
                          {group.series!.map((s) => (
                            <SeriesListRow
                              key={s.name}
                              name={s.name}
                              books={s.books}
                              onClick={() => handleSeriesChange(s.name)}
                              isFollowed={isFollowingSeries(s.name)}
                              onFollowToggle={() => toggleFollowSeries(s.name, s.books[0]?.author)}
                            />
                          ))}
                        </div>
                      )
                    ) : (
                      <div className="space-y-6 mb-5">
                        {group.series!.map((s) => (
                          <div key={s.name}>
                            <div className="flex items-center gap-2 mb-3">
                              <h3 className="text-sm font-semibold text-ink-muted">{s.name}</h3>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-elevated text-ink-faint tabular-nums">
                                {s.books.length}
                              </span>
                              <FollowBtn
                                following={isFollowingSeries(s.name)}
                                onClick={() => toggleFollowSeries(s.name, s.books[0]?.author)}
                              />
                            </div>
                            {viewMode === 'grid' ? (
                              <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 md:gap-5">
                                {s.books.map((book, i) => (
                                  <CoverCard
                                    key={i}
                                    book={{ ...book, _libType: selectedLibrary?.type }}
                                    onClick={setOpenBook}
                                    progress={allProgress?.[book.path]?.percentage}
                                    completed={allProgress?.[book.path]?.completed}
                                  />
                                ))}
                              </div>
                            ) : (
                              <div className="flex flex-col">
                                {s.books.map((book, i) => (
                                  <BookListRow
                                    key={i}
                                    book={{ ...book, _libType: selectedLibrary?.type }}
                                    onClick={setOpenBook}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  {(group.ungrouped || group.books || []).length > 0 &&
                    (viewMode === 'grid' ? (
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 md:gap-5">
                        {(group.ungrouped || group.books || []).map((book, i) => (
                          <CoverCard
                            key={i}
                            book={{ ...book, _libType: selectedLibrary?.type }}
                            onClick={setOpenBook}
                            progress={allProgress?.[book.path]?.percentage}
                            completed={allProgress?.[book.path]?.completed}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col">
                        {(group.ungrouped || group.books || []).map((book, i) => (
                          <BookListRow
                            key={i}
                            book={{ ...book, _libType: selectedLibrary?.type }}
                            onClick={setOpenBook}
                          />
                        ))}
                      </div>
                    ))}
                </section>
              );
            })}
          </div>
        )}

        {!scanLoading && q && displayGroups.length === 0 && allBooks.length > 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-center px-6">
            <Search className="w-10 h-10 text-ink-faint mb-3 opacity-30" />
            <p className="text-sm text-ink-muted">
              {t('library_no_results').replace('{query}', searchQuery)}
            </p>
            <button
              onClick={() => setSearchQuery('')}
              className="text-xs text-indigo-400 mt-2 hover:underline"
            >
              {t('library_clear_search')}
            </button>
          </div>
        )}

        {!scanLoading && selectedLibrary && allBooks.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-center px-6">
            <BookOpen className="w-12 h-12 text-ink-faint mb-4 opacity-30" />
            <p className="text-sm text-ink-muted">{t('library_empty')}</p>
            <p className="text-xs text-ink-faint mt-1">{t('library_empty_desc')}</p>
            <Link
              href="/search"
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25 border border-indigo-500/30 text-sm font-medium transition-colors"
            >
              <Search className="w-4 h-4" />
              {t('library_empty_search_btn')}
            </Link>
          </div>
        )}
      </div>

      {deleteSeriesTarget && (
        <DeleteConfirmModal
          title={deleteSeriesTarget.name}
          subtitle={`${deleteSeriesTarget.books.length} tome${deleteSeriesTarget.books.length > 1 ? 's' : ''}`}
          onConfirm={async (deleteFiles) => {
            const paths = deleteSeriesTarget.books.map((b) => b.path).filter(Boolean);
            await libraryService.deleteBooks(paths, deleteFiles);
            setDeleteSeriesTarget(null);
            handleSeriesChange(null);
            queryClient.invalidateQueries({ queryKey: ['library', selectedLibrary?.id] });
          }}
          onClose={() => setDeleteSeriesTarget(null)}
        />
      )}

      {openBook && (
        <BookDetailModal
          book={openBook}
          onClose={() => setOpenBook(null)}
          onDeleted={() => {
            setOpenBook(null);
            queryClient.invalidateQueries({ queryKey: ['library', selectedLibrary?.id] });
          }}
        />
      )}

      {/* Follow format picker */}
      {followFormatMenu && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4"
          onClick={() => setFollowFormatMenu(null)}
        >
          <div
            className="bg-surface-card border border-surface-border rounded-2xl p-5 w-72 shadow-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-ink mb-1">
              {followFormatMenu.type === 'author' ? t('follow_authors_title') : t('follow_series_title')}
            </p>
            <p className="text-xs text-ink-muted mb-4 truncate">{followFormatMenu.name}</p>
            <p className="text-[11px] uppercase tracking-wide text-ink-faint mb-2">{t('follow_confirm')}</p>
            <div className="flex flex-col gap-2">
              {(['ebook', 'audiobook', 'both'] as const).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() =>
                    followFormatMenu.type === 'author'
                      ? toggleFollowAuthor(followFormatMenu.name, fmt)
                      : toggleFollowSeries(followFormatMenu.name, followFormatMenu.author, fmt)
                  }
                  className="btn-secondary text-sm py-2 text-left px-3"
                >
                  {t(`follow_format_${fmt}` as import('@/i18n').TranslationKey)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Floating + button */}
      <Tooltip text={t('library_add_book')}>
        <Link
          href="/search"
          className="fixed bottom-20 md:bottom-6 right-4 md:right-6 w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-colors z-40 border-2 border-indigo-500 text-indigo-400 bg-surface-base hover:bg-indigo-500/15"
        >
          <Plus className="w-5 h-5" />
        </Link>
      </Tooltip>
    </div>
  );
}
