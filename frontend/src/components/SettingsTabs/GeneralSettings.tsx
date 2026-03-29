'use client';
import React, { useState, useEffect } from 'react';
import { AxiosError } from 'axios';
import { Eye, EyeOff } from 'lucide-react';
import { settingsService } from '@/api/settingsService';
import { useT } from '@/i18n';
import Tooltip from '@/components/Tooltip';
import { useLocaleStore } from '../../store/localeStore';
import type { Locale } from '../../i18n';
import { useSyncPrefStore, type SyncPref } from '../../store/useSyncPrefStore';
import useStore from '../../store/useStore';
import { toast } from '@/store/useToastStore';

const LOCALES: { value: Locale; flag: string }[] = [
  { value: 'fr', flag: '🇫🇷' },
  { value: 'en', flag: '🇬🇧' },
];

const SYNC_PREFS: SyncPref[] = ['ask', 'sync', 'ignore'];

export default function GeneralSettings() {
  const t = useT();
  const { locale, setLocale } = useLocaleStore();
  const { pref: syncPref, setPref: setSyncPref } = useSyncPrefStore();
  const { syncEnabled, setSyncEnabled } = useStore((s) => ({
    syncEnabled: s.syncEnabled,
    setSyncEnabled: s.setSyncEnabled,
  }));

  // Auth state
  const [enabled, setEnabled] = useState(false);
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showWhisperKey, setShowWhisperKey] = useState(false);
  const [authSaving, setAuthSaving] = useState(false);
  const [authMismatch, setAuthMismatch] = useState(false);
  const [passwordSet, setPasswordSet] = useState(false);

  // Rename state
  const [ebook, setEbook] = useState('{author}/{title}');
  const [audiobook, setAudiobook] = useState('{author}/{series}/{title}');
  const [renameSaving, setRenameSaving] = useState(false);

  // Whisper state
  const [whisperUrl, setWhisperUrl] = useState('');
  const [whisperKey, setWhisperKey] = useState('');
  const [whisperModel, setWhisperModel] = useState('');
  const [whisperConcurrency, setWhisperConcurrency] = useState<number | ''>(1);
  const [whisperSaving, setWhisperSaving] = useState(false);
  const [whisperTesting, setWhisperTesting] = useState(false);
  const [whisperModels, setWhisperModels] = useState<string[]>([]);
  const [whisperModelsLoading, setWhisperModelsLoading] = useState(false);
  const [addModelInput, setAddModelInput] = useState('');
  const [addModelOpen, setAddModelOpen] = useState(false);
  const [addModelLoading, setAddModelLoading] = useState(false);

  // Email / e-reader state
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpPassSet, setSmtpPassSet] = useState(false);
  const [senderEmail, setSenderEmail] = useState('');
  const [readerEmail, setReaderEmail] = useState('');
  const [showSmtpPass, setShowSmtpPass] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailTesting, setEmailTesting] = useState(false);

  const PREVIEW_META = {
    author: 'Brandon Sanderson',
    title: 'The Way of Kings',
    series: 'Stormlight Archive',
    year: '2010',
  };

  useEffect(() => {
    settingsService
      .getAuth()
      .then((res) => {
        setEnabled(res.data.enabled || false);
        setUsername(res.data.username || 'admin');
        setPasswordSet(res.data.passwordSet || false);
      })
      .catch(() => {});
    settingsService
      .getApp()
      .then((res) => {
        setEbook(res.data.renamePatterns?.ebook || '{author}/{title}');
        setAudiobook(res.data.renamePatterns?.audiobook || '{author}/{series}/{title}');
        if (typeof res.data.syncEnabled === 'boolean') setSyncEnabled(res.data.syncEnabled);
      })
      .catch(() => {});
    settingsService
      .getWhisper()
      .then((res) => {
        const url = res.data.baseUrl || '';
        const key = res.data.apiKey || '';
        setWhisperUrl(url);
        setWhisperKey(key);
        setWhisperModel(res.data.model || '');
        setWhisperConcurrency(res.data.concurrency ?? 1 as number);
        if (url) fetchWhisperModels(url, key);
      })
      .catch(() => {});
    settingsService.getEmailSettings().then((r) => {
      setSmtpHost(r.data.smtpHost || '');
      setSmtpPort(r.data.smtpPort || 587);
      setSmtpUser(r.data.smtpUser || '');
      setSmtpPassSet(r.data.smtpPassSet);
      setSenderEmail(r.data.senderEmail || '');
      setReaderEmail(r.data.readerEmail || '');
    }).catch(() => {});
  }, []);

  function applyPattern(pat: string) {
    return pat
      .replace('{author}', PREVIEW_META.author)
      .replace('{title}', PREVIEW_META.title)
      .replace('{series}', PREVIEW_META.series)
      .replace('{year}', PREVIEW_META.year);
  }

  async function handleSyncEnabledToggle() {
    const next = !syncEnabled;
    setSyncEnabled(next);
    try {
      await settingsService.updateApp({ syncEnabled: next });
    } catch (err) {
      const e = err as import('axios').AxiosError<{ error: string }>;
      toast.error(e.response?.data?.error || e.message);
      setSyncEnabled(!next); // revert
    }
  }

  async function handleAuthSave() {
    if (password && password !== confirm) {
      setAuthMismatch(true);
      return;
    }
    setAuthMismatch(false);
    setAuthSaving(true);
    try {
      const payload: { enabled: boolean; username: string; password?: string } = {
        enabled,
        username,
      };
      if (password) payload.password = password;
      await settingsService.updateAuth(payload);
      toast.success(t('auth_saved'));
      setPassword('');
      setConfirm('');
      if (password) setPasswordSet(true);
    } catch (err) {
      const e = err as AxiosError<{ error: string }>;
      toast.error(e.response?.data?.error || e.message);
    } finally {
      setAuthSaving(false);
    }
  }

  async function handleRenameSave() {
    setRenameSaving(true);
    try {
      await settingsService.updateApp({ renamePatterns: { ebook, audiobook } });
      toast.success(t('rename_saved'));
    } catch (err) {
      const e = err as AxiosError<{ error: string }>;
      toast.error(e.response?.data?.error || e.message);
    } finally {
      setRenameSaving(false);
    }
  }

  async function fetchWhisperModels(url: string, key: string) {
    if (!url) return;
    setWhisperModelsLoading(true);
    try {
      const res = await settingsService.getWhisperModels({ baseUrl: url, apiKey: key });
      setWhisperModels(res.data.models ?? []);
    } catch {
      setWhisperModels([]);
    } finally {
      setWhisperModelsLoading(false);
    }
  }

  async function handleAddModel() {
    if (!addModelInput.trim()) return;
    setAddModelLoading(true);
    try {
      await settingsService.addWhisperModel(addModelInput.trim());
      toast.success(t('whisper_model_added'));
      setAddModelInput('');
      setAddModelOpen(false);
      await fetchWhisperModels(whisperUrl, whisperKey);
    } catch (err) {
      const e = err as AxiosError<{ error: string }>;
      toast.error(e.response?.data?.error || (e as Error).message);
    } finally {
      setAddModelLoading(false);
    }
  }

  async function handleWhisperSave() {
    setWhisperSaving(true);
    try {
      await settingsService.updateWhisper({
        baseUrl: whisperUrl,
        apiKey: whisperKey,
        model: whisperModel,
        concurrency: whisperConcurrency === '' ? 1 : whisperConcurrency,
      });
      toast.success(t('whisper_saved'));
    } catch (err) {
      const e = err as AxiosError<{ error: string }>;
      toast.error(e.response?.data?.error || e.message);
    } finally {
      setWhisperSaving(false);
    }
  }

  async function handleEmailSave() {
    setEmailSaving(true);
    try {
      await settingsService.updateEmailSettings({
        smtpHost, smtpPort, smtpUser,
        ...(smtpPass ? { smtpPass } : {}),
        senderEmail, readerEmail,
      });
      if (smtpPass) setSmtpPassSet(true);
      setSmtpPass('');
      toast.success(t('email_saved'));
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e.response?.data?.error || (err as Error).message);
    } finally {
      setEmailSaving(false);
    }
  }

  async function handleEmailTest() {
    setEmailTesting(true);
    try {
      await settingsService.testEmailSettings();
      toast.success(t('email_test_ok'));
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e.response?.data?.error || (err as Error).message);
    } finally {
      setEmailTesting(false);
    }
  }

  async function handleWhisperTest() {
    setWhisperTesting(true);
    try {
      const res = await settingsService.testWhisperConnection({
        baseUrl: whisperUrl,
        apiKey: whisperKey,
        model: whisperModel,
      });
      if (res.data.ok) {
        toast.success(t('whisper_test_ok'));
      } else {
        toast.error(res.data.error || t('whisper_test_fail'));
      }
    } catch (err) {
      const e = err as AxiosError<{ error: string }>;
      toast.error(e.response?.data?.error || e.message);
    } finally {
      setWhisperTesting(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Language */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-ink">{t('general_language')}</h2>
          <p className="text-sm text-ink-muted mt-1">{t('general_language_desc')}</p>
        </div>
        <div className="flex gap-2">
          {LOCALES.map(({ value, flag }) => (
            <button
              key={value}
              onClick={() => setLocale(value)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                locale === value
                  ? 'border-indigo-500 text-indigo-300 bg-indigo-500/10'
                  : 'border-surface-border text-ink-dim hover:text-ink hover:border-surface-strong'
              }`}
            >
              <span>{flag}</span>
              {t(value === 'fr' ? 'lang_fr' : 'lang_en')}
            </button>
          ))}
        </div>
      </section>

      <div className="border-t border-surface-border" />

      {/* Authentication */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-ink">{t('auth_title')}</h2>
          <p className="text-sm text-ink-muted mt-1">{t('auth_desc')}</p>
        </div>

        <div className="flex items-center justify-between bg-surface-card border border-surface-border rounded-xl px-4 py-3.5">
          <div>
            <p className="text-sm font-medium text-ink">{t('auth_enable')}</p>
            <p className="text-xs text-ink-muted mt-0.5">{t('auth_enable_desc')}</p>
          </div>
          <button
            type="button"
            onClick={async () => {
              const next = !enabled;
              setEnabled(next);
              if (!next) {
                // Disabling — save immediately
                try {
                  await settingsService.updateAuth({ enabled: false });
                } catch {
                  setEnabled(true);
                }
              }
              // Enabling — wait for the user to fill the form and click save
            }}
            className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
              enabled ? 'bg-indigo-500' : 'bg-surface-elevated border border-surface-border'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {enabled && (
          <>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
                  {t('auth_username')}
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
                  {t('auth_password')}
                  {passwordSet && (
                    <span className="normal-case ml-1 text-ink-faint">
                      {t('auth_password_set')}
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={passwordSet ? '••••••••' : t('auth_password_placeholder')}
                    className="input pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink-dim"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {password && (
                <div>
                  <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
                    {t('auth_confirm')}
                  </label>
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="input"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button onClick={handleAuthSave} disabled={authSaving} className="btn-primary">
                {authSaving ? t('auth_saving') : t('auth_save')}
              </button>
            </div>
            {authMismatch && <p className="text-sm text-red-400">{t('auth_mismatch')}</p>}
            {!passwordSet && !password && (
              <div className="text-amber-400 text-sm bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
                {t('auth_warning')}
              </div>
            )}
          </>
        )}
      </section>

      <div className="border-t border-surface-border" />

      {/* Rename patterns */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-ink">{t('rename_title')}</h2>
          <p className="text-sm text-ink-muted">
            {t('rename_desc')}{' '}
            {['{author}', '{title}', '{series}', '{year}'].map((v) => (
              <code
                key={v}
                className="bg-surface-elevated border border-surface-border px-1.5 py-0.5 rounded text-xs text-ink-dim mr-1"
              >
                {v}
              </code>
            ))}
          </p>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
              {t('rename_ebook')}
            </label>
            <input
              type="text"
              value={ebook}
              onChange={(e) => setEbook(e.target.value)}
              className="input font-mono"
            />
            <p className="text-xs text-ink-faint mt-1">
              {t('rename_preview')}{' '}
              <span className="text-ink-muted">{applyPattern(ebook)}/book.epub</span>
            </p>
          </div>
          <div>
            <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
              {t('rename_audiobook')}
            </label>
            <input
              type="text"
              value={audiobook}
              onChange={(e) => setAudiobook(e.target.value)}
              className="input font-mono"
            />
            <p className="text-xs text-ink-faint mt-1">
              {t('rename_preview')}{' '}
              <span className="text-ink-muted">{applyPattern(audiobook)}/chapter01.mp3</span>
            </p>
          </div>
        </div>
        <div className="flex justify-end">
          <button onClick={handleRenameSave} disabled={renameSaving} className="btn-primary">
            {renameSaving ? t('rename_saving') : t('rename_save')}
          </button>
        </div>
      </section>

      <div className="border-t border-surface-border" />

      {/* Synchronization */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-ink">{t('sync_section_title')}</h2>
          <p className="text-sm text-ink-muted mt-1">{t('sync_section_desc')}</p>
        </div>

        {/* Master sync toggle */}
        <div className="flex items-center justify-between bg-surface-card border border-surface-border rounded-xl px-4 py-3.5">
          <div>
            <p className="text-sm font-medium text-ink">{t('sync_enable')}</p>
            <p className="text-xs text-ink-muted mt-0.5">{t('sync_enable_desc')}</p>
          </div>
          <button
            type="button"
            onClick={handleSyncEnabledToggle}
            className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
              syncEnabled ? 'bg-indigo-500' : 'bg-surface-elevated border border-surface-border'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                syncEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {syncEnabled && (
          <div className="space-y-2">
            {SYNC_PREFS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setSyncPref(option)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors text-left ${
                  syncPref === option
                    ? 'border-indigo-500 bg-indigo-500/10'
                    : 'border-surface-border hover:border-surface-strong'
                }`}
              >
                <span
                  className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                    syncPref === option ? 'border-indigo-500' : 'border-surface-strong'
                  }`}
                >
                  {syncPref === option && <span className="w-2 h-2 rounded-full bg-indigo-500" />}
                </span>
                <span
                  className={`text-sm ${syncPref === option ? 'text-indigo-300 font-medium' : 'text-ink-dim'}`}
                >
                  {t(
                    option === 'ask'
                      ? 'sync_pref_ask'
                      : option === 'sync'
                        ? 'sync_pref_sync'
                        : 'sync_pref_ignore',
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="border-t border-surface-border" />

      {/* Whisper sync */}
      {syncEnabled && (
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-ink">{t('whisper_title')}</h2>
            <p className="text-sm text-ink-muted mt-1">{t('whisper_desc')}</p>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
                {t('whisper_url')}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={whisperUrl}
                  onChange={(e) => setWhisperUrl(e.target.value)}
                  placeholder="http://localhost:8000"
                  className="input flex-1"
                />
                <button
                  onClick={handleWhisperTest}
                  disabled={whisperTesting || !whisperUrl}
                  className="btn-secondary flex items-center gap-2 flex-shrink-0"
                >
                  {whisperTesting ? t('whisper_testing') : t('whisper_test')}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
                {t('whisper_key')}
              </label>
              <div className="relative">
                <input
                  type={showWhisperKey ? 'text' : 'password'}
                  value={whisperKey}
                  onChange={(e) => setWhisperKey(e.target.value)}
                  placeholder={t('whisper_key_placeholder')}
                  className="input pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowWhisperKey((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink-dim"
                >
                  {showWhisperKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
                {t('whisper_model')}
              </label>
              <div className="flex gap-2">
                <select
                  value={whisperModel}
                  onChange={(e) => setWhisperModel(e.target.value)}
                  className="input flex-1 font-mono"
                >
                  {whisperModels.length === 0 && <option value="">{t('whisper_model')}</option>}
                  {whisperModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <Tooltip text={t('whisper_refresh_models')}>
                  <button
                    onClick={() => fetchWhisperModels(whisperUrl, whisperKey)}
                    disabled={!whisperUrl || whisperModelsLoading}
                    className="btn-secondary px-3"
                  >
                    {whisperModelsLoading ? '…' : '↻'}
                  </button>
                </Tooltip>
                <Tooltip text={t('whisper_add_model')}>
                  <button
                    onClick={() => setAddModelOpen((v) => !v)}
                    disabled={!whisperUrl}
                    className="btn-secondary px-3"
                  >
                    +
                  </button>
                </Tooltip>
              </div>
              {addModelOpen && (
                <div className="flex gap-2 mt-2">
                  <input
                    type="text"
                    value={addModelInput}
                    onChange={(e) => setAddModelInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddModel()}
                    placeholder={t('whisper_add_model_placeholder')}
                    className="input flex-1 font-mono"
                    autoFocus
                  />
                  <button
                    onClick={handleAddModel}
                    disabled={!addModelInput.trim() || addModelLoading}
                    className="btn-primary px-4"
                  >
                    {addModelLoading ? '…' : t('whisper_add_model_confirm')}
                  </button>
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
                {t('whisper_concurrency')}
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={whisperConcurrency}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '') { setWhisperConcurrency(''); return; }
                  const n = parseInt(v, 10);
                  if (!isNaN(n) && n >= 1 && n <= 16) setWhisperConcurrency(n);
                }}
                className="input w-24"
              />
              <p className="text-xs text-ink-faint mt-1">{t('whisper_concurrency_desc')}</p>
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={handleWhisperSave} disabled={whisperSaving} className="btn-primary">
              {whisperSaving ? t('whisper_saving') : t('whisper_save')}
            </button>
          </div>
        </section>
      )}

      <div className="border-t border-surface-border" />

      {/* Send to e-reader */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-ink">{t('email_settings_title')}</h2>
        </div>
        {/* ── Send to e-reader ─────────────────────────────── */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
                {t('email_smtp_host')}
              </label>
              <input type="text" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} className="input" placeholder="smtp.gmail.com" />
            </div>
            <div>
              <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
                {t('email_smtp_port')}
              </label>
              <input type="number" value={smtpPort} onChange={(e) => setSmtpPort(Number(e.target.value))} className="input" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
              {t('email_smtp_user')}
            </label>
            <input type="text" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} className="input" placeholder="you@gmail.com" />
          </div>
          <div>
            <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
              {t('email_smtp_pass')}
            </label>
            <div className="relative">
              <input
                type={showSmtpPass ? 'text' : 'password'}
                value={smtpPass}
                onChange={(e) => setSmtpPass(e.target.value)}
                placeholder={smtpPassSet ? '••••••••' : ''}
                className="input pr-10"
              />
              <button type="button" onClick={() => setShowSmtpPass((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink-dim">
                {showSmtpPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
              {t('email_sender')}
            </label>
            <input type="email" value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} className="input" placeholder="you@gmail.com" />
          </div>
          <div>
            <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
              {t('email_reader')}
            </label>
            <input type="email" value={readerEmail} onChange={(e) => setReaderEmail(e.target.value)} className="input" placeholder="yourname@kindle.com" />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={handleEmailTest} disabled={emailTesting} className="btn-secondary">
              {emailTesting ? '…' : t('email_test')}
            </button>
            <button onClick={handleEmailSave} disabled={emailSaving} className="btn-primary">
              {emailSaving ? '…' : t('email_save')}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
