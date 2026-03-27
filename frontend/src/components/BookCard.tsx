'use client';
import React, { useState } from 'react';
import { BookOpen, Download, Headphones, Zap, X, Calendar } from 'lucide-react';
import { downloadService } from '@/api/downloadService';
import useStore from '../store/useStore';
import { SearchResult, ContentType, DownloadEntry } from '../types';
import { AxiosError } from 'axios';
import { useT } from '@/i18n';
import Tooltip from '@/components/Tooltip';
import { formatBytes } from '@/lib/utils';
import { toast } from '@/store/useToastStore';

function formatDate(value: string | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatCategory(category: unknown): string {
  if (category == null) return '';
  if (typeof category === 'string' || typeof category === 'number') return String(category);
  if (typeof category === 'object' && category !== null) {
    const c = category as Record<string, unknown>;
    if (c['name']) return String(c['name']);
    if (c['id'] !== undefined && c['id'] !== null) return String(c['id']);
  }
  return '';
}

function DownloadModal({
  result,
  onClose,
  onDownloaded,
}: {
  result: SearchResult;
  onClose: () => void;
  onDownloaded: (dl: DownloadEntry) => void;
}) {
  const t = useT();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { clientsConfig } = useStore();
  const clients = clientsConfig?.clients || [];

  async function handleDownload() {
    setLoading(true);
    setError('');
    try {
      const payload = {
        url: result.downloadUrl || '',
        magnetUrl: result.magnetUrl || '',
        name: result.metadata?.title || result.title,
        type: result._searchType || 'ebook',
        metadata: result.metadata || { title: result.title },
        ...(result._metadataPath ? { metadataPath: result._metadataPath } : {}),
      };
      const res = await downloadService.add(payload);
      onDownloaded(res.data);
      toast.success(`"${result.metadata?.title || result.title}" added to downloads`);
      onClose();
    } catch (err) {
      const e = err as AxiosError<{ error: string }>;
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }

  const isAudio = result._searchType === 'audiobook';
  const TypeIcon = isAudio ? Headphones : BookOpen;
  const categories = Array.isArray(result.categories)
    ? result.categories.map(formatCategory).filter(Boolean)
    : [];

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-md shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-surface-border">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
              <TypeIcon className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-ink leading-tight line-clamp-2">
                {result.title}
              </h2>
              <p className="text-xs text-ink-muted mt-0.5">{result.indexer}</p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost w-7 h-7 p-0 rounded-lg flex-shrink-0 ml-3">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-px bg-surface-border mx-5 mt-5 rounded-xl overflow-hidden">
          {[
            { label: t('download_detail_size_label'), value: formatBytes(result.size) },
            { label: 'Seeders', value: result.seeders, cls: 'text-emerald-400 font-semibold' },
            { label: 'Leechers', value: result.leechers || 0, cls: 'text-red-400' },
            { label: t('download_detail_published'), value: formatDate(result.publishDate) || '—' },
          ].map(
            ({ label, value, cls }: { label: string; value: string | number; cls?: string }) => (
              <div key={label} className="bg-surface-card px-4 py-3">
                <div className="text-[11px] text-ink-muted mb-0.5">{label}</div>
                <div className={`text-sm font-medium ${cls || 'text-ink'}`}>{value}</div>
              </div>
            ),
          )}
        </div>

        {categories.length > 0 && (
          <div className="mx-5 mt-3 flex flex-wrap gap-1">
            {categories.slice(0, 5).map((cat: string, i: number) => (
              <span key={i} className="badge bg-surface-elevated text-ink-muted text-[10px]">
                {cat}
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="p-5 pt-4 space-y-3">
          {clients.length === 0 && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5 text-sm text-amber-400">
              {t('download_no_client')}
            </div>
          )}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5 text-sm text-red-400">
              {error}
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary flex-1">
              {t('download_cancel')}
            </button>
            <button
              onClick={handleDownload}
              disabled={loading || clients.length === 0}
              className="btn-primary flex-1"
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>{' '}
                  {t('download_adding')}
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" /> {t('download_download')}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BookCard({
  result,
  searchType,
}: {
  result: SearchResult;
  searchType: ContentType;
}) {
  const t = useT();
  const [showModal, setShowModal] = useState(false);
  const { addDownload } = useStore();

  const title = result.title;
  const publishDate = formatDate(result.publishDate);
  const tracker = result.indexer || '';
  const categories = Array.isArray(result.categories)
    ? result.categories.map(formatCategory).filter(Boolean)
    : [];
  const isAudio = searchType === 'audiobook';
  const TypeIcon = isAudio ? Headphones : BookOpen;

  return (
    <>
      <div
        className="group flex gap-3 px-4 py-3 bg-surface-card border border-surface-border rounded-xl
                   hover:border-surface-strong hover:bg-surface-elevated transition-all duration-150 cursor-pointer"
        onClick={() => setShowModal(true)}
      >
        {/* Type icon */}
        <div
          className="w-8 h-8 rounded-lg bg-surface-elevated flex items-center justify-center flex-shrink-0 mt-0.5
                        group-hover:bg-indigo-500/15 transition-colors"
        >
          <TypeIcon className="w-3.5 h-3.5 text-ink-muted group-hover:text-indigo-400 transition-colors" />
        </div>

        {/* All content */}
        <div className="flex-1 min-w-0">
          {/* Title — wraps on spaces, breaks long tokens (filenames with dots) */}
          <p className="text-sm font-medium text-ink leading-snug break-all">{title}</p>

          {/* Row 2: indexer · date · size · seeders · categories */}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {tracker && <span className="text-[11px] text-ink-muted">{tracker}</span>}
            {publishDate && (
              <>
                <span className="text-surface-strong text-[10px]">·</span>
                <span className="text-[11px] text-ink-muted flex items-center gap-0.5">
                  <Calendar className="w-2.5 h-2.5" />
                  {publishDate}
                </span>
              </>
            )}
            <span className="text-surface-strong text-[10px]">·</span>
            <span className="text-[11px] text-ink-muted tabular-nums">
              {formatBytes(result.size)}
            </span>
            <span className="text-surface-strong text-[10px]">·</span>
            <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-0.5">
              <Zap className="w-2.5 h-2.5 text-emerald-500" />
              {result.seeders}
              {result.leechers > 0 && (
                <span className="text-ink-faint font-normal">/{result.leechers}</span>
              )}
            </span>
            {categories.slice(0, 2).map((cat: string, i: number) => (
              <span
                key={i}
                className="badge bg-surface-elevated text-ink-faint text-[10px] px-1.5 py-0"
              >
                {cat}
              </span>
            ))}
          </div>
        </div>

        {/* Download button */}
        <Tooltip text={t('download_download')}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowModal(true);
            }}
            className="btn-primary text-xs py-1.5 px-3 opacity-0 group-hover:opacity-100 transition-opacity self-center flex-shrink-0"
          >
            <Download className="w-3 h-3" />
          </button>
        </Tooltip>
      </div>

      {showModal && (
        <DownloadModal
          result={{ ...result, _searchType: searchType }}
          onClose={() => setShowModal(false)}
          onDownloaded={(dl: DownloadEntry) => addDownload(dl)}
        />
      )}
    </>
  );
}
