'use client';
import React, { useState } from 'react';
import { Search, SlidersHorizontal, ChevronDown, ChevronUp } from 'lucide-react';
import { IndexerConfig } from '../types';
import { useT } from '@/i18n';

export interface SearchParams {
  query: string;
  author: string;
  title: string;
  series: string;
  type: string;
  indexerIds: number[];
}

interface SearchBarProps {
  onSearch: (params: SearchParams) => void;
  indexers?: IndexerConfig[];
  loading?: boolean;
}

export default function SearchBar({ onSearch, indexers = [], loading = false }: SearchBarProps) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [author, setAuthor] = useState('');
  const [title, setTitle] = useState('');
  const [series, setSeries] = useState('');
  const [type, setType] = useState('both');
  const [selectedIndexers, setSelectedIndexers] = useState<number[]>([]);

  const TYPES = [
    { value: 'both', label: t('searchbar_type_all') },
    { value: 'ebook', label: t('type_ebook') },
    { value: 'audiobook', label: t('searchbar_type_audio') },
  ];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSearch({ query, author, title, series, type, indexerIds: selectedIndexers });
  }

  function toggleIndexer(id: number) {
    setSelectedIndexers((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      {/* Row 1: Search input + search button */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchbar_placeholder')}
            className="input pl-9 w-full"
            autoFocus
          />
        </div>
        <button
          type="submit"
          disabled={loading || (!query && !author && !title)}
          className="btn-primary flex-shrink-0 w-10 p-0 flex items-center justify-center"
        >
          {loading ? (
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
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
            <Search className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Row 2: Type pills + advanced toggle */}
      <div className="flex gap-2">
        <div className="flex rounded-lg overflow-hidden border border-surface-border bg-surface-card flex-1">
          {TYPES.map((tp) => (
            <button
              key={tp.value}
              type="button"
              onClick={() => setType(tp.value)}
              className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                type === tp.value
                  ? 'bg-indigo-600 text-white'
                  : 'text-ink-dim hover:text-ink hover:bg-surface-elevated'
              }`}
            >
              {tp.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setAdvanced((v) => !v)}
          className={`btn-secondary flex-shrink-0 ${advanced ? 'border-indigo-500/40 text-indigo-300' : ''}`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          {advanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* Advanced panel */}
      {advanced && (
        <div className="bg-surface-card border border-surface-border rounded-xl p-4 space-y-4">
          <div className="flex gap-3">
            <div className="w-1/2">
              <label className="block text-[11px] text-ink-muted uppercase tracking-wide mb-1">
                {t('searchbar_title_label')}
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('searchbar_title_placeholder')}
                className="input text-sm"
              />
            </div>
            <div className="flex gap-3 w-1/2">
              <div className="flex-1">
                <label className="block text-[11px] text-ink-muted uppercase tracking-wide mb-1">
                  {t('searchbar_author_label')}
                </label>
                <input
                  type="text"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder={t('searchbar_author_placeholder')}
                  className="input text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="block text-[11px] text-ink-muted uppercase tracking-wide mb-1">
                  {t('searchbar_series_label')}
                </label>
                <input
                  type="text"
                  value={series}
                  onChange={(e) => setSeries(e.target.value)}
                  placeholder={t('searchbar_series_placeholder')}
                  className="input text-sm"
                />
              </div>
            </div>
          </div>

          {indexers.length > 0 && (
            <div>
              <label className="block text-[11px] text-ink-muted uppercase tracking-wide mb-2">
                {t('searchbar_indexers_label')}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {indexers.map((idx) => (
                  <button
                    key={idx.id}
                    type="button"
                    onClick={() => toggleIndexer(idx.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                      selectedIndexers.includes(idx.id)
                        ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                        : 'bg-surface-elevated border-surface-border text-ink-muted hover:border-surface-strong hover:text-ink'
                    }`}
                  >
                    {idx.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
