'use client';
import React, { useState } from 'react';
import { X, Trash2, AlertCircle } from 'lucide-react';
import { useT } from '@/i18n';

export default function DeleteConfirmModal({
  title,
  subtitle,
  onConfirm,
  onClose,
}: {
  title: string;
  subtitle?: string;
  onConfirm: (deleteFiles: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const t = useT();
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleConfirm() {
    setLoading(true);
    setError('');
    try {
      await onConfirm(deleteFiles);
    } catch (e) {
      const err = e as import('axios').AxiosError<{ error: string }>;
      setError(err.response?.data?.error || err.message);
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[80] p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-sm shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-surface-border">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-red-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Trash2 className="w-4 h-4 text-red-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-ink">{t('book_delete')}</h2>
              <p className="text-xs text-ink-muted mt-0.5 line-clamp-2">{title}</p>
              {subtitle && <p className="text-xs text-ink-faint">{subtitle}</p>}
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost w-7 h-7 p-0 rounded-lg flex-shrink-0 ml-3">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Options */}
        <div className="p-5 space-y-2">
          <button
            type="button"
            onClick={() => setDeleteFiles(false)}
            className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-colors ${
              !deleteFiles
                ? 'border-indigo-500/50 bg-indigo-500/10'
                : 'border-surface-border hover:border-surface-strong'
            }`}
          >
            <span
              className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${!deleteFiles ? 'border-indigo-400' : 'border-surface-strong'}`}
            >
              {!deleteFiles && <span className="w-2 h-2 rounded-full bg-indigo-400" />}
            </span>
            <div>
              <p className="text-sm font-medium text-ink">{t('book_remove_only')}</p>
              <p className="text-xs text-ink-muted mt-0.5">{t('book_remove_desc')}</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setDeleteFiles(true)}
            className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-colors ${
              deleteFiles
                ? 'border-red-500/50 bg-red-500/10'
                : 'border-surface-border hover:border-surface-strong'
            }`}
          >
            <span
              className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${deleteFiles ? 'border-red-400' : 'border-surface-strong'}`}
            >
              {deleteFiles && <span className="w-2 h-2 rounded-full bg-red-400" />}
            </span>
            <div>
              <p className="text-sm font-medium text-ink">{t('book_delete_files')}</p>
              <p className="text-xs text-ink-muted mt-0.5">{t('book_delete_files_desc')}</p>
            </div>
          </button>
        </div>

        {error && (
          <div className="mx-5 mb-3 p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="px-5 pb-5 flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">
            {t('book_cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl text-sm font-medium px-4 py-2.5 transition-colors disabled:opacity-50 ${
              deleteFiles ? 'bg-red-600 hover:bg-red-700 text-white' : 'btn-primary'
            }`}
          >
            {loading ? (
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
              </svg>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                {deleteFiles ? t('book_delete_files') : t('book_remove_btn')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
