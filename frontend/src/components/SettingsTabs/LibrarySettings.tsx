'use client';
import React, { useState, useEffect } from 'react';
import { Library, ContentType } from '../../types';
import { AxiosError } from 'axios';
import { Plus, Trash2, FolderOpen, RefreshCw, Pencil, Check, X } from 'lucide-react';
import { settingsService, libraryService } from '@/api';
import FileBrowserModal from '../FileBrowserModal';
import { useT } from '@/i18n';
import Tooltip from '@/components/Tooltip';
import { toast } from '@/store/useToastStore';

type LibraryWithType = Library & { type: ContentType };

interface EditState {
  id: string;
  name: string;
  path: string;
  type: ContentType;
}

const TYPE_BADGE: Record<string, string> = {
  audiobook: 'bg-violet-500/10 text-violet-400 border-violet-500/25',
  mixed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
  ebook: 'bg-sky-500/10 text-sky-400 border-sky-500/25',
};

export default function LibrarySettings() {
  const t = useT();

  const TYPE_LABEL: Record<string, string> = {
    audiobook: t('libsettings_type_label_audiobook'),
    mixed: t('libsettings_type_label_mixed'),
    ebook: t('libsettings_type_label_ebook'),
  };

  const [libraries, setLibraries] = useState<{
    ebook: Library[];
    audiobook: Library[];
    mixed?: Library[];
  }>({ ebook: [], audiobook: [] });
  const [showAdd, setShowAdd] = useState(false);
  const [newPath, setNewPath] = useState('');
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<ContentType>('ebook');
  const [adding, setAdding] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const [browserTarget, setBrowserTarget] = useState<'new' | string>('new');
  const [scanning, setScanning] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await settingsService.getLibraries();
    setLibraries(res.data);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd() {
    if (!newPath) return;
    setAdding(true);
    try {
      await settingsService.addLibrary({ name: newName || newPath, path: newPath, type: newType });
      setNewPath('');
      setNewName('');
      setShowAdd(false);
      load();
    } catch (err) {
      toast.error(
        (err as AxiosError<{ error: string }>).response?.data?.error || (err as Error).message,
      );
    } finally {
      setAdding(false);
    }
  }

  function handleBrowseSelect(selectedPath: string) {
    if (browserTarget === 'new') {
      setNewPath(selectedPath);
      if (!newName.trim()) {
        const parts = selectedPath.split(/[/\\]+/).filter(Boolean);
        setNewName(parts.slice(-1)[0] || selectedPath);
      }
    } else if (edit && edit.id === browserTarget) {
      setEdit((prev) => (prev ? { ...prev, path: selectedPath } : prev));
    }
    setShowBrowser(false);
  }

  async function handleDelete(id: string) {
    if (!confirm(t('libsettings_delete_confirm'))) return;
    await settingsService.deleteLibrary(id);
    load();
  }

  function startEdit(lib: LibraryWithType) {
    setEdit({ id: lib.id, name: lib.name, path: lib.path, type: lib.type });
  }

  async function handleSaveEdit() {
    if (!edit) return;
    setSaving(true);
    try {
      await settingsService.updateLibrary(edit.id, {
        name: edit.name,
        path: edit.path,
        type: edit.type,
      });
      setEdit(null);
      load();
    } catch (err) {
      toast.error(
        (err as AxiosError<{ error: string }>).response?.data?.error || (err as Error).message,
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleScan(id: string) {
    setScanning(id);
    try {
      const res = await libraryService.scan(id);
      const count =
        res.data.tree?.reduce((s: number, a: { books: unknown[] }) => s + a.books.length, 0) || 0;
      const authors = res.data.tree?.length || 0;
      const s = count !== 1 ? 's' : '';
      const sp = authors !== 1 ? 's' : '';
      toast.success(
        t('libsettings_scan_done')
          .replace('{count}', String(count))
          .replace('{s}', s)
          .replace('{authors}', String(authors))
          .replace('{sp}', sp),
      );
    } catch (err) {
      toast.error(
        t('libsettings_scan_error').replace(
          '{error}',
          (err as AxiosError<{ error: string }>).response?.data?.error || (err as Error).message,
        ),
      );
    } finally {
      setScanning(null);
    }
  }

  const allLibraries: LibraryWithType[] = [
    ...(libraries.ebook || []).map((l: Library) => ({ ...l, type: 'ebook' as ContentType })),
    ...(libraries.audiobook || []).map((l: Library) => ({
      ...l,
      type: 'audiobook' as ContentType,
    })),
    ...(libraries.mixed || []).map((l: Library) => ({ ...l, type: 'mixed' as ContentType })),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-ink">{t('libsettings_title')}</h2>
          <p className="text-sm text-ink-muted mt-0.5">{t('libsettings_desc')}</p>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="btn-primary text-sm flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          {t('libsettings_add')}
        </button>
      </div>

      {showAdd && (
        <div className="bg-surface-card border border-surface-border rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
                {t('libsettings_name_label')}
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('libsettings_name_placeholder')}
                className="input text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
                {t('libsettings_type_label')}
              </label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as ContentType)}
                className="input text-sm"
              >
                <option value="ebook">{t('libsettings_type_label_ebook')}</option>
                <option value="audiobook">{t('libsettings_type_label_audiobook')}</option>
                <option value="mixed">{t('libsettings_type_mixed')}</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
              {t('libsettings_path_label')}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                placeholder="/mnt/books/ebooks"
                className="input text-sm flex-1"
              />
              <button
                type="button"
                onClick={() => {
                  setBrowserTarget('new');
                  setShowBrowser(true);
                }}
                className="btn-secondary text-sm flex items-center gap-2 whitespace-nowrap"
              >
                <FolderOpen className="w-4 h-4" />
                {t('libsettings_browse')}
              </button>
            </div>
            <p className="text-xs text-ink-faint mt-1">{t('libsettings_path_hint')}</p>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAdd(false)} className="btn-secondary text-sm">
              {t('libsettings_cancel')}
            </button>
            <button
              onClick={handleAdd}
              disabled={adding || !newPath}
              className="btn-primary text-sm"
            >
              {adding ? t('libsettings_adding') : t('libsettings_add')}
            </button>
          </div>
        </div>
      )}

      {allLibraries.length === 0 && !showAdd && (
        <p className="text-sm text-ink-faint">{t('libsettings_none')}</p>
      )}

      <div className="space-y-2">
        {allLibraries.map((lib) => {
          const isEditing = edit?.id === lib.id;
          return (
            <div
              key={lib.id}
              className="bg-surface-card border border-surface-border rounded-xl px-4 py-3"
            >
              {isEditing && edit ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
                        {t('libsettings_name_label')
                          .replace(' (optionnel)', '')
                          .replace(' (optional)', '')}
                      </label>
                      <input
                        type="text"
                        value={edit.name}
                        onChange={(e) =>
                          setEdit((prev) => (prev ? { ...prev, name: e.target.value } : prev))
                        }
                        className="input text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
                        {t('libsettings_type_label')}
                      </label>
                      <select
                        value={edit.type}
                        onChange={(e) =>
                          setEdit((prev) =>
                            prev ? { ...prev, type: e.target.value as ContentType } : prev,
                          )
                        }
                        className="input text-sm"
                      >
                        <option value="ebook">{t('libsettings_type_label_ebook')}</option>
                        <option value="audiobook">{t('libsettings_type_label_audiobook')}</option>
                        <option value="mixed">{t('libsettings_type_mixed')}</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
                      {t('libsettings_path_label')}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={edit.path}
                        onChange={(e) =>
                          setEdit((prev) => (prev ? { ...prev, path: e.target.value } : prev))
                        }
                        className="input text-sm flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setBrowserTarget(lib.id);
                          setShowBrowser(true);
                        }}
                        className="btn-secondary text-sm flex items-center gap-2 whitespace-nowrap"
                      >
                        <FolderOpen className="w-4 h-4" />
                        {t('libsettings_browse')}
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveEdit}
                      disabled={saving}
                      className="btn-primary text-sm flex items-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      {saving ? t('libsettings_saving') : t('libsettings_save')}
                    </button>
                    <button
                      onClick={() => setEdit(null)}
                      className="btn-secondary text-sm flex items-center gap-1.5"
                    >
                      <X className="w-3.5 h-3.5" />
                      {t('libsettings_cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <FolderOpen className="w-4 h-4 text-ink-faint flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-ink">{lib.name}</span>
                      <span
                        className={`text-[11px] px-1.5 py-0.5 rounded-full border ${TYPE_BADGE[lib.type] || TYPE_BADGE.ebook}`}
                      >
                        {TYPE_LABEL[lib.type] || lib.type}
                      </span>
                    </div>
                    <p className="text-xs text-ink-faint mt-0.5 truncate">{lib.path}</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleScan(lib.id)}
                      disabled={scanning === lib.id}
                      className="btn-secondary text-xs py-1 flex items-center gap-1"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${scanning === lib.id ? 'animate-spin' : ''}`}
                      />
                      {t('libsettings_scan')}
                    </button>
                    <Tooltip text={t('libsettings_edit_title')}>
                      <button
                        onClick={() => startEdit(lib)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-ink-muted bg-surface-elevated border border-surface-border hover:text-ink hover:bg-surface-strong transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </Tooltip>
                    <Tooltip text={t('download_delete')}>
                      <button
                        onClick={() => handleDelete(lib.id)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-red-400 bg-red-500/10 border border-red-500/25 hover:bg-red-500/20 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </Tooltip>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showBrowser && (
        <FileBrowserModal onSelect={handleBrowseSelect} onClose={() => setShowBrowser(false)} />
      )}
    </div>
  );
}
