'use client';
import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Download, Search, Settings, LogOut, Library, BarChart2 } from 'lucide-react';
import useStore from '../store/useStore';
import { authService } from '../api/authService';
import { useT } from '@/i18n';
import { usePlayerStore } from '@/store/usePlayerStore';
import PlayerBar from '@/components/PlayerBar';
import Toaster from '@/components/Toaster';
import ReaderModal from '@/components/ReaderModal';
import { useReaderStore } from '@/store/useReaderStore';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { logout, authEnabled, user } = useStore();
  const router = useRouter();
  const pathname = usePathname();
  const t = useT();
  const track = usePlayerStore((s) => s.track);
  const readerBook = useReaderStore((s) => s.book);

  const navItems = [
    { to: '/', icon: Library, label: t('nav_library') },
    { to: '/search', icon: Search, label: t('nav_search') },
    { to: '/downloads', icon: Download, label: t('nav_downloads') },
    { to: '/stats', icon: BarChart2, label: t('nav_stats') },
    { to: '/settings', icon: Settings, label: t('nav_settings') },
  ];

  async function handleLogout() {
    try {
      await authService.logout();
    } catch {
      /* ignore */
    }
    logout();
    router.push('/login');
  }

  function isActive(to: string) {
    if (to === '/') return pathname === '/';
    return (pathname ?? '').startsWith(to);
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-surface-base">
      {/* Sidebar — desktop only */}
      <aside className="hidden md:flex w-52 flex-shrink-0 bg-surface-sidebar border-r border-surface-border flex-col">
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 h-14 border-b border-surface-border flex-shrink-0">
          <div className="w-7 h-7 flex-shrink-0">
            <Image src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/logo.png`} alt="Omnibus" width={40} height={40} priority />
          </div>

          <span className="text-sm font-bold text-ink tracking-tight">Omnibus</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-2 px-2 space-y-0.5 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => {
            const active = isActive(to);
            return (
              <Link
                key={to}
                href={to}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  active
                    ? 'bg-indigo-500/15 text-indigo-300'
                    : 'text-ink-dim hover:text-ink hover:bg-surface-elevated'
                }`}
              >
                <span
                  className={`w-7 h-7 flex items-center justify-center rounded-md flex-shrink-0 transition-colors ${
                    active ? 'bg-indigo-500/20 text-indigo-400' : 'text-current'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </span>
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom — user + logout */}
        {authEnabled && (
          <div className="p-2 border-t border-surface-border">
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg mb-0.5">
              <div className="w-6 h-6 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
                <span className="text-[10px] font-bold text-indigo-400 leading-none">
                  {(user?.username || 'U')[0].toUpperCase()}
                </span>
              </div>
              <span className="text-xs text-ink-muted truncate">{user?.username}</span>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-ink-dim hover:text-red-400 hover:bg-red-500/10 w-full transition-colors"
            >
              <span className="w-7 h-7 flex items-center justify-center flex-shrink-0">
                <LogOut className="w-3.5 h-3.5" />
              </span>
              {t('nav_logout')}
            </button>
          </div>
        )}
      </aside>

      {/* Main content + player — relative container for absolute PlayerBar */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <main className="flex-1 overflow-auto">
          <div className={`min-h-full p-4 md:p-6 pb-20 md:pb-6`}>{children}</div>
        </main>

        <PlayerBar />
        <Toaster />
        {readerBook && <ReaderModal />}
      </div>

      {/* Bottom nav — mobile only */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-surface-sidebar border-t border-surface-border flex items-center justify-around h-16 z-30">
        {navItems.map(({ to, icon: Icon, label }) => {
          const active = isActive(to);
          return (
            <Link
              key={to}
              href={to}
              className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors ${
                active ? 'text-indigo-400' : 'text-ink-dim'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
        {authEnabled && (
          <button
            onClick={handleLogout}
            className="flex flex-col items-center justify-center gap-1 flex-1 h-full text-ink-dim hover:text-red-400 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-[10px] font-medium">{t('nav_logout')}</span>
          </button>
        )}
      </nav>
    </div>
  );
}
