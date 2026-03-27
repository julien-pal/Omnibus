'use client';
import React from 'react';
import { X } from 'lucide-react';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useT } from '@/i18n';

interface SleepTimerPopoverProps {
  open: boolean;
  onClose: () => void;
}

export default function SleepTimerPopover({ open, onClose }: SleepTimerPopoverProps) {
  const t = useT();
  const setSleepTimer = usePlayerStore((s) => s.setSleepTimer);

  if (!open) return null;

  function select(value: number | null) {
    setSleepTimer(value);
    onClose();
  }

  const presets: { label: string; value: number | null }[] = [
    { label: '5 min', value: 5 * 60 },
    { label: '10 min', value: 10 * 60 },
    { label: '15 min', value: 15 * 60 },
    { label: '20 min', value: 20 * 60 },
    { label: '30 min', value: 30 * 60 },
    { label: '45 min', value: 45 * 60 },
    { label: t('player_sleep_end_chapter'), value: -1 },
    { label: t('player_sleep_off'), value: null },
  ];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm" onClick={onClose} />
      {/* Popover */}
      <div className="fixed inset-0 z-[101] flex items-center justify-center pointer-events-none">
        <div className="pointer-events-auto w-72 bg-surface-card border border-surface-border rounded-xl shadow-modal overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-surface-border">
            <span className="text-xs font-medium text-ink-muted">{t('player_sleep_timer')}</span>
            <button
              onClick={onClose}
              className="btn-ghost w-6 h-6 p-0 rounded flex items-center justify-center"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 p-3">
            {presets
              .filter((p) => p.value !== null && p.value !== -1)
              .map(({ label, value }) => (
                <button
                  key={String(value)}
                  onClick={() => select(value)}
                  className="flex items-center justify-center rounded-lg py-2.5 text-sm font-medium text-ink bg-surface-elevated hover:bg-indigo-500/20 hover:text-indigo-300 transition-colors"
                >
                  {label}
                </button>
              ))}
          </div>
          <div className="grid grid-cols-2 gap-2 px-3 pb-3">
            <button
              onClick={() => select(-1)}
              className="flex items-center justify-center rounded-lg py-2.5 text-sm font-medium text-ink bg-surface-elevated hover:bg-indigo-500/20 hover:text-indigo-300 transition-colors"
            >
              {t('player_sleep_end_chapter')}
            </button>
            <button
              onClick={() => select(null)}
              className="flex items-center justify-center rounded-lg py-2.5 text-sm font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors"
            >
              {t('player_sleep_off')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
