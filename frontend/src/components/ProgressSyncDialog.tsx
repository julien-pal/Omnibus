'use client';
import React from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useT } from '@/i18n';
import { useSyncPrefStore } from '@/store/useSyncPrefStore';

export interface syncInfo {
  ebookChapter?: string | null;
  ebookCfi?: string | null;
  ebookText?: string;
  ebookUpdatedAt?: number | null;
  audioFileName?: string | null;
  audioSeconds?: number | null;
  audioUpdatedAt?: number | null;
  audioText?: string;
  /** Computed ebook position from audio sync lookup */
  computedSpineHref?: string | null;
  computedPct?: number | null;
  computedConfidence?: string | null;
  loading?: boolean;
}

export interface CfiDebugResult {
  searchPhrase: string | null;
  matchedText: string | null;
  spineHref: string | null;
  spineIndex: number | null;
  charOffsetInItem: number | null;
  matchedScore: number | null;
  confidence: string;
  cfi: string | null;
}

interface Props {
  sourceFormat: 'audiobook' | 'ebook';
  onSync: () => void | Promise<void>;
  onKeep: () => void;
  onClose?: () => void;
  syncInfo?: syncInfo;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

function PositionBlock({
  label,
  labelColor,
  date,
  subtitle,
  text,
  loading,
}: {
  label: string;
  labelColor: string;
  date?: number | null;
  subtitle?: string | null;
  text?: string | null;
  loading?: boolean;
}) {
  const t = useT();
  return (
    <div className="rounded-xl border border-surface-border bg-black/20 text-[11px] overflow-hidden">
      <div className="p-2.5 space-y-1">
        <div className="flex justify-between items-center gap-2">
          <p className={`${labelColor} font-semibold uppercase tracking-wide text-[10px] shrink-0`}>
            {label}
          </p>
          {date != null && (
            <p className="text-ink-muted text-[10px] text-right">
              {new Date(date).toLocaleString()}
            </p>
          )}
        </div>
        {loading ? (
          <p className="text-ink-muted italic">{t('sync_loading')}</p>
        ) : (
          <>
            {subtitle && <p className="text-ink-dim truncate text-[10px] font-mono">{subtitle}</p>}
            {text && <p className="text-ink leading-snug line-clamp-2">&ldquo;{text}&rdquo;</p>}
          </>
        )}
      </div>
    </div>
  );
}

export default function ProgressSyncDialog({
  sourceFormat,
  onSync,
  onKeep,
  onClose,
  syncInfo,
}: Props) {
  const t = useT();
  const { setPref } = useSyncPrefStore();
  // t is passed implicitly via closure to inline jsx above
  const [dontAsk, setDontAsk] = React.useState(false);

  function handleSync() {
    if (dontAsk) setPref('sync');
    onSync();
  }

  function handleKeep() {
    if (dontAsk) setPref('ignore');
    onKeep();
  }

  const formatLabel =
    sourceFormat === 'audiobook' ? t('sync_format_audio') : t('sync_format_ebook');

  // Build subtitle lines
  const audioSubtitle =
    [
      syncInfo?.audioFileName ?? null,
      syncInfo?.audioSeconds != null ? formatTime(syncInfo.audioSeconds) : null,
    ]
      .filter(Boolean)
      .join(' • ') || null;

  const ebookBlock = (
    <PositionBlock
      label={t('sync_ebook_position')}
      labelColor="text-indigo-400"
      date={syncInfo?.ebookUpdatedAt}
      subtitle={syncInfo?.ebookChapter ?? null}
      text={syncInfo?.ebookText ?? null}
      loading={syncInfo?.loading}
    />
  );

  const audioBlock = (
    <PositionBlock
      label={t('sync_audio_position')}
      labelColor="text-amber-400"
      date={syncInfo?.audioUpdatedAt}
      subtitle={audioSubtitle}
      text={syncInfo?.audioText ?? null}
      loading={syncInfo?.loading}
    />
  );

  // audiobook = audio is ahead, show ebook (current) first then audio (target)
  // ebook = ebook is ahead, show audio (current/behind) first then ebook (current)
  const audioAhead = sourceFormat === 'audiobook';

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[120] p-4"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-sm p-5 space-y-4 max-h-[80dvh] md:max-h-[90vh] overflow-y-auto">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
            <RefreshCw className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-ink">{t('sync_dialog_title')}</h2>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-ink-muted hover:text-ink hover:bg-surface-elevated transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {audioAhead ? (
            <>
              {ebookBlock}
              <button
                onClick={handleKeep}
                className="w-full px-4 py-2 rounded-xl border border-surface-border text-sm text-ink-dim hover:text-ink hover:border-surface-strong transition-colors"
              >
                {t('sync_dialog_keep')}
              </button>
              {audioBlock}
              <button
                onClick={handleSync}
                className="btn-primary w-full text-sm px-4 py-2 rounded-xl"
              >
                {t('sync_dialog_go')}
              </button>
            </>
          ) : (
            <>
              {audioBlock}
              <button
                onClick={handleKeep}
                className="w-full px-4 py-2 rounded-xl border border-surface-border text-sm text-ink-dim hover:text-ink hover:border-surface-strong transition-colors"
              >
                {t('sync_dialog_keep')}
              </button>
              {ebookBlock}
              <button
                onClick={handleSync}
                className="btn-primary w-full text-sm px-4 py-2 rounded-xl"
              >
                {t('sync_dialog_go')}
              </button>
            </>
          )}
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={dontAsk}
            onChange={(e) => setDontAsk(e.target.checked)}
            className="w-3.5 h-3.5 rounded accent-indigo-500"
          />
          <span className="text-xs text-ink-muted">{t('sync_dialog_dont_ask')}</span>
        </label>
      </div>
    </div>
  );
}
