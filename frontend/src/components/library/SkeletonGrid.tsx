'use client';
import React from 'react';

export default function SkeletonGrid() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-5">
      {Array.from({ length: 24 }).map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className="aspect-[4/3] bg-surface-elevated rounded-xl mb-2" />
          <div className="h-2.5 bg-surface-elevated rounded w-3/4 mb-1.5" />
          <div className="h-2 bg-surface-elevated rounded w-1/2" />
        </div>
      ))}
    </div>
  );
}
