import { create } from 'zustand';
import { DownloadEntry, ClientsConfig, ProwlarrConfig, Library, SearchResult } from '../types';

interface User {
  username: string;
  role: string;
  profileId?: string;
}

interface SearchParams {
  query: string;
  author: string;
  title: string;
  series: string;
  type: string;
  indexerIds: number[];
}

interface LibrariesConfig {
  ebook: Library[];
  audiobook: Library[];
  mixed: Library[];
}

interface StoreState {
  // Auth
  token: string | null;
  user: User | null;
  authEnabled: boolean;
  profileId: string | null;
  profileName: string | null;
  setToken: (token: string | null) => void;
  setUser: (user: User | null) => void;
  setAuthEnabled: (enabled: boolean) => void;
  setProfile: (id: string | null, name: string | null) => void;
  logout: () => void;

  // Search
  searchResults: SearchResult[];
  searchLoading: boolean;
  searchError: string | null;
  lastSearchParams: SearchParams | null;
  setSearchResults: (results: SearchResult[]) => void;
  setSearchLoading: (loading: boolean) => void;
  setSearchError: (error: string | null) => void;
  setLastSearchParams: (params: SearchParams | null) => void;

  // Downloads
  downloads: DownloadEntry[];
  setDownloads: (downloads: DownloadEntry[]) => void;
  addDownload: (dl: DownloadEntry) => void;
  removeDownload: (id: string) => void;

  // Settings cache
  prowlarrConfig: ProwlarrConfig | null;
  setProwlarrConfig: (cfg: ProwlarrConfig | null) => void;
  clientsConfig: ClientsConfig | null;
  setClientsConfig: (cfg: ClientsConfig | null) => void;
  librariesConfig: LibrariesConfig | null;
  setLibrariesConfig: (cfg: LibrariesConfig | null) => void;
  syncEnabled: boolean;
  setSyncEnabled: (v: boolean) => void;
}

const useStore = create<StoreState>((set) => ({
  // Auth — read localStorage lazily (safe for SSR)
  token: typeof window !== 'undefined' ? localStorage.getItem('omnibus_token') || null : null,
  user: null,
  authEnabled: false,
  profileId: typeof window !== 'undefined' ? localStorage.getItem('omnibus_profile_id') || null : null,
  profileName: typeof window !== 'undefined' ? localStorage.getItem('omnibus_profile_name') || null : null,

  setToken: (token) => {
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem('omnibus_token', token);
      } else {
        localStorage.removeItem('omnibus_token');
      }
    }
    set({ token });
  },

  setUser: (user) => set({ user }),
  setAuthEnabled: (enabled) => set({ authEnabled: enabled }),

  setProfile: (id, name) => {
    if (typeof window !== 'undefined') {
      if (id) {
        localStorage.setItem('omnibus_profile_id', id);
        localStorage.setItem('omnibus_profile_name', name || '');
      } else {
        localStorage.removeItem('omnibus_profile_id');
        localStorage.removeItem('omnibus_profile_name');
      }
    }
    set({ profileId: id, profileName: name });
  },

  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('omnibus_token');
      localStorage.removeItem('omnibus_profile_id');
      localStorage.removeItem('omnibus_profile_name');
    }
    set({ token: null, user: null, profileId: null, profileName: null });
  },

  // Search
  searchResults: [],
  searchLoading: false,
  searchError: null,
  lastSearchParams: null,
  setSearchResults: (results) => set({ searchResults: results }),
  setSearchLoading: (loading) => set({ searchLoading: loading }),
  setSearchError: (error) => set({ searchError: error }),
  setLastSearchParams: (params) => set({ lastSearchParams: params }),

  // Downloads
  downloads: [],
  setDownloads: (downloads) => set({ downloads }),
  addDownload: (dl) => set((state) => ({ downloads: [dl, ...state.downloads] })),
  removeDownload: (id) =>
    set((state) => ({ downloads: state.downloads.filter((d) => d.id !== id) })),

  // Settings cache
  prowlarrConfig: null,
  setProwlarrConfig: (cfg) => set({ prowlarrConfig: cfg }),
  clientsConfig: null,
  setClientsConfig: (cfg) => set({ clientsConfig: cfg }),
  librariesConfig: null,
  setLibrariesConfig: (cfg) => set({ librariesConfig: cfg }),
  syncEnabled: true,
  setSyncEnabled: (v) => set({ syncEnabled: v }),
}));

export default useStore;
