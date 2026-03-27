'use client';
import React, { useState, useEffect } from 'react';
import {
  X,
  Folder,
  FolderOpen,
  ChevronRight,
  HardDrive,
  ArrowLeft,
  Check,
  Image,
} from 'lucide-react';
import { settingsService } from '../api/settingsService';
import { AxiosError } from 'axios';
import { useT } from '@/i18n';

interface DirEntry {
  name: string;
  path: string;
}

interface FileBrowserModalProps {
  onSelect: (path: string) => void;
  onClose: () => void;
  mode?: 'dir' | 'file'; // 'file' = pick an image file instead of a directory
  title?: string;
  initialPath?: string; // starting directory
}

export default function FileBrowserModal({
  onSelect,
  onClose,
  mode = 'dir',
  title,
  initialPath,
}: FileBrowserModalProps) {
  const t = useT();
  const [current, setCurrent] = useState<string | null>(null);
  const [dirs, setDirs] = useState<DirEntry[]>([]);
  const [files, setFiles] = useState<DirEntry[]>([]);
  const [roots, setRoots] = useState<string[]>([]);
  const [parent, setParent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  async function browse(path: string | null) {
    setLoading(true);
    setError('');
    setSelectedFile(null);
    try {
      const params: Record<string, string> = {};
      if (path) params.path = path;
      if (mode === 'file') params.files = 'true';
      const res = await settingsService.browse(params);
      setCurrent(res.data.path);
      setDirs(res.data.dirs);
      setFiles(res.data.files ?? []);
      setRoots(res.data.roots);
      setParent(res.data.parent);
    } catch (err) {
      const e = err as AxiosError<{ error: string }>;
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    browse(initialPath ?? null);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm p-0 md:p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface-card border border-surface-border rounded-t-2xl md:rounded-2xl w-full md:max-w-lg shadow-modal flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {parent && (
              <button
                onClick={() => browse(parent)}
                className="text-ink-dim hover:text-ink flex-shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-ink">{title ?? t('filebrowser_title')}</h3>
              <p className="text-[11px] text-ink-muted truncate mt-0.5">{current || '…'}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-ink-dim hover:text-ink flex-shrink-0 ml-2">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Roots (drives or /) */}
        {roots.length > 1 && (
          <div className="flex gap-1.5 px-4 py-2 border-b border-surface-border overflow-x-auto flex-shrink-0">
            {roots.map((r) => (
              <button
                key={r}
                onClick={() => browse(r)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
                  current?.startsWith(r)
                    ? 'bg-indigo-500/15 text-indigo-300'
                    : 'bg-surface-elevated text-ink-dim hover:text-ink'
                }`}
              >
                <HardDrive className="w-3.5 h-3.5" />
                {r}
              </button>
            ))}
          </div>
        )}

        {/* Directory + file list */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex flex-col gap-2 p-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 bg-surface-elevated rounded-lg animate-pulse" />
              ))}
            </div>
          )}

          {error && (
            <div className="m-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
              {error}
            </div>
          )}

          {!loading && dirs.length === 0 && files.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-10 text-center px-4">
              <Folder className="w-8 h-8 text-ink-faint mb-2" />
              <p className="text-sm text-ink-muted">{t('filebrowser_empty')}</p>
            </div>
          )}

          {!loading &&
            dirs.map((dir) => (
              <button
                key={dir.path}
                onClick={() => browse(dir.path)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-elevated transition-colors border-b border-surface-border/40 last:border-0 text-left"
              >
                <FolderOpen className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                <span className="flex-1 text-sm text-ink truncate">{dir.name}</span>
                <ChevronRight className="w-4 h-4 text-ink-faint flex-shrink-0" />
              </button>
            ))}

          {mode === 'file' && !loading && files.length > 0 && (
            <>
              {dirs.length > 0 && <div className="h-px bg-surface-border mx-4" />}
              {files.map((f) => (
                <button
                  key={f.path}
                  onClick={() => setSelectedFile(f.path)}
                  className={`w-full flex items-center gap-3 px-4 py-3 transition-colors border-b border-surface-border/40 last:border-0 text-left ${
                    selectedFile === f.path ? 'bg-indigo-500/15' : 'hover:bg-surface-elevated'
                  }`}
                >
                  <Image className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <span
                    className="flex-1 text-sm truncate"
                    style={{ color: selectedFile === f.path ? '#818cf8' : undefined }}
                  >
                    {f.name}
                  </span>
                  {selectedFile === f.path && (
                    <Check className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                  )}
                </button>
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-4 border-t border-surface-border flex-shrink-0">
          <button onClick={onClose} className="btn-secondary flex-1">
            {t('filebrowser_cancel')}
          </button>
          <button
            onClick={() => {
              const target = mode === 'file' ? selectedFile : current;
              if (target) onSelect(target);
            }}
            disabled={mode === 'file' ? !selectedFile : !current}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            {t('filebrowser_select')}
          </button>
        </div>
      </div>
    </div>
  );
}
