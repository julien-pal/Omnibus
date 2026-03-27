'use client';
import React, { useState, useEffect } from 'react';
import { ClientConfig } from '../../types';
import { AxiosError } from 'axios';
import { Plus, Trash2, Check, X, Eye, EyeOff } from 'lucide-react';
import { settingsService } from '@/api/settingsService';
import useStore from '../../store/useStore';
import { useT } from '@/i18n';
import { toast } from '@/store/useToastStore';

const CLIENT_TYPES = ['qbittorrent', 'deluge', 'transmission', 'rtorrent', 'aria2'];

const EMPTY_CLIENT = {
  name: '',
  type: 'qbittorrent',
  url: '',
  username: '',
  password: '',
  destinations: { ebook: '', audiobook: '' },
  tags: { ebook: 'omnibus-book', audiobook: 'omnibus-audio' },
  pathMap: { from: '', to: '' },
};

function ClientForm({
  client,
  onSave,
  onCancel,
  isNew = false,
}: {
  client: Partial<ClientConfig>;
  onSave: (form: Partial<ClientConfig>) => Promise<void>;
  onCancel: () => void;
  isNew?: boolean;
}) {
  const t = useT();
  const [form, setForm] = useState({ ...EMPTY_CLIENT, ...client });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  function set(field: string, value: unknown) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function setNested(parent: string, field: string, value: unknown) {
    setForm((prev) => ({
      ...prev,
      [parent]: {
        ...(prev[parent as keyof typeof prev] as Record<string, unknown>),
        [field]: value,
      },
    }));
  }

  async function handleTest() {
    if (!form.id) return;
    setTesting(true);
    try {
      const res = await settingsService.testClient(form.id!);
      setTestResult(res.data);
    } catch (err) {
      const e = err as AxiosError<{ error: string }>;
      setTestResult({ ok: false, error: e.response?.data?.error || e.message });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-surface-card border border-surface-border rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
            {t('clients_name_label')}
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder={t('clients_name_placeholder')}
            className="input text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
            {t('clients_type_label')}
          </label>
          <select
            value={form.type}
            onChange={(e) => set('type', e.target.value)}
            className="input text-sm"
          >
            {CLIENT_TYPES.map((tp) => (
              <option key={tp} value={tp}>
                {tp}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
          {t('clients_url_label')}
        </label>
        <input
          type="url"
          value={form.url}
          onChange={(e) => set('url', e.target.value)}
          placeholder="http://localhost:8080"
          className="input text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
            {t('clients_username_label')}
          </label>
          <input
            type="text"
            value={form.username}
            onChange={(e) => set('username', e.target.value)}
            placeholder="admin"
            className="input text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
            {t('clients_password_label')}
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              className="input text-sm pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink-dim"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
            {t('clients_ebook_folder_label')}
          </label>
          <input
            type="text"
            value={form.destinations?.ebook || ''}
            onChange={(e) => setNested('destinations', 'ebook', e.target.value)}
            placeholder="/downloads/ebooks"
            className="input text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
            {t('clients_audiobook_folder_label')}
          </label>
          <input
            type="text"
            value={form.destinations?.audiobook || ''}
            onChange={(e) => setNested('destinations', 'audiobook', e.target.value)}
            placeholder="/downloads/audiobooks"
            className="input text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
            {t('clients_ebook_tag_label')}
          </label>
          <input
            type="text"
            value={form.tags?.ebook || ''}
            onChange={(e) => setNested('tags', 'ebook', e.target.value)}
            placeholder="omnibus-book"
            className="input text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
            {t('clients_audiobook_tag_label')}
          </label>
          <input
            type="text"
            value={form.tags?.audiobook || ''}
            onChange={(e) => setNested('tags', 'audiobook', e.target.value)}
            placeholder="omnibus-audio"
            className="input text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
          {t('clients_pathmap_label')}{' '}
          <span className="normal-case text-ink-faint">({t('clients_pathmap_hint')})</span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <input
            type="text"
            value={form.pathMap?.from || ''}
            onChange={(e) => setNested('pathMap', 'from', e.target.value)}
            placeholder="/downloads"
            className="input text-sm font-mono"
          />
          <input
            type="text"
            value={form.pathMap?.to || ''}
            onChange={(e) => setNested('pathMap', 'to', e.target.value)}
            placeholder="/mnt/DiskStation/downloads"
            className="input text-sm font-mono"
          />
        </div>
        <p className="text-[11px] text-ink-faint mt-1">{t('clients_pathmap_desc')}</p>
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
          {testResult.ok ? t('clients_connected') : testResult.error}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
          {saving ? t('clients_saving') : isNew ? t('clients_save_new') : t('clients_save')}
        </button>
        {!isNew && (
          <button onClick={handleTest} disabled={testing} className="btn-secondary text-sm">
            {testing ? t('clients_testing') : t('clients_test')}
          </button>
        )}
        <button onClick={onCancel} className="btn-secondary text-sm ml-auto">
          {t('clients_cancel')}
        </button>
      </div>
    </div>
  );
}

export default function ClientSettings() {
  const t = useT();
  const [clientsConfig, setClientsConfig] = useState<{ active: string; clients: ClientConfig[] }>({
    active: '',
    clients: [],
  });
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const storeSetClients = useStore((state) => state.setClientsConfig);

  async function load() {
    const res = await settingsService.getClients();
    setClientsConfig(res.data);
    storeSetClients(res.data);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(form: Partial<ClientConfig>) {
    await settingsService.addClient(form as Omit<ClientConfig, 'id'>);
    toast.success(t('clients_saved'));
    setShowAdd(false);
    load();
  }

  async function handleUpdate(form: Partial<ClientConfig>) {
    await settingsService.updateClient((form as ClientConfig).id, form);
    toast.success(t('clients_saved'));
    setEditing(null);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm(t('clients_delete_confirm'))) return;
    await settingsService.deleteClient(id);
    load();
  }

  async function handleSetActive(id: string) {
    await settingsService.setActiveClient(id);
    load();
  }

  const clients = clientsConfig.clients || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-ink">{t('clients_title')}</h2>
          <p className="text-sm text-ink-muted mt-0.5">{t('clients_desc')}</p>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="btn-primary text-sm flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          {t('clients_add')}
        </button>
      </div>

      {showAdd && (
        <ClientForm
          client={EMPTY_CLIENT}
          isNew
          onSave={handleAdd}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {clients.length === 0 && !showAdd && (
        <p className="text-sm text-ink-faint">{t('clients_none')}</p>
      )}

      <div className="space-y-3">
        {clients.map((client) => (
          <div key={client.id}>
            {editing === client.id ? (
              <ClientForm client={client} onSave={handleUpdate} onCancel={() => setEditing(null)} />
            ) : (
              <div className="bg-surface-card border border-surface-border rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-ink">
                      {client.name || client.type}
                    </span>
                    <span className="text-[11px] px-1.5 py-0.5 rounded-full border bg-surface-elevated text-ink-muted border-surface-border">
                      {client.type}
                    </span>
                    {clientsConfig.active === client.id && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-400 border-emerald-500/25">
                        {t('clients_active_badge')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-ink-faint mt-0.5 truncate">{client.url}</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {clientsConfig.active !== client.id && (
                    <button
                      onClick={() => handleSetActive(client.id)}
                      className="btn-secondary text-xs py-1"
                    >
                      {t('clients_set_active')}
                    </button>
                  )}
                  <button
                    onClick={() => setEditing(client.id ?? null)}
                    className="btn-secondary text-xs py-1"
                  >
                    {t('clients_edit')}
                  </button>
                  <button
                    onClick={() => handleDelete(client.id)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-red-400 bg-red-500/10 border border-red-500/25 hover:bg-red-500/20 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
