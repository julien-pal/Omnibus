'use client';
import React from 'react';
import { BookText, Eye, EyeOff } from 'lucide-react';
import { MergedBook } from '@/types';
import { useT } from '@/i18n';
import { coverUrl } from '@/lib/utils';

export default function SeriesListRow({
  name,
  books,
  onClick,
  isFollowed,
  onFollowToggle,
}: {
  name: string;
  books: MergedBook[];
  onClick: () => void;
  isFollowed?: boolean;
  onFollowToggle?: () => void;
}) {
  const t = useT();
  const firstWithCover = books.find((b) => b.savedMeta?.cover || b.cover);
  const cover = coverUrl(firstWithCover?.savedMeta?.cover || firstWithCover?.cover);
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-elevated transition-colors text-left w-full"
    >
      <div className="w-10 h-10 flex-shrink-0 bg-surface-elevated rounded-lg overflow-hidden shadow-sm">
        {cover ? (
          <img src={cover} alt={name} className="w-full h-full object-contain" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <BookText className="w-4 h-4 text-ink-faint" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink truncate">{name}</p>
        <p className="text-xs text-ink-muted">
          {books.length} {books.length > 1 ? t('library_volumes') : t('library_volume')}
        </p>
      </div>
      <span className="flex items-center justify-center w-6 h-6 rounded-md bg-indigo-500/15 text-indigo-400 flex-shrink-0">
        <BookText className="w-3.5 h-3.5" />
      </span>
      {onFollowToggle && (
        <button
          onClick={(e) => { e.stopPropagation(); onFollowToggle(); }}
          className={`flex items-center justify-center w-7 h-7 rounded-lg border transition-colors flex-shrink-0 ${
            isFollowed
              ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
              : 'text-ink-faint border-surface-border hover:text-ink hover:border-surface-strong'
          }`}
        >
          {isFollowed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
      )}
    </button>
  );
}
