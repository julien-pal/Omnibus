'use client';
import React, { useState } from 'react';
import { DownloadEntry, DownloadStatus } from '../types';
import { AxiosError } from 'axios';
import {
  Trash2,
  BookOpen,
  Headphones,
  X,
  BookMarked,
  Clock,
  Mic,
  Hash,
  FolderOpen,
  Calendar,
  Layers,
  FolderInput,
} from 'lucide-react';
import { downloadService } from '../api/downloadService';
import useStore from '../store/useStore';
import { useT } from '@/i18n';
import Tooltip from '@/components/Tooltip';
import type { TranslationKey } from '@/i18n';
import { formatBytes } from '@/lib/utils';

const STATUS_CLS: Record<string, string> = {
  downloading: 'text-blue-400 bg-blue-500/15 border-blue-500/25',
  seeding: 'text-violet-400 bg-violet-500/15 border-violet-500/25',
  organizing: 'text-amber-400 bg-amber-500/15 border-amber-500/25',
  done: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/25',
  imported: 'text-teal-400 bg-teal-500/15 border-teal-500/25',
  error: 'text-red-400 bg-red-500/15 border-red-500/25',
  paused: 'text-ink-dim bg-surface-elevated border-surface-border',
  queued: 'text-ink-dim bg-surface-elevated border-surface-border',
};
const STATUS_BAR: Record<string, string> = {
  downloading: 'bg-blue-500',
  seeding: 'bg-violet-500',
  organizing: 'bg-amber-500',
  done: 'bg-emerald-500',
  imported: 'bg-teal-500',
  error: 'bg-red-500',
  paused: 'bg-ink-muted',
  queued: 'bg-ink-muted',
};

function getStatusLabels(
  t: (key: import('@/i18n').TranslationKey) => string,
): Record<string, string> {
  return {
    downloading: t('download_status_downloading'),
    seeding: t('download_status_seeding'),
    organizing: t('download_status_organizing'),
    done: t('download_status_done'),
    imported: t('download_status_imported'),
    error: t('download_status_error'),
    paused: t('download_status_paused'),
    queued: t('download_status_queued'),
  };
}

function formatDate(ts: number | undefined): string {
  if (!ts) return '';
  return new Date(ts).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── Detail modal ──────────────────────────────────────────────────────────────
function DownloadDetailModal({
  download,
  onClose,
  onRemove,
}: {
  download: DownloadEntry;
  onClose: () => void;
  onRemove: () => void;
}) {
  const t = useT();
  const {
    id,
    name,
    type,
    status,
    progress,
    metadata,
    hash,
    destination,
    clientId,
    addedAt,
    size,
    error,
  } = download;
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const isDone = status === 'done' || status === 'seeding';
  const cover = metadata?.cover;
  const TypeIcon = type === 'audiobook' ? Headphones : type === 'mixed' ? Layers : BookOpen;

  const STATUS_LABELS = getStatusLabels(t);

  const sLabel = STATUS_LABELS[status as DownloadStatus] || STATUS_LABELS.queued;
  const sCls = STATUS_CLS[status as DownloadStatus] || STATUS_CLS.queued;
  const sBar = STATUS_BAR[status as DownloadStatus] || STATUS_BAR.queued;

  async function handleImport() {
    setImporting(true);
    setImportMsg('');
    try {
      await downloadService.organize(id);
      setImportMsg('ok');
    } catch (err) {
      const e = err as AxiosError<{ error: string }>;
      setImportMsg('error:' + (e.response?.data?.error || e.message));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-md shadow-modal overflow-hidden flex flex-col max-h-[80dvh] md:max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-4 p-5 border-b border-surface-border">
          {/* Cover */}
          <div className="w-16 h-16 flex-shrink-0 bg-surface-elevated rounded-xl overflow-hidden flex items-center justify-center shadow">
            {cover ? (
              <img src={cover} alt={name} className="w-full h-full object-contain" />
            ) : (
              <TypeIcon className="w-6 h-6 text-ink-faint" />
            )}
          </div>
          {/* Title + status */}
          <div className="flex-1 min-w-0 pt-0.5">
            <h2 className="text-sm font-semibold text-ink leading-snug">{name}</h2>
            {metadata?.author && <p className="text-xs text-ink-muted mt-0.5">{metadata.author}</p>}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`badge border text-[11px] ${sCls}`}>{sLabel}</span>
              {metadata?.series && (
                <span className="text-[11px] text-indigo-400 flex items-center gap-0.5">
                  <BookMarked className="w-2.5 h-2.5" />
                  {metadata.series}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost w-7 h-7 p-0 rounded-lg flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error message */}
        {status === 'error' && error && (
          <div className="mx-5 mt-4 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <p className="text-xs text-red-400 font-medium mb-1">{t('download_detail_error')}</p>
            <p className="text-xs text-red-300 leading-relaxed break-all">{error}</p>
          </div>
        )}

        {/* Progress */}
        <div className="px-5 py-4 border-b border-surface-border space-y-1.5">
          <div className="flex items-center justify-between text-xs text-ink-muted mb-1">
            <span>{t('download_detail_progress')}</span>
            <span className="tabular-nums font-medium text-ink">{isDone ? 100 : progress}%</span>
          </div>
          <div className="h-2 bg-surface-elevated rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${sBar}`}
              style={{ width: `${Math.min(100, isDone ? 100 : progress)}%` }}
            />
          </div>
        </div>

        {/* Details grid */}
        <div className="overflow-y-auto flex-1">
          <div className="px-5 py-4 grid grid-cols-2 gap-x-6 gap-y-3">
            {[
              {
                label: t('download_detail_type'),
                value:
                  type === 'audiobook'
                    ? t('type_audiobook')
                    : type === 'ebook'
                      ? t('type_ebook')
                      : type,
              },
              { label: t('download_detail_size'), value: formatBytes(size) },
              { label: t('download_detail_added'), value: formatDate(addedAt), icon: Calendar },
              { label: t('download_detail_client'), value: clientId || '—' },
              {
                label: t('download_detail_destination'),
                value: destination || '—',
                icon: FolderOpen,
                full: true,
              },
              {
                label: t('download_detail_hash'),
                value: hash || '—',
                icon: Hash,
                full: true,
                mono: true,
              },
            ]
              .filter((r) => r.value && r.value !== '—')
              .map(({ label, value, icon: Icon, full, mono }) => (
                <div key={label} className={full ? 'col-span-2' : ''}>
                  <p className="text-[11px] text-ink-faint mb-0.5">{label}</p>
                  <p
                    className={`text-xs text-ink break-all leading-snug ${mono ? 'font-mono text-[11px] text-ink-muted' : ''}`}
                  >
                    {Icon && <Icon className="w-3 h-3 inline mr-1 text-ink-faint" />}
                    {value}
                  </p>
                </div>
              ))}

            {/* Extra metadata */}
            {metadata?.year && (
              <div>
                <p className="text-[11px] text-ink-faint mb-0.5">{t('download_detail_year')}</p>
                <p className="text-xs text-ink">{metadata.year}</p>
              </div>
            )}
            {metadata?.narrator && (
              <div>
                <p className="text-[11px] text-ink-faint mb-0.5">{t('download_detail_narrator')}</p>
                <p className="text-xs text-ink flex items-center gap-1">
                  <Mic className="w-3 h-3 text-ink-faint" />
                  {metadata.narrator}
                </p>
              </div>
            )}
            {metadata?.runtime && (
              <div>
                <p className="text-[11px] text-ink-faint mb-0.5">{t('download_detail_duration')}</p>
                <p className="text-xs text-ink flex items-center gap-1">
                  <Clock className="w-3 h-3 text-ink-faint" />
                  {metadata.runtime}
                </p>
              </div>
            )}
            {metadata?.description && (
              <div className="col-span-2">
                <p className="text-[11px] text-ink-faint mb-0.5">
                  {t('download_detail_description')}
                </p>
                <p
                  className="text-xs text-ink-muted leading-relaxed line-clamp-4"
                  dangerouslySetInnerHTML={{ __html: metadata.description }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 pt-3 border-t border-surface-border space-y-2">
          {importMsg === 'ok' && (
            <p className="text-xs text-emerald-400">{t('download_import_triggered')}</p>
          )}
          {importMsg.startsWith('error:') && (
            <p className="text-xs text-red-400">{importMsg.slice(6)}</p>
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary flex-1">
              {t('download_close')}
            </button>
            {isDone && (
              <Tooltip text={t('download_copy_to_library')}>
                <button
                  onClick={handleImport}
                  disabled={importing}
                  className="btn-ghost flex items-center gap-1.5 text-indigo-400 hover:bg-indigo-500/10 border border-indigo-500/20 px-3 rounded-lg text-sm"
                >
                  <FolderInput className="w-3.5 h-3.5" />
                  {importing ? '…' : t('download_import_btn')}
                </button>
              </Tooltip>
            )}
            <button
              onClick={onRemove}
              className="btn-ghost flex items-center gap-1.5 text-red-400 hover:bg-red-500/10 border border-red-500/20 px-3 rounded-lg text-sm"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t('download_delete')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Download row ──────────────────────────────────────────────────────────────
export default function DownloadItem({ download }: { download: DownloadEntry }) {
  const t = useT();
  const [showDetail, setShowDetail] = useState(false);
  const { removeDownload } = useStore();
  const { id, name, type, status, progress, metadata } = download;

  const STATUS_LABELS = getStatusLabels(t);

  const sLabel = STATUS_LABELS[status as DownloadStatus] || STATUS_LABELS.queued;
  const sCls = STATUS_CLS[status as DownloadStatus] || STATUS_CLS.queued;
  const sBar = STATUS_BAR[status as DownloadStatus] || STATUS_BAR.queued;

  const cover = metadata?.cover;
  const isDone = status === 'done' || status === 'seeding';
  const TypeIcon = type === 'audiobook' ? Headphones : type === 'mixed' ? Layers : BookOpen;

  async function handleRemove(e?: React.MouseEvent) {
    e?.stopPropagation();
    try {
      await downloadService.remove(id);
      removeDownload(id);
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      <div
        className="flex items-center gap-4 px-4 py-3.5 bg-surface-card border border-surface-border rounded-xl
                   hover:border-surface-strong hover:bg-surface-elevated transition-all cursor-pointer"
        onClick={() => setShowDetail(true)}
      >
        {/* Cover / icon */}
        <div className="w-10 h-10 bg-surface-elevated rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center">
          {cover ? (
            <img src={cover} alt={name} className="w-full h-full object-contain" />
          ) : (
            <TypeIcon className="w-4 h-4 text-ink-muted" />
          )}
        </div>

        {/* Info + progress */}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-ink line-clamp-2 leading-snug mb-0.5">{name}</h3>
          {metadata?.author && <p className="text-xs text-ink-muted mb-1.5">{metadata.author}</p>}
          <div className="flex items-center gap-1.5 mb-1.5">
            <span
              className={`flex items-center gap-1 badge border text-[11px] ${
                type === 'audiobook'
                  ? 'text-violet-400 bg-violet-500/15 border-violet-500/25'
                  : 'text-blue-400 bg-blue-500/15 border-blue-500/25'
              }`}
            >
              <TypeIcon className="w-3 h-3" />
              {type === 'audiobook' ? t('type_audio') : t('type_ebook')}
            </span>
            <span
              className={`badge flex-shrink-0 border text-[11px] ${sCls} ${status === 'error' ? 'cursor-pointer hover:opacity-80' : ''}`}
              onClick={
                status === 'error'
                  ? (e) => {
                      e.stopPropagation();
                      setShowDetail(true);
                    }
                  : undefined
              }
              title={status === 'error' && download.error ? download.error : undefined}
            >
              {sLabel}
            </span>
          </div>
          {status === 'error' && download.error && (
            <p
              className="text-[11px] text-red-400 leading-snug line-clamp-2 mb-1 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                setShowDetail(true);
              }}
            >
              {download.error}
            </p>
          )}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1 bg-surface-elevated rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${sBar}`}
                style={{ width: `${Math.min(100, isDone ? 100 : progress)}%` }}
              />
            </div>
            <div className="flex items-center gap-2 text-[11px] text-ink-muted flex-shrink-0">
              <span className="tabular-nums">{isDone ? '100' : progress}%</span>
              {download.size && <span>{formatBytes(download.size)}</span>}
            </div>
          </div>
        </div>

        {/* Remove */}
        <Tooltip text={t('download_delete')}>
          <button
            onClick={handleRemove}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-red-400 bg-red-500/10 border border-red-500/25 hover:bg-red-500/20 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </Tooltip>
      </div>

      {showDetail && (
        <DownloadDetailModal
          download={download}
          onClose={() => setShowDetail(false)}
          onRemove={() => {
            handleRemove();
            setShowDetail(false);
          }}
        />
      )}
    </>
  );
}
