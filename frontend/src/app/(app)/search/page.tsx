'use client';
import React, { useState, useEffect } from 'react';
import {
  Search as SearchIcon,
  Zap,
  BookOpen,
  Headphones,
  Layers,
  Clock,
  Mic,
  BookMarked,
  Plus,
  Check,
  X,
  ChevronDown,
} from 'lucide-react';
import SearchBar from '@/components/SearchBar';
import BookCard from '@/components/BookCard';
import { libraryService, searchService, settingsService } from '@/api';
import useStore from '@/store/useStore';
import { BookMetadata, ContentType, Library, SearchResult } from '@/types';
import { SearchParams } from '@/components/SearchBar';
import { AxiosError } from 'axios';
import { useT } from '@/i18n';
import { toast } from '@/store/useToastStore';

const MODES = [
  { value: 'torrent', label: 'Torrents', Icon: Zap },
  { value: 'catalogue', label: 'Metadata', Icon: BookOpen },
];


const SOURCE_CLS = {
  audible: 'bg-orange-500/15 text-orange-400 border-orange-500/25',
  openlibrary: 'bg-sky-500/15 text-sky-400 border-sky-500/25',
  googlebooks: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
};
const SOURCE_LABEL = {
  audible: 'Audible',
  openlibrary: 'Open Library',
  googlebooks: 'Google Books',
};

const LIB_TYPE_ICON = { audiobook: Headphones, mixed: Layers, ebook: BookOpen };

// ── Inline SearchResults ──────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <div className="flex items-center gap-3.5 px-4 py-3 bg-surface-card border border-surface-border rounded-xl animate-pulse">
      <div className="w-8 h-8 rounded-lg bg-surface-elevated flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-surface-elevated rounded w-2/3" />
        <div className="h-2 bg-surface-elevated rounded w-1/3" />
      </div>
      <div className="flex items-center gap-4 flex-shrink-0">
        <div className="h-2 bg-surface-elevated rounded w-12" />
        <div className="h-2 bg-surface-elevated rounded w-8" />
        <div className="h-7 bg-surface-elevated rounded w-8" />
      </div>
    </div>
  );
}

interface SearchResultsProps {
  results?: SearchResult[];
  loading?: boolean;
  searchType?: ContentType;
  total?: number;
}
function SearchResultsInline({
  results = [],
  loading = false,
  searchType = 'ebook',
  total = 0,
}: SearchResultsProps) {
  const t = useT();

  if (loading) {
    return (
      <div className="space-y-1.5">
        {Array.from({ length: 10 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="w-16 h-16 rounded-2xl bg-surface-elevated flex items-center justify-center mb-4">
          <BookOpen className="w-7 h-7 text-ink-faint" />
        </div>
        <p className="text-base font-medium text-ink-muted">{t('searchresults_no_results')}</p>
        <p className="text-sm mt-1 text-ink-faint">{t('searchresults_no_results_hint')}</p>
      </div>
    );
  }

  return (
    <div>
      <p className="section-label mb-3">
        {total} résultat{total !== 1 ? 's' : ''}
      </p>
      <div className="space-y-1.5">
        {results.map((result, i) => (
          <BookCard key={result.guid || i} result={result} searchType={searchType} />
        ))}
      </div>
    </div>
  );
}

// ── Add-to-library modal ──────────────────────────────────────────────────────
function AddToLibraryModal({
  book,
  libraries,
  onClose,
  onAdded,
}: {
  book: BookMetadata;
  libraries: (Library & { type: string })[];
  onClose: () => void;
  onAdded: (book: BookMetadata) => void;
}) {
  const t = useT();
  const [selectedLib, setSelectedLib] = useState(libraries[0]?.id || '');
  const [format, setFormat] = useState<import('@/types').ContentType>('audiobook');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const FORMATS = [
    { value: 'ebook', label: 'Ebook', Icon: BookOpen },
    { value: 'audiobook', label: 'Audiobook', Icon: Headphones },
    { value: 'both', label: t('add_format_both'), Icon: Layers },
  ];

  const seriesTitle =
    (book as BookMetadata & { seriesTitle?: string }).seriesTitle ||
    book.series?.replace(/\s+#[\d.]+$/, '').trim() ||
    '';
  const [seriesMode, setSeriesMode] = useState(false);
  const [seriesBooks, setSeriesBooks] = useState<BookMetadata[]>([]);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function loadSeries() {
    if (seriesBooks.length > 0) return;
    setSeriesLoading(true);
    try {
      const type = format === 'ebook' ? 'ebook' : 'audiobook';
      const res = await libraryService.getSeriesBooks({
        seriesTitle,
        author: book.author,
        type,
      });
      setSeriesBooks(res.data);
      setSelected(new Set((res.data as BookMetadata[]).map((b) => b.asin || b.title || '')));
    } catch (e) {
      const axErr = e as AxiosError<{ error?: string }>;
      setError(axErr.response?.data?.error || (e as Error).message);
    } finally {
      setSeriesLoading(false);
    }
  }

  function toggleSeriesMode(val: boolean) {
    setSeriesMode(val);
    if (val) loadSeries();
  }

  function toggleBook(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleAdd() {
    if (!selectedLib) return;
    setLoading(true);
    setError('');
    try {
      if (seriesMode && seriesBooks.length > 0) {
        const toAdd = seriesBooks.filter((b) => selected.has(b.asin || b.title || ''));
        for (const b of toAdd) {
          await libraryService.addToWishlist(selectedLib, {
            ...b,
            wishlistFormat: format,
          } as import('@/types').BookMetadata);
          onAdded(b);
        }
        toast.success(`${toAdd.length} book${toAdd.length > 1 ? 's' : ''} added to library`);
      } else {
        await libraryService.addToWishlist(selectedLib, { ...book, wishlistFormat: format });
        onAdded(book);
        toast.success(`"${book.title}" added to library`);
      }
      onClose();
    } catch (e) {
      const axErr = e as AxiosError<{ error?: string }>;
      setError(axErr.response?.data?.error || (e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const addCount = seriesMode ? selected.size : 1;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-xl shadow-modal flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border flex-shrink-0">
          <h3 className="text-sm font-semibold text-ink">{t('add_to_library_title')}</h3>
          <button onClick={onClose} className="btn-ghost w-7 h-7 p-0 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
          {!seriesMode && (
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-40 h-40 rounded-xl overflow-hidden bg-surface-elevated shadow-sm">
                {book.cover ? (
                  <img src={book.cover} alt={book.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <BookOpen className="w-8 h-8 text-ink-faint" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <div>
                  <p className="text-base font-semibold text-ink leading-snug line-clamp-2">
                    {book.title}
                  </p>
                  <p className="text-sm text-ink-muted mt-0.5">{book.author}</p>
                </div>
                {seriesTitle && (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/25">
                    <BookMarked className="w-3 h-3 text-indigo-400 flex-shrink-0" />
                    <span className="text-xs text-indigo-300 font-medium">
                      {book.series || seriesTitle}
                    </span>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {book.year && <span className="text-xs text-ink-faint">{book.year}</span>}
                  {book.runtime && (
                    <span className="text-xs text-ink-faint flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {book.runtime}
                    </span>
                  )}
                  {book.narrator && (
                    <span className="text-xs text-ink-faint flex items-center gap-1">
                      <Mic className="w-3 h-3" />
                      {book.narrator}
                    </span>
                  )}
                  {book.source && SOURCE_CLS[book.source as keyof typeof SOURCE_CLS] && (
                    <span
                      className={`text-[11px] px-1.5 py-0.5 rounded-full border ${SOURCE_CLS[book.source as keyof typeof SOURCE_CLS]}`}
                    >
                      {SOURCE_LABEL[book.source as keyof typeof SOURCE_LABEL]}
                    </span>
                  )}
                </div>
                {book.description && (
                  <p className="text-xs text-ink-faint line-clamp-3 leading-relaxed">
                    {book.description.replace(/<[^>]+>/g, '')}
                  </p>
                )}
              </div>
            </div>
          )}

          {seriesTitle && (
            <div className="flex rounded-lg overflow-hidden border border-surface-border bg-surface-card">
              <button
                type="button"
                onClick={() => toggleSeriesMode(false)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
                  !seriesMode
                    ? 'bg-indigo-600 text-white'
                    : 'text-ink-dim hover:text-ink hover:bg-surface-elevated'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                {t('add_this_book')}
              </button>
              <button
                type="button"
                onClick={() => toggleSeriesMode(true)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
                  seriesMode
                    ? 'bg-indigo-600 text-white'
                    : 'text-ink-dim hover:text-ink hover:bg-surface-elevated'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                {t('add_whole_series')}
              </button>
            </div>
          )}

          {seriesMode && (
            <div>
              {seriesLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3 animate-pulse">
                      <div className="w-10 h-14 bg-surface-elevated rounded-lg flex-shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 bg-surface-elevated rounded w-3/4" />
                        <div className="h-2.5 bg-surface-elevated rounded w-1/3" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : seriesBooks.length === 0 ? (
                <p className="text-xs text-ink-faint">{t('add_no_volumes')}</p>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto -mx-1 px-1">
                  {seriesBooks.map((b) => {
                    const key = b.asin || b.title || '';
                    const isSelected = selected.has(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleBook(key)}
                        className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-lg border text-left transition-colors ${
                          isSelected
                            ? 'bg-indigo-500/10 border-indigo-500/25'
                            : 'border-transparent hover:bg-surface-elevated'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border ${
                            isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-surface-strong'
                          }`}
                        >
                          {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-surface-elevated flex-shrink-0 shadow-sm">
                          {b.cover ? (
                            <img
                              src={b.cover}
                              alt={b.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <BookOpen className="w-4 h-4 text-ink-faint" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-ink leading-snug line-clamp-2">
                            {b.title}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {b.seriesSequence && (
                              <span className="text-xs text-indigo-400 font-medium">
                                {t('add_volume').replace('{n}', String(b.seriesSequence))}
                              </span>
                            )}
                            {b.year && <span className="text-xs text-ink-faint">{b.year}</span>}
                            {b.runtime && (
                              <span className="text-xs text-ink-faint">{b.runtime}</span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-[11px] text-ink-muted mb-1.5">
              {t('add_format_label')}
            </label>
            <div className="flex rounded-lg overflow-hidden border border-surface-border bg-surface-card">
              {FORMATS.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFormat(value as import('@/types').ContentType)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
                    format === value
                      ? 'bg-indigo-600 text-white'
                      : 'text-ink-dim hover:text-ink hover:bg-surface-elevated'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-ink-muted mb-1.5">
              {t('add_library_label')}
            </label>
            {libraries.length === 0 ? (
              <p className="text-xs text-ink-faint">{t('add_no_library')}</p>
            ) : (
              <div className="flex flex-col gap-1">
                {libraries.map((lib) => {
                  const Icon = LIB_TYPE_ICON[lib.type as keyof typeof LIB_TYPE_ICON] || BookOpen;
                  const active = selectedLib === lib.id;
                  return (
                    <button
                      key={lib.id}
                      onClick={() => setSelectedLib(lib.id)}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm border transition-colors text-left ${
                        active
                          ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'
                          : 'border-surface-border text-ink hover:bg-surface-elevated'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="flex-1 truncate">{lib.name}</span>
                      {active && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="px-5 pb-5 pt-3 flex gap-2 flex-shrink-0 border-t border-surface-border">
          <button onClick={onClose} className="btn-secondary flex-1">
            {t('add_cancel')}
          </button>
          <button
            onClick={handleAdd}
            disabled={
              loading || !selectedLib || libraries.length === 0 || (seriesMode && addCount === 0)
            }
            className="btn-primary flex-1 flex items-center justify-center gap-1.5"
          >
            {loading ? (
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
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>{' '}
                {t('add_adding')}
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" /> {t('add_add')}
                {addCount > 1 ? ` (${addCount})` : ''}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Catalogue result card ─────────────────────────────────────────────────────
function CatalogueCard({
  item,
  added,
  onAdd,
}: {
  item: BookMetadata;
  added: boolean;
  onAdd: (item: BookMetadata) => void;
}) {
  const t = useT();

  return (
    <div className="bg-surface-card border border-surface-border rounded-xl">
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="w-14 h-14 flex-shrink-0 bg-surface-elevated rounded-lg overflow-hidden shadow-sm">
          {item.cover ? (
            <img src={item.cover} alt={item.title} className="w-full h-full object-contain" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-ink-faint" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink leading-snug line-clamp-2">{item.title}</p>
          <p className="text-xs text-ink-muted mt-0.5">{item.author}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
            {item.series && (
              <span className="text-[11px] text-indigo-400 flex items-center gap-0.5">
                <BookMarked className="w-2.5 h-2.5 flex-shrink-0" />
                {item.series}
              </span>
            )}
            {item.year && <span className="text-[11px] text-ink-faint">{item.year}</span>}
            {item.runtime && (
              <span className="text-[11px] text-ink-faint flex items-center gap-0.5">
                <Clock className="w-2.5 h-2.5" />
                {item.runtime}
              </span>
            )}
            {item.narrator && (
              <span className="text-[11px] text-ink-faint flex items-center gap-0.5">
                <Mic className="w-2.5 h-2.5" />
                {item.narrator}
              </span>
            )}
            {item.source && SOURCE_CLS[item.source as keyof typeof SOURCE_CLS] && (
              <span
                className={`text-[11px] px-1.5 py-0 rounded-full border ${SOURCE_CLS[item.source as keyof typeof SOURCE_CLS]}`}
              >
                {SOURCE_LABEL[item.source as keyof typeof SOURCE_LABEL]}
              </span>
            )}
          </div>
          {item.description && (
            <p className="text-[11px] text-ink-faint mt-1 line-clamp-2 leading-relaxed">
              {item.description.replace(/<[^>]+>/g, '')}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0 mt-0.5">
          <button
            onClick={() => onAdd(item)}
            disabled={added}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              added
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25 cursor-default'
                : 'btn-primary border-transparent'
            }`}
          >
            {added ? (
              <>
                <Check className="w-3 h-3" /> {t('add_added')}
              </>
            ) : (
              <>
                <Plus className="w-3 h-3" /> {t('add_add')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Search() {
  const t = useT();
  const [mode, setMode] = useState('catalogue');

  const {
    searchResults,
    setSearchResults,
    searchLoading,
    setSearchLoading,
    searchError,
    setSearchError,
    setLastSearchParams,
    setClientsConfig,
  } = useStore();
  const [indexers, setIndexers] = useState<import('@/types').IndexerConfig[]>([]);
  const [searchType, setSearchType] = useState<ContentType>('ebook');
  const [hasSearched, setHasSearched] = useState(false);

  const [catQuery, setCatQuery] = useState('');
  const [catAuthor, setCatAuthor] = useState('');
  const [catProvider, setCatProvider] = useState('auto');
  const [catResults, setCatResults] = useState<BookMetadata[]>([]);
  const [catLoading, setCatLoading] = useState(false);
  const [catSearched, setCatSearched] = useState(false);
  const [catError, setCatError] = useState('');
  const [libraries, setLibraries] = useState<(Library & { type: string })[]>([]);
  const [addTarget, setAddTarget] = useState<BookMetadata | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());

  useEffect(() => {
    settingsService
      .getProwlarr()
      .then((res) => setIndexers(res.data.indexers || []))
      .catch(() => {});
    settingsService
      .getClients()
      .then((res) => setClientsConfig(res.data))
      .catch(() => {});
    libraryService
      .getAll()
      .then((res) => {
        setLibraries([
          ...(res.data.ebook || []).map((l: Library) => ({ ...l, type: 'ebook' as const })),
          ...(res.data.audiobook || []).map((l: Library) => ({ ...l, type: 'audiobook' as const })),
          ...(res.data.mixed || []).map((l: Library) => ({ ...l, type: 'mixed' as const })),
        ]);
      })
      .catch(() => {});
  }, []);

  async function handleTorrentSearch(params: SearchParams) {
    setSearchLoading(true);
    setSearchError(null);
    setHasSearched(true);
    setLastSearchParams(params);
    setSearchType(params.type === 'audiobook' ? 'audiobook' : 'ebook');
    try {
      const res = await searchService.search(params);
      setSearchResults(res.data.results || []);
    } catch (err) {
      const axErr = err as AxiosError<{ error?: string }>;
      setSearchError(axErr.response?.data?.error || (err as Error).message);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }

  async function handleCatSearch(e?: React.FormEvent) {
    e?.preventDefault();
    if (!catQuery.trim()) return;
    setCatLoading(true);
    setCatSearched(true);
    setCatError('');
    try {
      const typeParam = catProvider === 'audible' || catProvider === 'auto' ? 'audiobook' : 'ebook';
      const params: Record<string, string> = {
        title: catQuery.trim(),
        type: typeParam,
      };
      if (catAuthor.trim()) params.author = catAuthor.trim();
      if (catProvider !== 'auto') params.provider = catProvider;
      const res = await libraryService.searchMetadata(params);
      setCatResults(res.data || []);
    } catch (err) {
      const axErr = err as AxiosError<{ error?: string }>;
      setCatError(axErr.response?.data?.error || (err as Error).message);
      setCatResults([]);
    } finally {
      setCatLoading(false);
    }
  }

  function handleAdded(book: BookMetadata) {
    setAdded((prev) => new Set([...prev, book.asin || book.title || '']));
  }

  const addedKey = (item: BookMetadata) => item.asin || item.title || '';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink mb-0.5">{t('search_title')}</h1>
        <p className="text-sm text-ink-muted">
          {mode === 'torrent' ? t('search_subtitle_torrent') : t('search_subtitle_catalogue')}
        </p>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-2 w-full sm:w-auto">
        {MODES.map(({ value, label, Icon }) => (
          <button
            key={value}
            onClick={() => setMode(value)}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              mode === value
                ? 'border-indigo-500 text-indigo-300 bg-indigo-500/10'
                : 'border-surface-border text-ink-dim hover:text-ink hover:border-surface-strong'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Torrents ── */}
      {mode === 'torrent' && (
        <>
          <SearchBar onSearch={handleTorrentSearch} indexers={indexers} loading={searchLoading} />
          {searchError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm">
              {searchError}
            </div>
          )}
          {(hasSearched || searchResults.length > 0) && (
            <SearchResultsInline
              results={searchResults}
              loading={searchLoading}
              searchType={searchType}
              total={searchResults.length}
            />
          )}
          {!hasSearched && !searchLoading && (
            <div className="flex flex-col items-center justify-center py-24">
              <Zap className="w-10 h-10 text-ink-faint mb-4 opacity-30" />
              <p className="text-base font-medium text-ink-muted">{t('search_ready')}</p>
              <p className="text-sm mt-1 text-ink-faint">{t('search_ready_hint')}</p>
            </div>
          )}
        </>
      )}

      {/* ── Catalogue ── */}
      {mode === 'catalogue' && (
        <>
          <form onSubmit={handleCatSearch} className="flex flex-col gap-2">
            <div className="flex flex-col md:flex-row gap-2">
              <div className="relative md:w-1/2">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint pointer-events-none" />
                <input
                  type="text"
                  value={catQuery}
                  onChange={(e) => setCatQuery(e.target.value)}
                  placeholder={t('search_catalogue_placeholder')}
                  className="input pl-9 w-full"
                  autoFocus
                />
              </div>
              <div className="flex gap-2 md:flex-1">
                <input
                  type="text"
                  value={catAuthor}
                  onChange={(e) => setCatAuthor(e.target.value)}
                  placeholder={t('book_search_author_placeholder')}
                  className="input flex-1 min-w-0"
                />
                <div className="relative flex-shrink-0 w-36">
                  <select
                    value={catProvider}
                    onChange={(e) => setCatProvider(e.target.value)}
                    className="input text-sm w-full appearance-none pr-7"
                  >
                    <option value="auto">Auto</option>
                    <option value="audible">Audible</option>
                    <option value="openlibrary">Open Library</option>
                    <option value="googlebooks">Google Books</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-faint" />
                </div>
                <button
                  type="submit"
                  disabled={catLoading || !catQuery.trim()}
                  className="btn-primary flex-shrink-0 w-10 p-0 flex items-center justify-center"
                >
                  {catLoading ? (
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
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
                    </svg>
                  ) : (
                    <SearchIcon className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </form>

          {catError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm">
              {catError}
            </div>
          )}

          {catLoading && (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 px-4 py-3 bg-surface-card border border-surface-border rounded-xl animate-pulse"
                >
                  <div className="w-14 h-14 rounded-lg bg-surface-elevated flex-shrink-0" />
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="h-3 bg-surface-elevated rounded w-3/4" />
                    <div className="h-2 bg-surface-elevated rounded w-1/2" />
                    <div className="h-2 bg-surface-elevated rounded w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!catLoading && catSearched && catResults.length === 0 && !catError && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-surface-elevated flex items-center justify-center mb-4">
                <SearchIcon className="w-7 h-7 text-ink-faint opacity-50" />
              </div>
              <p className="text-base font-medium text-ink-muted">{t('search_no_results')}</p>
              <p className="text-sm mt-1 text-ink-faint">{t('search_no_results_hint')}</p>
            </div>
          )}

          {!catLoading && catResults.length > 0 && (
            <>
              <p className="section-label">
                {catResults.length} résultat{catResults.length !== 1 ? 's' : ''}
              </p>
              <div className="space-y-2">
                {catResults.map((item, i) => (
                  <CatalogueCard
                    key={item.asin || i}
                    item={item}
                    added={added.has(addedKey(item))}
                    onAdd={setAddTarget}
                  />
                ))}
              </div>
            </>
          )}

          {!catSearched && !catLoading && (
            <div className="flex flex-col items-center justify-center py-24">
              <BookOpen className="w-10 h-10 text-ink-faint mb-4 opacity-30" />
              <p className="text-base font-medium text-ink-muted">{t('search_explore')}</p>
              <p className="text-sm mt-1 text-ink-faint">{t('search_explore_hint')}</p>
            </div>
          )}
        </>
      )}

      {addTarget && (
        <AddToLibraryModal
          book={addTarget}
          libraries={libraries}
          onClose={() => setAddTarget(null)}
          onAdded={handleAdded}
        />
      )}
    </div>
  );
}
