import apiClient from './client';

export interface StatsGenreEntry {
  genre: string;
  count: number;
}

export interface StatsLanguageEntry {
  language: string;
  count: number;
}

export interface StatsYearEntry {
  year: string;
  count: number;
}

export interface LibraryStats {
  totalBooks: number;
  totalEbooks: number;
  totalAudiobooks: number;
  totalMixed: number;
  totalSeries: number;
  totalAuthors: number;
  booksCompleted: number;
  booksInProgress: number;
  booksWishlist: number;
  totalListeningSeconds: number;
  listeningHours: number;
  listeningMinutes: number;
  totalSize: number;
  totalSizeFormatted: string;
  byGenre: StatsGenreEntry[];
  byLanguage: StatsLanguageEntry[];
  byYear: StatsYearEntry[];
}

export const statsService = {
  getStats() {
    return apiClient.get<LibraryStats>('/stats');
  },
};
