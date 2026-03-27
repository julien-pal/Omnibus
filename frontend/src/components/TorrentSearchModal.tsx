'use client';
import React, { useState, useEffect } from 'react';
import { X, Search, Zap, AlertCircle } from 'lucide-react';
import { ScannerBook, IndexerConfig, SearchResult } from '@/types';
import { useT } from '@/i18n';
import { searchService, settingsService } from '@/api';
import useStore from '@/store/useStore';
import BookCard from '@/components/BookCard';
import { AxiosError } from 'axios';

export default function TorrentSearchModal({
  book,
  onClose,
}: {
  book: ScannerBook;
  onClose: () => void;
}) {
  const t = useT();
  const TORRENT_TYPES = [
    { value: 'both', label: t('searchbar_type_all') },
    { value: 'ebook', label: t('type_ebook') },
    { value: 'audiobook', label: t('searchbar_type_audio') },
  ];
  const meta = book.savedMeta || {};
  const fmt = meta.wishlistFormat || 'both';

  const [query, setQuery] = useState(meta.title || book.title || '');
  const [type, setType] = useState(
    fmt === 'ebook' ? 'ebook' : fmt === 'audiobook' ? 'audiobook' : 'both',
  );
  const [indexers, setIndexers] = useState<IndexerConfig[]>([]);
  const [selectedIndexers, setSelectedIndexers] = useState<number[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { setClientsConfig } = useStore();

  useEffect(() => {
    settingsService
      .getClients()
      .then((r) => setClientsConfig(r.data))
      .catch(() => {});
    settingsService
      .getProwlarr()
      .then((r) => setIndexers(r.data.indexers || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    doSearch();
  }, []);

  async function doSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    try {
      const r = await searchService.search({
        query: query.trim(),
        type,
        indexerIds: selectedIndexers,
      });
      setResults(r.data.results || []);
    } catch (e) {
      const err = e as AxiosError<{ error: string }>;
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }

  function toggleIndexer(id: number) {
    setSelectedIndexers((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  }

  const cardType = type === 'audiobook' ? 'audiobook' : 'ebook';

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-2xl shadow-modal flex flex-col max-h-[80dvh] md:max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border flex-shrink-0">
          <h3 className="text-sm font-semibold text-ink flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-indigo-400" />
            {t('torrent_search_title')}
          </h3>
          <button onClick={onClose} className="btn-ghost w-7 h-7 p-0 rounded-lg flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search bar */}
        <div className="px-4 py-3 border-b border-surface-border flex-shrink-0 space-y-2">
          {/* Row 1: input full width */}
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-faint pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doSearch()}
              className="input text-sm pl-8 h-8 py-0 w-full"
              autoFocus
            />
          </div>
          {/* Row 2: type toggle + search button */}
          <div className="flex gap-2">
            <div className="flex rounded-lg overflow-hidden border border-surface-border bg-surface-card flex-1">
              {TORRENT_TYPES.map((tt) => (
                <button
                  key={tt.value}
                  onClick={() => setType(tt.value)}
                  className={`flex-1 h-8 text-xs font-medium transition-colors ${
                    type === tt.value
                      ? 'bg-indigo-600 text-white'
                      : 'text-ink-dim hover:text-ink hover:bg-surface-elevated'
                  }`}
                >
                  {tt.label}
                </button>
              ))}
            </div>
            <button
              onClick={doSearch}
              disabled={loading || !query.trim()}
              className="btn-primary h-8 px-4 flex-shrink-0"
            >
              {loading ? (
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
                </svg>
              ) : (
                <Search className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          {indexers.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {indexers.map((idx) => (
                <button
                  key={idx.id}
                  onClick={() => toggleIndexer(idx.id)}
                  className={`px-2.5 py-0.5 rounded-lg text-xs font-medium border transition-colors ${
                    selectedIndexers.includes(idx.id)
                      ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                      : 'bg-surface-elevated border-surface-border text-ink-muted hover:text-ink'
                  }`}
                >
                  {idx.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Results */}
        <div className="overflow-y-auto flex-1 p-4">
          {loading && (
            <div className="space-y-1.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-4 py-3 bg-surface-elevated rounded-xl animate-pulse"
                >
                  <div className="w-8 h-8 rounded-lg bg-surface-card flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-surface-card rounded w-4/5" />
                    <div className="h-2 bg-surface-card rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {!loading && !error && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Zap className="w-8 h-8 text-ink-faint mb-3 opacity-30" />
              <p className="text-sm text-ink-muted">{t('torrent_no_results')}</p>
              <p className="text-xs text-ink-faint mt-1">{t('torrent_check_prowlarr')}</p>
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="space-y-1.5">
              <p className="section-label mb-2">
                {results.length !== 1
                  ? t('search_results_count').replace('{count}', String(results.length))
                  : t('search_result_count').replace('{count}', String(results.length))}
              </p>
              {results.map((result, i) => (
                <BookCard
                  key={result.guid || i}
                  result={{
                    ...result,
                    _metadataPath: book.path,
                    metadata: book.savedMeta || result.metadata,
                  }}
                  searchType={cardType}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
