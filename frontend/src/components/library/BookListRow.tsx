'use client';
import React from 'react';
import { BookOpen } from 'lucide-react';
import { MergedBook } from '@/types';
import { coverUrl } from '@/lib/utils';
import { extractSeries } from '@/lib/libraryUtils';
import { FormatBadges } from '@/components/BookDetailModal';

export default function BookListRow({
  book,
  onClick,
  onSelectSeries,
}: {
  book: MergedBook;
  onClick: (book: MergedBook) => void;
  onSelectSeries?: (series: string) => void;
}) {
  const cover = coverUrl(book.savedMeta?.cover || book.cover);
  return (
    <button
      onClick={() => onClick(book)}
      className="group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-elevated transition-colors text-left w-full"
    >
      <div className="w-10 h-10 flex-shrink-0 bg-surface-elevated rounded-lg overflow-hidden shadow-sm relative">
        {cover ? (
          <img src={cover} alt={book.title} className="w-full h-full object-contain" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-ink-faint" />
          </div>
        )}
        <FormatBadges book={book} mode="overlay-sm" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink truncate">{book.title}</p>
        <p className="text-xs text-ink-muted truncate">{book.author}</p>
      </div>
      {extractSeries(book) && (
        onSelectSeries ? (
          <button
            onClick={(e) => { e.stopPropagation(); onSelectSeries(extractSeries(book)!); }}
            className="text-[11px] text-indigo-400 hidden md:flex flex-shrink-0 max-w-[200px] truncate hover:underline"
          >
            {extractSeries(book)}
          </button>
        ) : (
          <span className="text-[11px] text-indigo-400 hidden md:block flex-shrink-0 max-w-[200px] truncate">
            {extractSeries(book)}
          </span>
        )
      )}
      <FormatBadges book={book} mode="inline" />
    </button>
  );
}
