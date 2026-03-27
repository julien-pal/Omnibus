'use client';
import React, { useState, useEffect } from 'react';
import { IndexerConfig, IndexerCategory } from '../../types';
import { AxiosError } from 'axios';
import { Check, X, RefreshCw, Tag, Eye, EyeOff } from 'lucide-react';
import { settingsService } from '@/api/settingsService';
import CategoryPickerModal from '../CategoryPickerModal';
import { useT } from '@/i18n';
import { toast } from '@/store/useToastStore';

export default function ProwlarrSettings() {
  const t = useT();
  const [url, setUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    error?: string;
    version?: string;
  } | null>(null);
  const [indexers, setIndexers] = useState<IndexerConfig[]>([]);
  const [loadingIndexers, setLoadingIndexers] = useState(false);
  const [indexerCategories, setIndexerCategories] = useState<
    Record<number, { book: number[]; audiobook: number[] }>
  >({});
  const [availableCategories, setAvailableCategories] = useState<Record<number, IndexerCategory[]>>(
    {},
  );
  const [modal, setModal] = useState<{
    indexerId: number;
    indexerName: string;
    field: 'book' | 'audiobook';
  } | null>(null);

  useEffect(() => {
    settingsService
      .getProwlarr()
      .then((res) => {
        setUrl(res.data.url || '');
        setApiKey(res.data.apiKey || '');
        const cats: Record<number, { book: number[]; audiobook: number[] }> = {};
        for (const idx of (res.data.indexers || []) as IndexerConfig[]) {
          cats[idx.id] = idx.categories || { book: [], audiobook: [] };
        }
        setIndexerCategories(cats);
        setIndexers(res.data.indexers || []);
        const avail: Record<number, IndexerCategory[]> = {};
        for (const idx of (res.data.indexers || []) as IndexerConfig[]) {
          if (idx.available) avail[idx.id] = idx.available;
        }
        setAvailableCategories(avail);
      })
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await settingsService.updateProwlarr({ url, apiKey });
      toast.success(t('prowlarr_saved'));
    } catch (err) {
      toast.error(
        (err as AxiosError<{ error: string }>).response?.data?.error || (err as Error).message,
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await settingsService.testProwlarr({ url, apiKey });
      setTestResult(res.data);
    } catch (err) {
      setTestResult({
        ok: false,
        error:
          (err as AxiosError<{ error: string }>).response?.data?.error || (err as Error).message,
      });
    } finally {
      setTesting(false);
    }
  }

  async function fetchIndexers() {
    setLoadingIndexers(true);
    try {
      const res = await settingsService.getIndexers();
      const fetched = res.data.indexers;
      const avail: Record<number, IndexerCategory[]> = {};
      for (const idx of fetched) {
        avail[idx.id] = idx.available || [];
      }
      setAvailableCategories(avail);
      const merged = fetched.map((i: IndexerConfig) => ({
        id: i.id,
        name: i.name,
        available: i.available || [],
        categories: indexerCategories[i.id] || { book: [], audiobook: [] },
      }));
      setIndexers(merged);
      const cats: Record<number, { book: number[]; audiobook: number[] }> = {};
      for (const idx of merged as IndexerConfig[]) {
        cats[idx.id] = idx.categories;
      }
      setIndexerCategories(cats);
      await settingsService.updateIndexers(merged);
    } catch (err) {
      toast.error(
        t('prowlarr_fetch_error').replace(
          '{error}',
          (err as AxiosError<{ error: string }>).response?.data?.error || (err as Error).message,
        ),
      );
    } finally {
      setLoadingIndexers(false);
    }
  }

  function openModal(indexerId: number, indexerName: string, field: 'book' | 'audiobook') {
    setModal({ indexerId, indexerName, field });
  }

  function handleModalConfirm(ids: number[]) {
    if (!modal) return;
    const { indexerId, field } = modal;
    setIndexerCategories((prev) => ({
      ...prev,
      [indexerId]: { ...(prev[indexerId] || {}), [field]: ids },
    }));
    setModal(null);
  }

  async function saveIndexerCategories() {
    const updated = indexers.map((idx) => ({
      ...idx,
      categories: indexerCategories[idx.id] || { book: [], audiobook: [] },
    }));
    await settingsService.updateIndexers(updated);
    toast.success(t('prowlarr_cats_saved'));
  }

  const modalIndexer = modal ? indexers.find((i) => i.id === modal?.indexerId) : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-ink">{t('prowlarr_connection_title')}</h2>
        <p className="text-sm text-ink-muted mt-1">{t('prowlarr_connection_desc')}</p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
            {t('prowlarr_url_label')}
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:9696"
            className="input"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
            {t('prowlarr_apikey_label')}
          </label>
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="••••••••••••••••"
              className="input pr-10"
            />
            <button
              type="button"
              onClick={() => setShowApiKey((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink-dim"
            >
              {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? t('prowlarr_saving') : t('prowlarr_save')}
          </button>
          <button
            onClick={handleTest}
            disabled={testing}
            className="btn-secondary flex items-center gap-2"
          >
            {testing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" /> {t('prowlarr_testing')}
              </>
            ) : (
              t('prowlarr_test')
            )}
          </button>
        </div>

        {testResult && (
          <div
            className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg border ${
              testResult.ok
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                : 'text-red-400 bg-red-500/10 border-red-500/20'
            }`}
          >
            {testResult.ok ? (
              <Check className="w-4 h-4 flex-shrink-0" />
            ) : (
              <X className="w-4 h-4 flex-shrink-0" />
            )}
            {testResult.ok
              ? t('prowlarr_connected').replace('{version}', testResult.version || '')
              : testResult.error}
          </div>
        )}
      </div>

      {/* Indexers */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-ink">{t('prowlarr_indexers_title')}</h2>
          <button
            onClick={fetchIndexers}
            disabled={loadingIndexers}
            className="btn-secondary text-sm flex items-center gap-2"
          >
            {loadingIndexers ? (
              <>
                <RefreshCw className="w-3 h-3 animate-spin" /> {t('prowlarr_fetching')}
              </>
            ) : (
              t('prowlarr_fetch_indexers')
            )}
          </button>
        </div>

        {indexers.length === 0 && (
          <p className="text-sm text-ink-faint">{t('prowlarr_no_indexers')}</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {indexers.map((idx) => {
            const cats = indexerCategories[idx.id] || { book: [], audiobook: [] };
            const avail = availableCategories[idx.id] || [];
            return (
              <div
                key={idx.id}
                className="bg-surface-card border border-surface-border rounded-xl p-3"
              >
                <div className="font-medium text-sm text-ink mb-3">{idx.name}</div>
                <div className="flex flex-col gap-2 text-xs">
                  <CategoryButton
                    label={t('prowlarr_book_categories')}
                    selected={cats.book || []}
                    available={avail}
                    onClick={() => openModal(idx.id, idx.name, 'book')}
                    t={t}
                  />
                  <CategoryButton
                    label={t('prowlarr_audiobook_categories')}
                    selected={cats.audiobook || []}
                    available={avail}
                    onClick={() => openModal(idx.id, idx.name, 'audiobook')}
                    t={t}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {indexers.length > 0 && (
          <button onClick={saveIndexerCategories} className="btn-primary mt-3 text-sm">
            {t('prowlarr_save_categories')}
          </button>
        )}
      </div>

      {/* Modal */}
      {modal && modalIndexer && (
        <CategoryPickerModal
          indexerName={`${modalIndexer.name} — ${modal.field === 'book' ? t('prowlarr_books_label') : 'Audiobooks'}`}
          available={availableCategories[modal.indexerId] || []}
          selected={indexerCategories[modal.indexerId]?.[modal.field] || []}
          onConfirm={handleModalConfirm}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function CategoryButton({
  label,
  selected,
  available,
  onClick,
  t,
}: {
  label: string;
  selected: number[];
  available: import('../../types').IndexerCategory[];
  onClick: () => void;
  t: (key: import('../../i18n').TranslationKey) => string;
}) {
  const names = selected
    .map(
      (id: number) =>
        available.find((c: import('../../types').IndexerCategory) => c.id === id)?.name ||
        String(id),
    )
    .slice(0, 3);
  const extra = selected.length > 3 ? selected.length - 3 : 0;

  return (
    <div>
      <label className="block text-ink-muted mb-1.5">{label}</label>
      <button
        onClick={onClick}
        className="w-full text-left px-3 py-2 rounded-lg bg-surface-elevated hover:bg-surface-strong border border-surface-border hover:border-surface-strong transition-colors min-h-[2.25rem] flex items-center gap-1.5 flex-wrap"
      >
        {selected.length === 0 ? (
          <span className="text-ink-faint flex items-center gap-1.5">
            <Tag className="w-3 h-3" /> {t('prowlarr_choose')}
          </span>
        ) : (
          <>
            {names.map((name: string, i: number) => (
              <span
                key={i}
                className="text-[11px] px-1.5 py-0.5 rounded-full border bg-indigo-500/15 text-indigo-300 border-indigo-500/25"
              >
                {name}
              </span>
            ))}
            {extra > 0 && (
              <span className="text-ink-faint text-xs">
                {t('prowlarr_more').replace('{n}', String(extra))}
              </span>
            )}
          </>
        )}
      </button>
    </div>
  );
}
