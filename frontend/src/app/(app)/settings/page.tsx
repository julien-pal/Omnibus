'use client';
import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import ProwlarrSettings from '@/components/SettingsTabs/ProwlarrSettings';
import ClientSettings from '@/components/SettingsTabs/ClientSettings';
import LibrarySettings from '@/components/SettingsTabs/LibrarySettings';
import CronSettings from '@/components/SettingsTabs/CronSettings';
import GeneralSettings from '@/components/SettingsTabs/GeneralSettings';
import UsersSettings from '@/components/SettingsTabs/UsersSettings';
import { Radio, HardDrive, Library, Settings, Timer, Users } from 'lucide-react';
import { useT } from '@/i18n';
import useStore from '@/store/useStore';

function SettingsContent() {
  const t = useT();
  const { user } = useStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') || 'general');

  // Redirect non-admin users
  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.replace('/');
    }
  }, [user, router]);

  if (user && user.role !== 'admin') return null;

  // Sync state when URL changes (browser back/forward)
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) setActiveTab(tab);
  }, [searchParams]);

  function handleTabClick(id: string) {
    setActiveTab(id);
    window.history.replaceState(null, '', `?tab=${id}`);
  }

  const isAdmin = !user?.role || user.role === 'admin';
  const TABS = [
    { id: 'general', label: t('tab_general'), icon: Settings },
    { id: 'prowlarr', label: t('tab_prowlarr'), icon: Radio },
    { id: 'clients', label: t('tab_clients'), icon: HardDrive },
    { id: 'libraries', label: t('tab_libraries'), icon: Library },
    { id: 'cron', label: t('tab_cron'), icon: Timer },
    ...(isAdmin ? [{ id: 'users', label: t('tab_users'), icon: Users }] : []),
  ];

  const TabContent = () => {
    switch (activeTab) {
      case 'general':
        return <GeneralSettings />;
      case 'prowlarr':
        return <ProwlarrSettings />;
      case 'clients':
        return <ClientSettings />;
      case 'libraries':
        return <LibrarySettings />;
      case 'cron':
        return <CronSettings />;
      case 'users':
        return <UsersSettings />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink mb-0.5">{t('settings_title')}</h1>
        <p className="text-sm text-ink-muted">{t('settings_subtitle')}</p>
      </div>

      <div className="flex flex-col md:flex-row gap-4 md:gap-6">
        <nav className="md:w-44 md:flex-shrink-0">
          {/* Mobile: grid */}
          <div className="grid grid-cols-3 md:hidden gap-1">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabClick(tab.id)}
                  className={`flex flex-col items-center gap-1 px-1 py-2 rounded-lg text-center transition-all ${
                    activeTab === tab.id
                      ? 'bg-indigo-500/15 text-indigo-300'
                      : 'text-ink-dim hover:text-ink hover:bg-surface-elevated'
                  }`}
                >
                  <span
                    className={`w-7 h-7 flex items-center justify-center rounded-md flex-shrink-0 transition-colors ${
                      activeTab === tab.id ? 'bg-indigo-500/20 text-indigo-400' : 'text-current'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="text-[10px] leading-tight">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Desktop: vertical list */}
          <div className="hidden md:flex flex-col gap-1">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabClick(tab.id)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm w-full text-left transition-all ${
                    activeTab === tab.id
                      ? 'bg-indigo-500/15 text-indigo-300'
                      : 'text-ink-dim hover:text-ink hover:bg-surface-elevated'
                  }`}
                >
                  <span
                    className={`w-6 h-6 flex items-center justify-center rounded-md flex-shrink-0 transition-colors ${
                      activeTab === tab.id ? 'bg-indigo-500/20 text-indigo-400' : 'text-current'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  {tab.label}
                </button>
              );
            })}
          </div>
        </nav>

        <div className="flex-1 min-w-0">
          <TabContent />
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  );
}
