'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  Headphones,
  Library,
  CheckCircle2,
  Clock,
  BookMarked,
  Users,
  Layers,
  HardDrive,
  TrendingUp,
  Globe,
  ListFilter,
  ChevronDown,
} from 'lucide-react';
import { statsService, StatsGenreEntry, StatsYearEntry } from '@/api/statsService';
import { libraryService } from '@/api';
import { useT } from '@/i18n';
import type { Library as LibType } from '@/types';

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = 'indigo',
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: 'indigo' | 'emerald' | 'amber' | 'sky' | 'violet' | 'rose';
}) {
  const colorMap = {
    indigo: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    sky: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    violet: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    rose: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  };

  return (
    <div className="bg-surface-elevated border border-surface-border rounded-xl p-4 flex items-center gap-4">
      <div
        className={`w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0 border ${colorMap[color]}`}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-ink leading-tight">{value}</p>
        <p className="text-sm text-ink-dim truncate">{label}</p>
        {sub && <p className="text-xs text-ink-muted">{sub}</p>}
      </div>
    </div>
  );
}

function BarChart({
  data,
  labelKey,
  max,
}: {
  data: { label: string; count: number }[];
  labelKey?: string;
  max: number;
}) {
  void labelKey;
  if (!data.length) return <p className="text-sm text-ink-muted italic">—</p>;

  return (
    <div className="space-y-2">
      {data.map(({ label, count }) => (
        <div key={label} className="flex items-center gap-3 text-sm">
          <span className="w-32 text-ink-dim truncate flex-shrink-0 text-xs" title={label}>
            {label}
          </span>
          <div className="flex-1 bg-surface-base rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-indigo-500/60 rounded-full transition-all"
              style={{ width: `${Math.max(4, (count / max) * 100)}%` }}
            />
          </div>
          <span className="w-8 text-right text-ink-muted text-xs flex-shrink-0">{count}</span>
        </div>
      ))}
    </div>
  );
}

function YearSparkline({ data }: { data: StatsYearEntry[] }) {
  if (!data.length) return <p className="text-sm text-ink-muted italic">—</p>;

  const max = Math.max(...data.map((d) => d.count));
  const height = 48;

  return (
    <div className="flex items-end gap-1 h-12">
      {data.map(({ year, count }) => (
        <div key={year} className="flex flex-col items-center gap-1 flex-1 min-w-0 group">
          <div
            className="w-full bg-indigo-500/50 rounded-sm transition-all group-hover:bg-indigo-400/70"
            style={{ height: `${Math.max(3, (count / max) * height)}px` }}
            title={`${year}: ${count}`}
          />
        </div>
      ))}
    </div>
  );
}

const TYPE_ICON = {
  audiobook: Headphones,
  mixed: Layers,
  ebook: BookOpen,
};

type LibWithType = LibType & { type: string };

export default function StatsPage() {
  const t = useT();
  const [selectedLibrary, setSelectedLibrary] = useState<LibWithType | null>(null);

  const { data: librariesData } = useQuery({
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

  useEffect(() => {
    if (allLibraries.length > 0 && !selectedLibrary) {
      const savedId = typeof window !== 'undefined' ? localStorage.getItem('library_selectedId') : null;
      const saved = savedId ? allLibraries.find((l) => l.id === savedId) : null;
      setSelectedLibrary(saved || allLibraries[0]);
    }
  }, [allLibraries.length]);

  function selectLibrary(lib: LibWithType) {
    setSelectedLibrary(lib);
    if (typeof window !== 'undefined') localStorage.setItem('library_selectedId', lib.id);
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ['stats', selectedLibrary?.id],
    queryFn: () => statsService.getStats(selectedLibrary?.id).then((r) => r.data),
    enabled: !!selectedLibrary,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-ink-dim">
        {t('stats_loading')}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-48 text-ink-dim">{t('stats_no_data')}</div>
    );
  }

  const topGenres: StatsGenreEntry[] = data.byGenre.slice(0, 10);
  const genreMax = topGenres[0]?.count ?? 1;

  const listeningLabel =
    data.listeningHours > 0
      ? `${data.listeningHours}h ${data.listeningMinutes}m`
      : `${data.listeningMinutes}m`;

  const readPct =
    data.totalBooks > 0 ? Math.round((data.booksCompleted / data.totalBooks) * 100) : 0;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">{t('stats_title')}</h1>
          <p className="text-sm text-ink-dim mt-0.5">{t('stats_subtitle')}</p>
        </div>
        {allLibraries.length > 1 && (
          <div className="relative">
            <select
              value={selectedLibrary?.id || ''}
              onChange={(e) => {
                const lib = allLibraries.find((l) => l.id === e.target.value);
                if (lib) selectLibrary(lib);
              }}
              className="appearance-none bg-surface-elevated border border-surface-border rounded-lg px-3 py-1.5 pr-8 text-sm text-ink cursor-pointer hover:border-indigo-500/40 transition-colors"
            >
              {allLibraries.map((lib) => (
                <option key={lib.id} value={lib.id}>
                  {lib.name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-dim pointer-events-none" />
          </div>
        )}
      </div>

      {/* Overview grid */}
      <section>
        <h2 className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-3">
          {t('stats_overview')}
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <StatCard
            icon={Library}
            label={t('stats_total_books')}
            value={data.totalBooks}
            color="indigo"
          />
          <StatCard
            icon={Layers}
            label={t('stats_series')}
            value={data.totalSeries}
            color="violet"
          />
          <StatCard
            icon={Users}
            label={t('stats_authors')}
            value={data.totalAuthors}
            color="sky"
          />
          <StatCard
            icon={HardDrive}
            label={t('stats_total_size')}
            value={data.totalSizeFormatted}
            color="amber"
          />
        </div>
      </section>

      {/* Library breakdown + Reading status */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Library breakdown */}
        <section className="bg-surface-elevated border border-surface-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-ink mb-4 flex items-center gap-2">
            <ListFilter className="w-4 h-4 text-ink-dim" />
            {t('stats_library_breakdown')}
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-indigo-400" />
                <span className="text-sm text-ink-dim">{t('stats_ebooks')}</span>
              </div>
              <span className="font-semibold text-ink">{data.totalEbooks}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Headphones className="w-4 h-4 text-emerald-400" />
                <span className="text-sm text-ink-dim">{t('stats_audiobooks')}</span>
              </div>
              <span className="font-semibold text-ink">{data.totalAudiobooks}</span>
            </div>
            {data.totalMixed > 0 && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Library className="w-4 h-4 text-violet-400" />
                  <span className="text-sm text-ink-dim">{t('stats_mixed')}</span>
                </div>
                <span className="font-semibold text-ink">{data.totalMixed}</span>
              </div>
            )}
            {data.totalListeningSeconds > 0 && (
              <>
                <div className="border-t border-surface-border my-1" />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-400" />
                    <span className="text-sm text-ink-dim">{t('stats_listening_time')}</span>
                  </div>
                  <span className="font-semibold text-ink">{listeningLabel}</span>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Reading status */}
        <section className="bg-surface-elevated border border-surface-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-ink mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-ink-dim" />
            {t('stats_reading_status')}
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-sm text-ink-dim">{t('stats_completed')}</span>
              </div>
              <span className="font-semibold text-ink">
                {data.booksCompleted}
                {data.totalBooks > 0 && (
                  <span className="text-xs text-ink-muted ml-1">({readPct}%)</span>
                )}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-indigo-400" />
                <span className="text-sm text-ink-dim">{t('stats_in_progress')}</span>
              </div>
              <span className="font-semibold text-ink">{data.booksInProgress}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookMarked className="w-4 h-4 text-rose-400" />
                <span className="text-sm text-ink-dim">{t('stats_wishlist')}</span>
              </div>
              <span className="font-semibold text-ink">{data.booksWishlist}</span>
            </div>
            {/* Progress bar */}
            {data.totalBooks > 0 && (
              <div className="pt-1">
                <div className="flex justify-between text-xs text-ink-muted mb-1">
                  <span>{t('stats_completed')}</span>
                  <span>{readPct}%</span>
                </div>
                <div className="h-2 bg-surface-base rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500/60 rounded-full transition-all"
                    style={{ width: `${readPct}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Genre distribution */}
      {topGenres.length > 0 && (
        <section className="bg-surface-elevated border border-surface-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-ink mb-4 flex items-center gap-2">
            <ListFilter className="w-4 h-4 text-ink-dim" />
            {t('stats_by_genre')}
          </h2>
          <BarChart
            data={topGenres.map((g) => ({ label: g.genre, count: g.count }))}
            max={genreMax}
          />
        </section>
      )}

      {/* Language + Year side by side */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Language distribution */}
        {data.byLanguage.length > 0 && (
          <section className="bg-surface-elevated border border-surface-border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-ink mb-4 flex items-center gap-2">
              <Globe className="w-4 h-4 text-ink-dim" />
              {t('stats_by_language')}
            </h2>
            <BarChart
              data={data.byLanguage.map((l) => ({ label: l.language, count: l.count }))}
              max={data.byLanguage[0]?.count ?? 1}
            />
          </section>
        )}

        {/* Year distribution */}
        {data.byYear.length > 0 && (
          <section className="bg-surface-elevated border border-surface-border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-ink mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-ink-dim" />
              {t('stats_by_year')}
            </h2>
            <YearSparkline data={data.byYear} />
            <div className="flex justify-between text-xs text-ink-muted mt-1">
              <span>{data.byYear[0]?.year}</span>
              <span>{data.byYear[data.byYear.length - 1]?.year}</span>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
