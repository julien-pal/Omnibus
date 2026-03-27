'use client';
import React, { useState, useEffect, useRef } from 'react';
import { AxiosError } from 'axios';
import { Play, Clock, RefreshCw, BookMarked, FolderInput, Mic, FlaskConical, Database, Bell } from 'lucide-react';
import { settingsService } from '@/api/settingsService';
import { useT } from '@/i18n';
import Tooltip from '@/components/Tooltip';
import { toast } from '@/store/useToastStore';

const INTERVAL_VALUES = [30, 60, 120, 360, 720, 1440];
const INTERVAL_KEYS = [
  'cron_interval_30min',
  'cron_interval_1h',
  'cron_interval_2h',
  'cron_interval_6h',
  'cron_interval_12h',
  'cron_interval_24h',
] as const;

const IMPORT_INTERVAL_VALUES = [5, 10, 30, 60, 300, 600];
const IMPORT_INTERVAL_KEYS = [
  'cron_import_interval_5s',
  'cron_import_interval_10s',
  'cron_import_interval_30s',
  'cron_import_interval_1min',
  'cron_import_interval_5min',
  'cron_import_interval_10min',
] as const;

interface LogEntry {
  ts: string;
  level: 'info' | 'warn' | 'error';
  msg: string;
}

const LEVEL_CLS: Record<string, string> = {
  info: 'text-ink-muted',
  warn: 'text-amber-400',
  error: 'text-red-400',
};

function formatLogTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function CronSettings() {
  const t = useT();
  // — Wishlist cron —
  const [enabled, setEnabled] = useState(true);
  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [dryRunning, setDryRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const logsEndRef = useRef(null);

  // — Import cron —
  const [importEnabled, setImportEnabled] = useState(true);
  const [importInterval, setImportInterval] = useState(5);
  const [importSaving, setImportSaving] = useState(false);
  const [importRunning, setImportRunning] = useState(false);
  const [importDryRunning, setImportDryRunning] = useState(false);
  const [importLogs, setImportLogs] = useState<LogEntry[]>([]);
  const [importLogsLoading, setImportLogsLoading] = useState(false);

  // — Transcript cron —
  const [transcriptEnabled, setTranscriptEnabled] = useState(false);
  const [transcriptInterval, setTranscriptInterval] = useState(60);
  const [transcriptSaving, setTranscriptSaving] = useState(false);
  const [transcriptRunning, setTranscriptRunning] = useState(false);
  const [transcriptDryRunning, setTranscriptDryRunning] = useState(false);
  const [transcriptLogs, setTranscriptLogs] = useState<LogEntry[]>([]);
  const [transcriptLogsLoading, setTranscriptLogsLoading] = useState(false);

  // — Follow cron —
  const [followEnabled, setFollowEnabled] = useState(false);
  const [followInterval, setFollowInterval] = useState(60);
  const [followSaving, setFollowSaving] = useState(false);
  const [followRunning, setFollowRunning] = useState(false);
  const [followDryRunning, setFollowDryRunning] = useState(false);
  const [followLogs, setFollowLogs] = useState<LogEntry[]>([]);
  const [followLogsLoading, setFollowLogsLoading] = useState(false);

  // — Library cache rebuild cron —
  const [libCacheEnabled, setLibCacheEnabled] = useState(true);
  const [libCacheInterval, setLibCacheInterval] = useState(10);
  const [libCacheSaving, setLibCacheSaving] = useState(false);
  const [libCacheRunning, setLibCacheRunning] = useState(false);
  const [libCacheDryRunning, setLibCacheDryRunning] = useState(false);
  const [libCacheLogs, setLibCacheLogs] = useState<LogEntry[]>([]);
  const [libCacheLogsLoading, setLibCacheLogsLoading] = useState(false);

  useEffect(() => {
    settingsService
      .getCron()
      .then((res) => {
        setEnabled(res.data.enabled ?? true);
        setIntervalMinutes(res.data.intervalMinutes ?? 60);
      })
      .catch(() => {});
    settingsService
      .getImportCron()
      .then((res) => {
        setImportEnabled(res.data.enabled ?? true);
        setImportInterval(res.data.intervalSeconds ?? 5);
      })
      .catch(() => {});
    settingsService
      .getTranscriptCron()
      .then((res) => {
        setTranscriptEnabled(res.data.enabled ?? false);
        setTranscriptInterval(res.data.intervalMinutes ?? 60);
      })
      .catch(() => {});
    settingsService
      .getFollowCron()
      .then((res) => {
        setFollowEnabled(res.data.enabled ?? false);
        setFollowInterval(res.data.intervalMinutes ?? 60);
      })
      .catch(() => {});
    settingsService
      .getLibraryCacheCron()
      .then((res) => {
        setLibCacheEnabled(res.data.enabled ?? true);
        setLibCacheInterval(res.data.intervalMinutes ?? 10);
      })
      .catch(() => {});
    fetchLogs();
    fetchImportLogs();
    fetchTranscriptLogs();
    fetchFollowLogs();
    fetchLibCacheLogs();
  }, []);

  async function fetchLogs() {
    setLogsLoading(true);
    try {
      const res = await settingsService.getCronLogs();
      setLogs(res.data);
    } catch {
      /* ignore */
    } finally {
      setLogsLoading(false);
    }
  }

  async function handleSave(newInterval?: number) {
    setSaving(true);
    try {
      await settingsService.updateCron({
        enabled,
        intervalMinutes: newInterval ?? intervalMinutes,
      });
      toast.success(t('cron_saved'));
    } catch (err) {
      toast.error(
        (err as AxiosError<{ error: string }>).response?.data?.error || (err as Error).message,
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleRunNow() {
    setRunning(true);
    try {
      await settingsService.runCron();
      toast.success(t('cron_triggered'));
      setTimeout(fetchLogs, 1500);
      setTimeout(fetchLogs, 4000);
      setTimeout(fetchLogs, 10000);
    } catch (err) {
      toast.error(
        (err as AxiosError<{ error: string }>).response?.data?.error || (err as Error).message,
      );
    } finally {
      setRunning(false);
    }
  }

  async function handleDryRun() {
    setDryRunning(true);
    try {
      await settingsService.dryRunCron();
      toast.success(t('cron_dry_run_triggered'));
      setTimeout(fetchLogs, 1500);
      setTimeout(fetchLogs, 4000);
      setTimeout(fetchLogs, 10000);
    } catch (err) {
      toast.error(
        (err as AxiosError<{ error: string }>).response?.data?.error || (err as Error).message,
      );
    } finally {
      setDryRunning(false);
    }
  }

  async function fetchImportLogs() {
    setImportLogsLoading(true);
    try {
      const res = await settingsService.getImportCronLogs();
      setImportLogs(res.data);
    } catch {
      /* ignore */
    } finally {
      setImportLogsLoading(false);
    }
  }

  async function handleImportSave(newInterval?: number) {
    setImportSaving(true);
    try {
      await settingsService.updateImportCron({
        enabled: importEnabled,
        intervalSeconds: newInterval ?? importInterval,
      });
      toast.success(t('cron_saved'));
    } catch (err) {
      toast.error(
        (err as AxiosError<{ error: string }>).response?.data?.error || (err as Error).message,
      );
    } finally {
      setImportSaving(false);
    }
  }

  async function handleImportRunNow() {
    setImportRunning(true);
    try {
      await settingsService.runImportCron();
      toast.success(t('cron_import_triggered'));
      setTimeout(fetchImportLogs, 1500);
      setTimeout(fetchImportLogs, 4000);
    } catch (err) {
      toast.error(
        (err as AxiosError<{ error: string }>).response?.data?.error || (err as Error).message,
      );
    } finally {
      setImportRunning(false);
    }
  }

  async function handleImportDryRun() {
    setImportDryRunning(true);
    try {
      await settingsService.dryRunImportCron();
      toast.success(t('cron_dry_run_triggered'));
      setTimeout(fetchImportLogs, 1500);
      setTimeout(fetchImportLogs, 4000);
    } catch (err) {
      toast.error(
        (err as AxiosError<{ error: string }>).response?.data?.error || (err as Error).message,
      );
    } finally {
      setImportDryRunning(false);
    }
  }

  async function fetchTranscriptLogs() {
    setTranscriptLogsLoading(true);
    try {
      const res = await settingsService.getTranscriptCronLogs();
      setTranscriptLogs(res.data);
    } catch {
      /* ignore */
    } finally {
      setTranscriptLogsLoading(false);
    }
  }

  async function handleTranscriptSave(newInterval?: number) {
    setTranscriptSaving(true);
    try {
      await settingsService.updateTranscriptCron({
        enabled: transcriptEnabled,
        intervalMinutes: newInterval ?? transcriptInterval,
      });
      toast.success(t('cron_saved'));
    } catch (err) {
      toast.error(
        (err as AxiosError<{ error: string }>).response?.data?.error || (err as Error).message,
      );
    } finally {
      setTranscriptSaving(false);
    }
  }

  async function handleTranscriptRunNow() {
    setTranscriptRunning(true);
    try {
      await settingsService.runTranscriptCron();
      toast.success(t('cron_transcript_triggered'));
      setTimeout(fetchTranscriptLogs, 1500);
      setTimeout(fetchTranscriptLogs, 4000);
      setTimeout(fetchTranscriptLogs, 10000);
    } catch (err) {
      toast.error(
        (err as AxiosError<{ error: string }>).response?.data?.error || (err as Error).message,
      );
    } finally {
      setTranscriptRunning(false);
    }
  }

  async function handleTranscriptDryRun() {
    setTranscriptDryRunning(true);
    try {
      await settingsService.dryRunTranscriptCron();
      toast.success(t('cron_dry_run_triggered'));
      setTimeout(fetchTranscriptLogs, 1500);
      setTimeout(fetchTranscriptLogs, 4000);
      setTimeout(fetchTranscriptLogs, 10000);
    } catch (err) {
      toast.error(
        (err as AxiosError<{ error: string }>).response?.data?.error || (err as Error).message,
      );
    } finally {
      setTranscriptDryRunning(false);
    }
  }

  async function fetchFollowLogs() {
    setFollowLogsLoading(true);
    try {
      const res = await settingsService.getFollowCronLogs();
      setFollowLogs(res.data);
    } catch { /* ignore */ } finally { setFollowLogsLoading(false); }
  }

  async function handleFollowSave(newInterval?: number) {
    setFollowSaving(true);
    try {
      await settingsService.updateFollowCron({ enabled: followEnabled, intervalMinutes: newInterval ?? followInterval });
      toast.success(t('cron_saved'));
    } catch (err) {
      toast.error((err as AxiosError<{ error: string }>).response?.data?.error || (err as Error).message);
    } finally { setFollowSaving(false); }
  }

  async function handleFollowRunNow() {
    setFollowRunning(true);
    try {
      await settingsService.runFollowCron();
      toast.success(t('cron_follow_triggered'));
      setTimeout(fetchFollowLogs, 1500);
      setTimeout(fetchFollowLogs, 4000);
      setTimeout(fetchFollowLogs, 10000);
    } catch (err) {
      toast.error((err as AxiosError<{ error: string }>).response?.data?.error || (err as Error).message);
    } finally { setFollowRunning(false); }
  }

  async function handleFollowDryRun() {
    setFollowDryRunning(true);
    try {
      await settingsService.dryRunFollowCron();
      toast.success(t('cron_dry_run_triggered'));
      setTimeout(fetchFollowLogs, 1500);
      setTimeout(fetchFollowLogs, 4000);
      setTimeout(fetchFollowLogs, 10000);
    } catch (err) {
      toast.error((err as AxiosError<{ error: string }>).response?.data?.error || (err as Error).message);
    } finally { setFollowDryRunning(false); }
  }

  async function fetchLibCacheLogs() {
    setLibCacheLogsLoading(true);
    try {
      const res = await settingsService.getLibraryCacheCronLogs();
      setLibCacheLogs(res.data);
    } catch {
      /* ignore */
    } finally {
      setLibCacheLogsLoading(false);
    }
  }

  async function handleLibCacheSave(newInterval?: number) {
    setLibCacheSaving(true);
    try {
      await settingsService.updateLibraryCacheCron({
        enabled: libCacheEnabled,
        intervalMinutes: newInterval ?? libCacheInterval,
      });
      toast.success(t('cron_saved'));
    } catch (err) {
      toast.error(
        (err as AxiosError<{ error: string }>).response?.data?.error || (err as Error).message,
      );
    } finally {
      setLibCacheSaving(false);
    }
  }

  async function handleLibCacheRunNow() {
    setLibCacheRunning(true);
    try {
      await settingsService.runLibraryCacheCron();
      toast.success(t('cron_library_cache_triggered'));
      setTimeout(fetchLibCacheLogs, 1500);
      setTimeout(fetchLibCacheLogs, 4000);
    } catch (err) {
      toast.error(
        (err as AxiosError<{ error: string }>).response?.data?.error || (err as Error).message,
      );
    } finally {
      setLibCacheRunning(false);
    }
  }

  async function handleLibCacheDryRun() {
    setLibCacheDryRunning(true);
    try {
      await settingsService.dryRunLibraryCacheCron();
      toast.success(t('cron_dry_run_triggered'));
      setTimeout(fetchLibCacheLogs, 1500);
      setTimeout(fetchLibCacheLogs, 4000);
    } catch (err) {
      toast.error(
        (err as AxiosError<{ error: string }>).response?.data?.error || (err as Error).message,
      );
    } finally {
      setLibCacheDryRunning(false);
    }
  }

  // ── Reusable sub-components ──────────────────────────────────────────────────

  function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
    return (
      <button
        onClick={onChange}
        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
          checked ? 'bg-indigo-500' : 'bg-surface-elevated border border-surface-border'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    );
  }

  function LogPanel({
    logs: entries,
    loading,
    onRefresh,
  }: {
    logs: LogEntry[];
    loading: boolean;
    onRefresh: () => void;
  }) {
    return (
      <div className="border-t border-surface-border">
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-[11px] font-medium text-ink-faint uppercase tracking-widest">
            {t('cron_logs_label').replace('{n}', String(entries.length))}
          </span>
          <Tooltip text={t('cron_refresh')}>
            <button
              onClick={onRefresh}
              disabled={loading}
              className="btn-ghost w-6 h-6 p-0 rounded-md flex items-center justify-center"
            >
              <RefreshCw
                className={`w-3 h-3 ${loading ? 'animate-spin text-indigo-400' : 'text-ink-faint'}`}
              />
            </button>
          </Tooltip>
        </div>
        <div className="h-40 overflow-y-auto font-mono text-[11px] px-4 pb-3 space-y-0.5">
          {entries.length === 0 ? (
            <p className="text-ink-faint italic">{t('cron_no_logs')}</p>
          ) : (
            entries.map((entry, i) => (
              <div key={i} className="flex gap-2 leading-relaxed">
                <span className="text-ink-faint flex-shrink-0">{formatLogTime(entry.ts)}</span>
                <span className={LEVEL_CLS[entry.level] || 'text-ink-muted'}>{entry.msg}</span>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ── Follow cron ── */}
      <div className="rounded-2xl border border-surface-border bg-surface-card overflow-hidden">
        <div className="flex items-center gap-4 px-5 py-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
            <Bell className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-ink">{t('cron_follow_title')}</h2>
            <p className="text-xs text-ink-muted mt-0.5 leading-relaxed">{t('cron_follow_desc')}</p>
          </div>
          <Toggle
            checked={followEnabled}
            onChange={() => {
              const next = !followEnabled;
              setFollowEnabled(next);
              settingsService.updateFollowCron({ enabled: next, intervalMinutes: followInterval }).catch(() => {});
            }}
          />
        </div>

        {followEnabled && (
          <>
            <div className="border-t border-surface-border px-5 py-4 space-y-2">
              <p className="text-[11px] font-medium text-ink-faint uppercase tracking-widest mb-3">
                {t('cron_interval_label')}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {INTERVAL_VALUES.map((value, i) => (
                  <button
                    key={value}
                    onClick={() => { setFollowInterval(value); handleFollowSave(value); }}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                      followInterval === value
                        ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                        : 'bg-surface-elevated border-surface-border text-ink-muted hover:border-surface-strong hover:text-ink'
                    }`}
                  >
                    <Clock className="w-3 h-3 flex-shrink-0" />
                    {t(INTERVAL_KEYS[i])}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-surface-border px-5 py-3 flex items-center gap-2 bg-surface-elevated/40">
              <button
                onClick={handleFollowRunNow}
                disabled={followRunning}
                className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
              >
                <Play className="w-3 h-3" />
                {followRunning ? t('cron_running') : t('cron_run_now')}
              </button>
              <button
                onClick={handleFollowDryRun}
                disabled={followDryRunning}
                className="btn-ghost text-xs py-1.5 px-3 flex items-center gap-1.5 text-amber-400 hover:text-amber-300"
              >
                <FlaskConical className="w-3 h-3" />
                {followDryRunning ? t('cron_dry_running') : t('cron_dry_run')}
              </button>
            </div>

            <LogPanel logs={followLogs} loading={followLogsLoading} onRefresh={fetchFollowLogs} />
          </>
        )}
      </div>

      {/* ── Wishlist cron ── */}
      <div className="rounded-2xl border border-surface-border bg-surface-card overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-4 px-5 py-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
            <BookMarked className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-ink">{t('cron_download_title')}</h2>
            <p className="text-xs text-ink-muted mt-0.5 leading-relaxed">
              {t('cron_download_desc')}
            </p>
          </div>
          <Toggle checked={enabled} onChange={() => setEnabled((v) => !v)} />
        </div>

        {enabled && (
          <>
            {/* Interval */}
            <div className="border-t border-surface-border px-5 py-4 space-y-2">
              <p className="text-[11px] font-medium text-ink-faint uppercase tracking-widest mb-3">
                {t('cron_interval_label')}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {INTERVAL_VALUES.map((value, i) => (
                  <button
                    key={value}
                    onClick={() => {
                      setIntervalMinutes(value);
                      handleSave(value);
                    }}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                      intervalMinutes === value
                        ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                        : 'bg-surface-elevated border-surface-border text-ink-muted hover:border-surface-strong hover:text-ink'
                    }`}
                  >
                    <Clock className="w-3 h-3 flex-shrink-0" />
                    {t(INTERVAL_KEYS[i])}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="border-t border-surface-border px-5 py-3 flex items-center gap-2 bg-surface-elevated/40">
              <button
                onClick={handleRunNow}
                disabled={running}
                className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
              >
                <Play className="w-3 h-3" />
                {running ? t('cron_running') : t('cron_run_now')}
              </button>
              <button
                onClick={handleDryRun}
                disabled={dryRunning}
                className="btn-ghost text-xs py-1.5 px-3 flex items-center gap-1.5 text-amber-400 hover:text-amber-300"
              >
                <FlaskConical className="w-3 h-3" />
                {dryRunning ? t('cron_dry_running') : t('cron_dry_run')}
              </button>
            </div>

            {/* Logs */}
            <LogPanel logs={logs} loading={logsLoading} onRefresh={fetchLogs} />
          </>
        )}
      </div>

      {/* ── Import cron ── */}
      <div className="rounded-2xl border border-surface-border bg-surface-card overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-4 px-5 py-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
            <FolderInput className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-ink">{t('cron_import_title')}</h2>
            <p className="text-xs text-ink-muted mt-0.5 leading-relaxed">{t('cron_import_desc')}</p>
          </div>
          <Toggle checked={importEnabled} onChange={() => setImportEnabled((v) => !v)} />
        </div>

        {importEnabled && (
          <>
            {/* Interval */}
            <div className="border-t border-surface-border px-5 py-4 space-y-2">
              <p className="text-[11px] font-medium text-ink-faint uppercase tracking-widest mb-3">
                {t('cron_interval_label')}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {IMPORT_INTERVAL_VALUES.map((value, i) => (
                  <button
                    key={value}
                    onClick={() => {
                      setImportInterval(value);
                      handleImportSave(value);
                    }}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                      importInterval === value
                        ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                        : 'bg-surface-elevated border-surface-border text-ink-muted hover:border-surface-strong hover:text-ink'
                    }`}
                  >
                    <Clock className="w-3 h-3 flex-shrink-0" />
                    {t(IMPORT_INTERVAL_KEYS[i])}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="border-t border-surface-border px-5 py-3 flex items-center gap-2 bg-surface-elevated/40">
              <button
                onClick={handleImportRunNow}
                disabled={importRunning}
                className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
              >
                <Play className="w-3 h-3" />
                {importRunning ? t('cron_running') : t('cron_run_now')}
              </button>
              <button
                onClick={handleImportDryRun}
                disabled={importDryRunning}
                className="btn-ghost text-xs py-1.5 px-3 flex items-center gap-1.5 text-amber-400 hover:text-amber-300"
              >
                <FlaskConical className="w-3 h-3" />
                {importDryRunning ? t('cron_dry_running') : t('cron_dry_run')}
              </button>
            </div>

            {/* Logs */}
            <LogPanel logs={importLogs} loading={importLogsLoading} onRefresh={fetchImportLogs} />
          </>
        )}
      </div>

      {/* ── Transcript cron ── */}
      <div className="rounded-2xl border border-surface-border bg-surface-card overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-4 px-5 py-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
            <Mic className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-ink">{t('cron_transcript_title')}</h2>
            <p className="text-xs text-ink-muted mt-0.5 leading-relaxed">
              {t('cron_transcript_desc')}
            </p>
          </div>
          <Toggle checked={transcriptEnabled} onChange={() => setTranscriptEnabled((v) => !v)} />
        </div>

        {transcriptEnabled && (
          <>
            {/* Interval */}
            <div className="border-t border-surface-border px-5 py-4 space-y-2">
              <p className="text-[11px] font-medium text-ink-faint uppercase tracking-widest mb-3">
                {t('cron_interval_label')}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {INTERVAL_VALUES.map((value, i) => (
                  <button
                    key={value}
                    onClick={() => {
                      setTranscriptInterval(value);
                      handleTranscriptSave(value);
                    }}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                      transcriptInterval === value
                        ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                        : 'bg-surface-elevated border-surface-border text-ink-muted hover:border-surface-strong hover:text-ink'
                    }`}
                  >
                    <Clock className="w-3 h-3 flex-shrink-0" />
                    {t(INTERVAL_KEYS[i])}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="border-t border-surface-border px-5 py-3 flex items-center gap-2 bg-surface-elevated/40">
              <button
                onClick={handleTranscriptRunNow}
                disabled={transcriptRunning}
                className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
              >
                <Play className="w-3 h-3" />
                {transcriptRunning ? t('cron_running') : t('cron_run_now')}
              </button>
              <button
                onClick={handleTranscriptDryRun}
                disabled={transcriptDryRunning}
                className="btn-ghost text-xs py-1.5 px-3 flex items-center gap-1.5 text-amber-400 hover:text-amber-300"
              >
                <FlaskConical className="w-3 h-3" />
                {transcriptDryRunning ? t('cron_dry_running') : t('cron_dry_run')}
              </button>
            </div>

            {/* Logs */}
            <LogPanel
              logs={transcriptLogs}
              loading={transcriptLogsLoading}
              onRefresh={fetchTranscriptLogs}
            />
          </>
        )}
      </div>

      {/* ── Library cache rebuild cron ── */}
      <div className="rounded-2xl border border-surface-border bg-surface-card overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-4 px-5 py-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
            <Database className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-ink">{t('cron_library_cache_title')}</h2>
            <p className="text-xs text-ink-muted mt-0.5 leading-relaxed">
              {t('cron_library_cache_desc')}
            </p>
          </div>
          <Toggle
            checked={libCacheEnabled}
            onChange={() => {
              const next = !libCacheEnabled;
              setLibCacheEnabled(next);
              settingsService.updateLibraryCacheCron({ enabled: next, intervalMinutes: libCacheInterval }).catch(() => {});
            }}
          />
        </div>

        {libCacheEnabled && (
          <>
            {/* Interval */}
            <div className="border-t border-surface-border px-5 py-4 space-y-2">
              <p className="text-[11px] font-medium text-ink-faint uppercase tracking-widest mb-3">
                {t('cron_interval_label')}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {INTERVAL_VALUES.map((value, i) => (
                  <button
                    key={value}
                    onClick={() => {
                      setLibCacheInterval(value);
                      handleLibCacheSave(value);
                    }}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                      libCacheInterval === value
                        ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                        : 'bg-surface-elevated border-surface-border text-ink-muted hover:border-surface-strong hover:text-ink'
                    }`}
                  >
                    <Clock className="w-3 h-3 flex-shrink-0" />
                    {t(INTERVAL_KEYS[i])}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="border-t border-surface-border px-5 py-3 flex items-center gap-2 bg-surface-elevated/40">
              <button
                onClick={handleLibCacheRunNow}
                disabled={libCacheRunning}
                className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
              >
                <Play className="w-3 h-3" />
                {libCacheRunning ? t('cron_running') : t('cron_run_now')}
              </button>
              <button
                onClick={handleLibCacheDryRun}
                disabled={libCacheDryRunning}
                className="btn-ghost text-xs py-1.5 px-3 flex items-center gap-1.5 text-amber-400 hover:text-amber-300"
              >
                <FlaskConical className="w-3 h-3" />
                {libCacheDryRunning ? t('cron_dry_running') : t('cron_dry_run')}
              </button>
            </div>

            {/* Logs */}
            <LogPanel logs={libCacheLogs} loading={libCacheLogsLoading} onRefresh={fetchLibCacheLogs} />
          </>
        )}
      </div>
    </div>
  );
}
