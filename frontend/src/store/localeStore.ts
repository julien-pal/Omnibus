import { create } from 'zustand';
import type { Locale } from '../i18n';

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const useLocaleStore = create<LocaleState>((set) => ({
  locale:
    typeof window !== 'undefined'
      ? ((localStorage.getItem('omnibus_locale') as Locale | null) ?? 'en')
      : 'en',
  setLocale: (locale) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('omnibus_locale', locale);
    }
    set({ locale });
  },
}));
