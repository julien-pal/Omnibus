'use client';
import React from 'react';
import { BookText } from 'lucide-react';
import { MergedBook } from '@/types';
import { useT } from '@/i18n';
import { coverUrl } from '@/lib/utils';

type ProgressMap = Record<string, { percentage?: number; completed?: boolean }>;

export default function SeriesTile({
  name,
  books,
  onClick,
  allProgress,
}: {
  name: string;
  books: MergedBook[];
  onClick: () => void;
  allProgress?: ProgressMap;
}) {
  const t = useT();
  const firstWithCover = books.find((b) => b.savedMeta?.cover || b.cover);
  const cover = coverUrl(firstWithCover?.savedMeta?.cover || firstWithCover?.cover);

  const seriesPct = allProgress
    ? books.reduce((sum, b) => {
        const p = allProgress[b.path];
        return sum + (p?.completed ? 1 : (p?.percentage ?? 0));
      }, 0) / books.length
    : 0;
  const seriesComplete = seriesPct >= 1;

  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-center text-center focus:outline-none"
    >
      <div
        className="aspect-square w-[85%] bg-surface-elevated rounded-xl overflow-hidden mb-2
                      shadow-md group-hover:shadow-xl group-hover:scale-[1.03] transition-all duration-200 relative"
      >
        {cover ? (
          <img src={cover!} alt={name} className="w-full h-full object-contain" />
        ) : (
          <div
            className="w-full h-full flex flex-col items-center justify-center gap-2 p-3
                          bg-gradient-to-b from-surface-elevated to-surface-card"
          >
            <BookText className="w-6 h-6 text-ink-faint" />
            <p className="text-[10px] text-ink-faint text-center leading-tight line-clamp-4">
              {name}
            </p>
          </div>
        )}
        <span className="absolute bottom-1.5 right-1.5 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-md backdrop-blur-sm tabular-nums">
          {books.length} {books.length > 1 ? t('library_volumes') : t('library_volume')}
        </span>
        {seriesPct > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30 rounded-b-xl overflow-hidden">
            <div
              className={`h-full rounded-b-xl ${seriesComplete ? 'bg-green-500' : 'bg-indigo-500'}`}
              style={{ width: `${Math.min(seriesPct * 100, 100)}%` }}
            />
          </div>
        )}
      </div>
      <p className="text-xs font-medium text-ink truncate leading-snug w-full">{name}</p>
    </button>
  );
}
