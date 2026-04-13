'use client';
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  Clock,
  BookMarked,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Headphones,
  Layers,
} from 'lucide-react';
import { libraryService, playerService, readerService } from '@/api';
import { mergeBooksByTitle } from '@/lib/libraryUtils';
import { useT } from '@/i18n';
import type { MergedBook, ScannerBook, Library, ProgressEntry, ReaderProgressEntry } from '@/types';
import BookDetailModal from '@/components/BookDetailModal';
import CoverCard from '@/components/library/CoverCard';
import SkeletonGrid from '@/components/library/SkeletonGrid';
import useStore from '@/store/useStore';

const TYPE_ICON = {
  audiobook: Headphones,
  mixed: Layers,
  ebook: BookOpen,
};

type LibWithType = Library & { type: string };

interface BookWithProgress {
  book: MergedBook;
  percentage: number;
  updatedAt: number;
  completed: boolean;
}

export default function HomePage() {
  const t = useT();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profileId } = useStore();
  const [openBook, setOpenBook] = useState<MergedBook | null>(null);
  const [selectedLibrary, setSelectedLibraryState] = useState<LibWithType | null>(null);
  const [libPickerOpen, setLibPickerOpen] = useState(false);
  const libPickerRef = useRef<HTMLDivElement | null>(null);

  // ── Libraries ──
  const { data: librariesData, isLoading: librariesLoading } = useQuery({
    queryKey: ['libraries'],
    queryFn: () => libraryService.getAll().then((r) => r.data),
  });

  const allLibraries = useMemo(
    (): LibWithType[] =>
      librariesData
        ? [
            ...(librariesData.ebook || []).map((l) => ({ ...l, type: 'ebook' as const })),
            ...(librariesData.audiobook || []).map((l) => ({ ...l, type: 'audiobook' as const })),
            ...(librariesData.mixed || []).map((l) => ({ ...l, type: 'mixed' as const })),
          ]
        : [],
    [librariesData],
  );

  // Auto-select saved library
  useEffect(() => {
    if (allLibraries.length > 0 && !selectedLibrary) {
      const savedId = typeof window !== 'undefined' ? localStorage.getItem('library_selectedId') : null;
      const saved = savedId ? allLibraries.find((l) => l.id === savedId) : null;
      setSelectedLibraryState(saved || allLibraries[0]);
    }
  }, [allLibraries.length]);

  function setSelectedLibrary(lib: LibWithType) {
    setSelectedLibraryState(lib);
    if (typeof window !== 'undefined') localStorage.setItem('library_selectedId', lib.id);
  }

  // Close picker on outside click
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

  // ── Books for selected library ──
  const { data: libraryData, isLoading: booksLoading } = useQuery({
    queryKey: ['library', selectedLibrary?.id],
    queryFn: () => libraryService.getBooks(selectedLibrary!.id).then((r) => r.data),
    enabled: !!selectedLibrary,
    staleTime: 60_000,
  });

  const allBooks = useMemo(() => {
    const tree = libraryData?.tree || [];
    const flat = tree.flatMap((g) =>
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
  }, [libraryData]);

  const booksByPath = useMemo(() => {
    const map = new Map<string, MergedBook>();
    for (const b of allBooks) map.set(b.path, b);
    return map;
  }, [allBooks]);

  // ── Progress ──
  const { data: audioProgress } = useQuery({
    queryKey: ['all-audio-progress', profileId],
    queryFn: () => playerService.getAllProgress().then((r) => r.data),
    staleTime: 30_000,
  });

  const { data: readerProgress } = useQuery({
    queryKey: ['all-reader-progress', profileId],
    queryFn: () => readerService.getAllProgress().then((r) => r.data),
    staleTime: 30_000,
  });

  const allProgress = useMemo(() => {
    const merged: Record<string, { percentage: number; completed?: boolean }> = {};
    for (const [k, v] of Object.entries(audioProgress || {}))
      merged[k] = { percentage: v.percentage ?? 0, completed: v.completed };
    for (const [k, v] of Object.entries(readerProgress || {})) {
      const pct = v.percentage ?? 0;
      if (!merged[k] || pct > merged[k].percentage) merged[k] = { percentage: pct, completed: v.completed };
    }
    return merged;
  }, [audioProgress, readerProgress]);

  // ── Read later ──
  const { data: readLaterBooks } = useQuery({
    queryKey: ['library-read-later'],
    queryFn: () => libraryService.getReadLater().then((r) => r.data),
    staleTime: 60_000,
  });

  // ── Build sections (scoped to selected library) ──
  const inProgress: BookWithProgress[] = [];
  const recentlyCompleted: BookWithProgress[] = [];

  if (booksByPath.size > 0 && (audioProgress || readerProgress)) {
    const seen = new Set<string>();
    const process = (
      progress: Record<string, ProgressEntry | ReaderProgressEntry> | undefined,
      source: 'audio' | 'reader',
    ) => {
      if (!progress) return;
      for (const [path, p] of Object.entries(progress)) {
        if (seen.has(path)) continue;
        const book = booksByPath.get(path);
        if (!book) continue;
        seen.add(path);

        const otherP = source === 'audio' ? readerProgress?.[path] : audioProgress?.[path];
        const pct = Math.max(p.percentage ?? 0, otherP?.percentage ?? 0);
        const completed = !!(p.completed || otherP?.completed);
        const updatedAt = Math.max(p.updatedAt || 0, otherP?.updatedAt || 0);

        if (completed) {
          recentlyCompleted.push({ book, percentage: pct, updatedAt, completed });
        } else if (pct > 0) {
          inProgress.push({ book, percentage: pct, updatedAt, completed });
        }
      }
    };
    process(audioProgress, 'audio');
    process(readerProgress, 'reader');
  }

  inProgress.sort((a, b) => b.updatedAt - a.updatedAt);
  recentlyCompleted.sort((a, b) => b.updatedAt - a.updatedAt);

  // Recent additions (last 30 non-wishlist books)
  const recentAdditions = useMemo(
    () => allBooks.filter((b) => !b.wishlist).slice(-30).reverse(),
    [allBooks],
  );

  // Read later (scoped to selected library)
  const readLater = useMemo(
    () =>
      (readLaterBooks || [])
        .filter((b) => booksByPath.has(b.path))
        .map((b) => booksByPath.get(b.path)!) as MergedBook[],
    [readLaterBooks, booksByPath],
  );

  function handleSelectSeries(name: string) {
    router.push(`/library?series=${encodeURIComponent(name)}`);
  }

  const libPickerRefDesktop = useRef<HTMLDivElement | null>(null);
  const loading = librariesLoading || booksLoading;

  return (
    <div className="flex flex-col -m-4 md:-m-6 h-[calc(100dvh-4rem)] md:h-screen overflow-hidden">
      {/* ── Top bar (same as library) ── */}
      <div className="flex-shrink-0 border-b border-surface-border bg-surface-sidebar">
        {/* Mobile row */}
        <div className="flex md:hidden items-center gap-2 px-3 h-11">
          {librariesLoading && (
            <div className="h-7 w-24 bg-surface-elevated rounded-lg animate-pulse flex-shrink-0" />
          )}
          {!librariesLoading && (
            <div className="relative flex-shrink-0" ref={libPickerRef}>
              <button
                onClick={() => setLibPickerOpen((v) => !v)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25"
              >
                {selectedLibrary ? (
                  <>
                    {React.createElement(
                      TYPE_ICON[selectedLibrary.type as keyof typeof TYPE_ICON] || BookOpen,
                      { className: 'w-3.5 h-3.5 flex-shrink-0' },
                    )}
                    <span className="max-w-[80px] truncate">{selectedLibrary.name}</span>
                  </>
                ) : (
                  <span className="text-ink-faint">{t('library_choose')}</span>
                )}
                <ChevronDown
                  className={`w-3 h-3 flex-shrink-0 transition-transform ${libPickerOpen ? 'rotate-180' : ''}`}
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
          <div className="flex-1" />
        </div>

        {/* Desktop row */}
        <div className="hidden md:flex items-center px-4 h-14">
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
                      className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                        active ? 'bg-indigo-500/15 text-indigo-300' : 'text-ink hover:bg-surface-elevated'
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
          <div className="flex-1" />
          <div className="flex-1" />
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-8">
      {loading ? (
        <SkeletonGrid />
      ) : (
        <>
          {/* Continue reading/listening */}
          {inProgress.length > 0 && (
            <HomeSection
              icon={<BookOpen className="w-4 h-4" />}
              title={t('home_continue')}
              count={inProgress.length}
            >
              {inProgress.map(({ book }, i) => (
                <div key={`${book.path}-${i}`} className="flex-shrink-0 w-[120px] sm:w-[140px] md:w-[160px]">
                  <CoverCard
                    book={book}
                    onClick={setOpenBook}
                    onSelectSeries={handleSelectSeries}
                    progress={allProgress[book.path]?.percentage}
                    completed={allProgress[book.path]?.completed}
                  />
                </div>
              ))}
            </HomeSection>
          )}

          {/* Read later */}
          {readLater.length > 0 && (
            <HomeSection
              icon={<BookMarked className="w-4 h-4" />}
              title={t('home_read_later')}
              count={readLater.length}
            >
              {readLater.map((book, i) => (
                <div key={`${book.path}-${i}`} className="flex-shrink-0 w-[120px] sm:w-[140px] md:w-[160px]">
                  <CoverCard
                    book={book}
                    onClick={setOpenBook}
                    onSelectSeries={handleSelectSeries}
                    progress={allProgress[book.path]?.percentage}
                    completed={allProgress[book.path]?.completed}
                  />
                </div>
              ))}
            </HomeSection>
          )}

          {/* Recent additions */}
          {recentAdditions.length > 0 && (
            <HomeSection
              icon={<Sparkles className="w-4 h-4" />}
              title={t('home_recent')}
              count={recentAdditions.length}
            >
              {recentAdditions.map((book, i) => (
                <div key={`${book.path}-${i}`} className="flex-shrink-0 w-[120px] sm:w-[140px] md:w-[160px]">
                  <CoverCard
                    book={book}
                    onClick={setOpenBook}
                    onSelectSeries={handleSelectSeries}
                    progress={allProgress[book.path]?.percentage}
                    completed={allProgress[book.path]?.completed}
                  />
                </div>
              ))}
            </HomeSection>
          )}

          {/* Recently completed */}
          {recentlyCompleted.length > 0 && (
            <HomeSection
              icon={<Clock className="w-4 h-4" />}
              title={t('home_completed')}
              count={recentlyCompleted.length}
            >
              {recentlyCompleted.slice(0, 20).map(({ book }, i) => (
                <div key={`${book.path}-${i}`} className="flex-shrink-0 w-[120px] sm:w-[140px] md:w-[160px]">
                  <CoverCard
                    book={book}
                    onClick={setOpenBook}
                    onSelectSeries={handleSelectSeries}
                    progress={allProgress[book.path]?.percentage}
                    completed={allProgress[book.path]?.completed}
                  />
                </div>
              ))}
            </HomeSection>
          )}

          {/* Empty state */}
          {inProgress.length === 0 && readLater.length === 0 && recentAdditions.length === 0 && (
            <div className="text-center py-16">
              <BookOpen className="w-10 h-10 text-ink-faint mx-auto mb-3" />
              <p className="text-ink-muted">{t('home_empty')}</p>
              <button onClick={() => router.push('/library')} className="btn-primary mt-4 text-sm">
                {t('nav_library')}
              </button>
            </div>
          )}
        </>
      )}

      {openBook && (
        <BookDetailModal
          book={openBook}
          onClose={() => setOpenBook(null)}
          onDeleted={() => {
            setOpenBook(null);
            queryClient.invalidateQueries({ queryKey: ['library', selectedLibrary?.id] });
            queryClient.invalidateQueries({ queryKey: ['library-read-later'] });
          }}
        />
      )}
      </div>
    </div>
  );
}

/* ── Horizontal scrollable section ── */
function HomeSection({
  icon,
  title,
  count,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  function updateScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }

  function scroll(dir: number) {
    scrollRef.current?.scrollBy({ left: dir * 300, behavior: 'smooth' });
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-indigo-400">{icon}</span>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <span className="text-xs text-ink-faint">({count})</span>
        </div>
        <div className="flex items-center gap-1">
          {canScrollLeft && (
            <button
              onClick={() => scroll(-1)}
              className="p-1 rounded-md text-ink-dim hover:text-ink hover:bg-surface-elevated transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          {canScrollRight && (
            <button
              onClick={() => scroll(1)}
              className="p-1 rounded-md text-ink-dim hover:text-ink hover:bg-surface-elevated transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      <div
        ref={scrollRef}
        onScroll={updateScroll}
        className="flex gap-4 overflow-x-auto scrollbar-hide pb-2 -mx-1 px-1"
      >
        {children}
      </div>
    </section>
  );
}
