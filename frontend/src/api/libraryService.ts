import apiClient from './client';
import type { BookMetadata, Library, LibraryScanResult, ScannerBook } from '@/types';

interface LibrariesResponse {
  ebook: Library[];
  audiobook: Library[];
  mixed: Library[];
}

export const libraryService = {
  getAll() {
    return apiClient.get<LibrariesResponse>('/library');
  },

  getBooks(libraryId: string) {
    return apiClient.get<LibraryScanResult>(`/library/${libraryId}`);
  },

  scan(libraryId: string) {
    return apiClient.get(`/library/${libraryId}/scan`);
  },

  getSuggestions() {
    return apiClient.get<{ authors: string[]; series: string[]; narrators: string[] }>(
      '/library/suggestions',
    );
  },

  searchMetadata(params: Record<string, string>) {
    return apiClient.get<BookMetadata[]>('/library/metadata/search', { params });
  },

  getSeriesBooks(params: { seriesTitle: string; author?: string; type: string }) {
    return apiClient.get<BookMetadata[]>('/library/metadata/series', { params });
  },

  updateBook(data: Record<string, unknown>) {
    return apiClient.put('/library/metadata/book', data);
  },

  deleteBook(path: string, deleteFiles: boolean) {
    return apiClient.delete('/library/book', { data: { path, deleteFiles } });
  },

  deleteBooks(paths: Array<string | { path: string }>, deleteFiles: boolean) {
    return apiClient.delete('/library/book', { data: { paths, deleteFiles } });
  },

  addToWishlist(libraryId: string, metadata: BookMetadata) {
    return apiClient.post('/library/wishlist', { libraryId, metadata });
  },

  sendToReader(bookPath: string) {
    return apiClient.post<{ ok: boolean; error?: string }>('/library/send-to-reader', { bookPath });
  },

  getReadLater() {
    return apiClient.get<ScannerBook[]>('/library/read-later');
  },
};
