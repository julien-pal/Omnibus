'use client';
import { create } from 'zustand';

export type SyncPref = 'ask' | 'sync' | 'ignore';

const LS_KEY = 'omnibus_sync_pref';

function loadPref(): SyncPref {
  if (typeof window === 'undefined') return 'ask';
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v === 'sync' || v === 'ignore') return v;
  } catch {}
  return 'ask';
}

interface SyncPrefState {
  pref: SyncPref;
  setPref: (pref: SyncPref) => void;
}

export const useSyncPrefStore = create<SyncPrefState>((set) => ({
  pref: loadPref(),
  setPref: (pref) => {
    set({ pref });
    try {
      localStorage.setItem(LS_KEY, pref);
    } catch {}
  },
}));
