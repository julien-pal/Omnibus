'use client';
import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import DownloadItem from '@/components/DownloadItem';
import {
  Download,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ListChecks,
  Play,
  FlaskConical,
  Power,
  ChevronDown,
  ChevronUp,
  ArrowDownToLine,
  PackageCheck,
} from 'lucide-react';
import apiClient from '@/api/client';
import { downloadService } from '@/api/downloadService';
import useStore from '@/store/useStore';
import { DownloadEntry } from '@/types';
import { useT } from '@/i18n';
import Tooltip from '@/components/Tooltip';

interface CronPanelConfig {
  iconCls: string;
  Icon: React.ElementType;
  titleKey: string;
  intervalKey: string;
  confQueryKey: string;
  logsQueryKey: string;
  confEndpoint: string;
  runEndpoint: string;
  dryRunEndpoint: string;
  logsEndpoint: string;
  intervalValue: (
    conf: { intervalMinutes?: number; intervalSeconds?: number } | undefined,
  ) => number;
}

function CronPanel({ config }: { config: CronPanelConfig }) {
  const t = useT();
  const [logsOpen, setLogsOpen] = useState(false);
  const [runLoading, setRunLoading] = useState(false);
  const [dryLoading, setDryLoading] = useState(false);

  const { data: cronConf, refetch: refetchConf } = useQuery({
    queryKey: [config.confQueryKey],
    queryFn: () => apiClient.get(config.confEndpoint).then((r) => r.data),
  });

  const { data: logs = [], refetch: refetchLogs } = useQuery({
    queryKey: [config.logsQueryKey],
    queryFn: () => apiClient.get(config.logsEndpoint).then((r) => r.data),
    enabled: logsOpen,
    refetchInterval: logsOpen ? 3000 : false,
  });

  async function toggleEnabled() {
    await apiClient.put(config.confEndpoint, { enabled: !cronConf?.enabled });
    refetchConf();
  }

  async function triggerRun(dryRun: boolean) {
    const set = dryRun ? setDryLoading : setRunLoading;
    set(true);
    try {
      await apiClient.post(dryRun ? config.dryRunEndpoint : config.runEndpoint);
      if (logsOpen) setTimeout(refetchLogs, 500);
      else setLogsOpen(true);
    } finally {
      set(false);
    }
  }

  const enabled = cronConf?.enabled !== false;
  const interval = config.intervalValue(cronConf);
  const { Icon } = config;

  return (
    <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
      <div className="flex items-center px-4 py-3">
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mr-3 ${config.iconCls}`}
        >
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink leading-tight">
            {t(config.titleKey as Parameters<typeof t>[0])}
          </p>
          <p className="text-xs text-ink-faint mt-0.5">
            {enabled
              ? t(config.intervalKey as Parameters<typeof t>[0]).replace('{n}', String(interval))
              : t('wishlist_cron_disabled')}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-shrink-0 pl-2">
          <Tooltip text={t('wishlist_cron_show_logs')}>
            <button
              onClick={() => setLogsOpen((v) => !v)}
              className="flex items-center justify-center w-8 h-8 rounded-lg border border-surface-border bg-surface-elevated hover:bg-surface-strong text-ink-faint hover:text-ink transition-colors"
            >
              {logsOpen ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </Tooltip>
          <Tooltip text={enabled ? t('wishlist_cron_disable') : t('wishlist_cron_enable')}>
            <button
              onClick={toggleEnabled}
              className={`flex items-center justify-center w-8 h-8 rounded-lg border transition-colors ${
                enabled
                  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25 hover:bg-emerald-500/20'
                  : 'text-ink-faint bg-surface-elevated border-surface-border hover:border-surface-strong hover:text-ink'
              }`}
            >
              <Power className="w-3.5 h-3.5" />
            </button>
          </Tooltip>
          <Tooltip text={t('wishlist_cron_run')}>
            <button
              onClick={() => triggerRun(false)}
              disabled={runLoading}
              className="flex items-center justify-center w-8 h-8 rounded-lg border text-indigo-400 bg-indigo-500/10 border-indigo-500/25 hover:bg-indigo-500/20 transition-colors disabled:opacity-50"
            >
              {runLoading ? (
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
                <Play className="w-3.5 h-3.5" />
              )}
            </button>
          </Tooltip>
          <Tooltip text={t('wishlist_cron_dry_run')}>
            <button
              onClick={() => triggerRun(true)}
              disabled={dryLoading}
              className="flex items-center justify-center w-8 h-8 rounded-lg border text-amber-400 bg-amber-500/10 border-amber-500/25 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
            >
              {dryLoading ? (
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
                <FlaskConical className="w-3.5 h-3.5" />
              )}
            </button>
          </Tooltip>
        </div>
      </div>

      {logsOpen && (
        <div className="border-t border-surface-border bg-surface-elevated max-h-64 overflow-y-auto">
          {(logs as { ts: string; level: string; msg: string }[]).length === 0 ? (
            <p className="text-xs text-ink-faint px-4 py-3">{t('wishlist_cron_no_logs')}</p>
          ) : (
            <div className="divide-y divide-surface-border">
              {[...(logs as { ts: string; level: string; msg: string }[])]
                .reverse()
                .map((entry, i) => (
                  <div key={i} className="flex items-start gap-2.5 px-4 py-1.5">
                    <span className="text-[10px] text-ink-faint tabular-nums flex-shrink-0 mt-0.5 font-mono">
                      {new Date(entry.ts).toLocaleTimeString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                    <span
                      className={`text-[11px] font-mono leading-relaxed ${
                        entry.level === 'error'
                          ? 'text-red-400'
                          : entry.level === 'warn'
                            ? 'text-amber-400'
                            : entry.msg?.includes('[DRY RUN]')
                              ? 'text-amber-300'
                              : 'text-ink-muted'
                      }`}
                    >
                      {entry.msg}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const WISHLIST_CRON_CONFIG: CronPanelConfig = {
  iconCls: 'bg-indigo-500/15',
  Icon: ListChecks,
  titleKey: 'wishlist_cron_title',
  intervalKey: 'wishlist_cron_interval',
  confQueryKey: 'cron-conf',
  logsQueryKey: 'cron-logs',
  confEndpoint: '/settings/cron',
  runEndpoint: '/settings/cron/run',
  dryRunEndpoint: '/settings/cron/dry-run',
  logsEndpoint: '/settings/cron/logs',
  intervalValue: (conf) => conf?.intervalMinutes || 60,
};

const IMPORT_CRON_CONFIG: CronPanelConfig = {
  iconCls: 'bg-emerald-500/15',
  Icon: ArrowDownToLine,
  titleKey: 'import_cron_title',
  intervalKey: 'import_cron_interval',
  confQueryKey: 'import-cron-conf',
  logsQueryKey: 'import-cron-logs',
  confEndpoint: '/settings/cron/import',
  runEndpoint: '/settings/cron/import/run',
  dryRunEndpoint: '/settings/cron/import/dry-run',
  logsEndpoint: '/settings/cron/import/logs',
  intervalValue: (conf) => conf?.intervalSeconds || 5,
};

function Section({
  icon: Icon,
  label,
  count,
  iconCls,
  children,
}: {
  icon: React.ElementType;
  label: string;
  count?: number;
  iconCls?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-3.5 h-3.5 ${iconCls}`} />
        <span className="section-label">{label}</span>
        <span className="badge bg-surface-elevated text-ink-muted text-[10px]">{count}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{children}</div>
    </section>
  );
}

export default function Downloads() {
  const t = useT();
  const { setDownloads } = useStore();

  const { data, isLoading, error } = useQuery({
    queryKey: ['downloads'],
    queryFn: async () => {
      const res = await downloadService.getAll();
      return res.data;
    },
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    if (data) setDownloads(data);
  }, [data]);

  const [showImported, setShowImported] = useState(false);

  const downloads = data || [];
  const active = downloads.filter((d: DownloadEntry) =>
    ['downloading', 'queued', 'organizing'].includes(d.status),
  );
  const done = downloads.filter((d: DownloadEntry) => ['done', 'seeding'].includes(d.status));
  const errors = downloads.filter((d: DownloadEntry) => d.status === 'error');
  const imported = downloads.filter((d: DownloadEntry) => d.status === 'imported');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-ink mb-0.5">{t('downloads_title')}</h1>
        <p className="text-sm text-ink-muted">{t('downloads_subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <CronPanel config={WISHLIST_CRON_CONFIG} />
        <CronPanel config={IMPORT_CRON_CONFIG} />
      </div>

      {isLoading && (
        <div className="flex items-center gap-2.5 text-ink-muted text-sm">
          <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
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
          {t('downloads_loading')}
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm">
          {(error as Error).message}
        </div>
      )}

      {imported.length > 0 && (
        <button
          onClick={() => setShowImported((v) => !v)}
          className="flex items-center gap-2 text-xs text-ink-muted hover:text-ink transition-colors"
        >
          <PackageCheck className="w-3.5 h-3.5 text-teal-400" />
          <span>{showImported ? t('downloads_hide_imported') : t('downloads_show_imported')}</span>
          <span className="badge bg-teal-500/10 text-teal-400 border border-teal-500/25 text-[10px]">
            {imported.length}
          </span>
          {showImported ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      )}

      {downloads.filter((d: DownloadEntry) => d.status !== 'imported').length === 0 &&
        !isLoading &&
        !showImported && (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-16 h-16 rounded-2xl bg-surface-elevated flex items-center justify-center mb-4">
              <Download className="w-7 h-7 text-ink-faint" />
            </div>
            <p className="text-base font-medium text-ink-muted">{t('downloads_empty')}</p>
            <p className="text-sm mt-1 text-ink-faint">{t('downloads_empty_hint')}</p>
          </div>
        )}

      {active.length > 0 && (
        <Section
          icon={Clock}
          label={t('downloads_section_active')}
          count={active.length}
          iconCls="text-blue-400"
        >
          {active.map((dl: DownloadEntry) => (
            <DownloadItem key={dl.id} download={dl} />
          ))}
        </Section>
      )}

      {errors.length > 0 && (
        <Section
          icon={AlertTriangle}
          label={t('downloads_section_errors')}
          count={errors.length}
          iconCls="text-red-400"
        >
          {errors.map((dl: DownloadEntry) => (
            <DownloadItem key={dl.id} download={dl} />
          ))}
        </Section>
      )}

      {done.length > 0 && (
        <Section
          icon={CheckCircle2}
          label={t('downloads_section_done')}
          count={done.length}
          iconCls="text-emerald-400"
        >
          {done.map((dl: DownloadEntry) => (
            <DownloadItem key={dl.id} download={dl} />
          ))}
        </Section>
      )}

      {showImported && imported.length > 0 && (
        <Section
          icon={PackageCheck}
          label={t('downloads_section_imported')}
          count={imported.length}
          iconCls="text-teal-400"
        >
          {imported.map((dl: DownloadEntry) => (
            <DownloadItem key={dl.id} download={dl} />
          ))}
        </Section>
      )}
    </div>
  );
}
