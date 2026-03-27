'use client';
import React, { useState, useEffect } from 'react';
import { X, Search, BookOpen, BookMarked, Clock, Mic, AlertCircle } from 'lucide-react';
import { ScannerBook, BookMetadata } from '@/types';
import { useT } from '@/i18n';
import { libraryService } from '@/api/libraryService';

export default function MetadataPickerModal({
  book,
  onSelect,
  onClose,
}: {
  book: ScannerBook & { _libType?: string };
  onSelect: (item: BookMetadata) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [query, setQuery] = useState(book.title || '');
  const [author, setAuthor] = useState(book.author || '');
  const [results, setResults] = useState<BookMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [provider, setProvider] = useState<string>('auto');

  const PROVIDERS = [
    { id: 'auto', label: 'Auto' },
    { id: 'audible', label: 'Audible' },
    { id: 'googlebooks', label: 'Google Books' },
    { id: 'openlibrary', label: 'Open Library' },
  ];

  function doSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    const params: Record<string, string> = {
      title: query.trim(),
      author: author.trim(),
      type: book._libType || 'audiobook',
    };
    if (provider !== 'auto') params.provider = provider;
    libraryService
      .searchMetadata(params)
      .then((r) => {
        setResults(r.data);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.response?.data?.error || e.message);
        setLoading(false);
      });
  }

  useEffect(() => {
    doSearch();
  }, []);

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') doSearch();
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-4xl shadow-modal overflow-hidden flex flex-col max-h-[80dvh] md:max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
          <h3 className="text-sm font-semibold text-ink">{t('book_metadata_pick')}</h3>
          <button onClick={onClose} className="btn-ghost w-7 h-7 p-0 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search bar */}
        <div className="px-4 pt-3 pb-2 border-b border-surface-border">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative sm:w-1/2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-faint pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKey}
                placeholder={t('book_search_title_placeholder')}
                className="input text-sm pl-8 h-8 py-0 w-full"
                autoFocus
              />
            </div>
            <div className="flex gap-2 sm:contents">
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                onKeyDown={handleKey}
                placeholder={t('book_search_author_placeholder')}
                className="input text-sm h-8 py-0 flex-1 min-w-0 sm:flex-1"
              />
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="input text-sm h-8 py-0 flex-shrink-0 w-28 sm:w-32"
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
              <button
                onClick={doSearch}
                disabled={loading}
                className="btn-primary px-3 h-8 py-0 flex items-center flex-shrink-0"
              >
                <Search className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading && (
            <div className="flex flex-col gap-2 p-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3 animate-pulse">
                  <div className="w-12 aspect-[2/3] bg-surface-elevated rounded-lg flex-shrink-0" />
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="h-3 bg-surface-elevated rounded w-3/4" />
                    <div className="h-2 bg-surface-elevated rounded w-1/2" />
                    <div className="h-2 bg-surface-elevated rounded w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 m-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {!loading && results.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-10 text-center px-6">
              <Search className="w-8 h-8 text-ink-faint mb-3 opacity-30" />
              <p className="text-sm text-ink-muted">{t('book_no_results')}</p>
            </div>
          )}

          {results.map((item) => (
            <div key={item.asin} className="border-b border-surface-border/50 last:border-0">
              <div className="flex items-start gap-3 px-4 py-3">
                {/* Cover */}
                <div className="w-12 flex-shrink-0 aspect-square bg-surface-elevated rounded-lg overflow-hidden shadow-sm">
                  {item.cover ? (
                    <img
                      src={item.cover}
                      alt={item.title}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <BookOpen className="w-4 h-4 text-ink-faint" />
                    </div>
                  )}
                </div>
                {/* Info — clickable to select */}
                <button onClick={() => onSelect(item)} className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-medium text-ink leading-snug line-clamp-2">
                    {item.title}
                  </p>
                  <p className="text-xs text-ink-muted mt-0.5">{item.author}</p>
                  {item.series && (
                    <p className="text-xs text-indigo-400 mt-0.5 flex items-center gap-1">
                      <BookMarked className="w-3 h-3 flex-shrink-0" />
                      {item.series}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
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
                  </div>
                  {item.description && (
                    <p className="text-[11px] text-ink-faint mt-1 line-clamp-2 leading-relaxed">
                      {item.description.replace(/<[^>]+>/g, '')}
                    </p>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-surface-border">
          <button onClick={onClose} className="btn-secondary w-full">
            {t('book_cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
