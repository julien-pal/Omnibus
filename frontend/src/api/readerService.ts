import apiClient from './client';
import type { ReaderProgressEntry } from '@/types';

export const readerService = {
  getProgress(bookPath: string) {
    return apiClient.get<ReaderProgressEntry | null>(
      `/reader/progress?bookPath=${encodeURIComponent(bookPath)}`,
    );
  },

  getAllProgress() {
    return apiClient.get<Record<string, ReaderProgressEntry>>('/reader/progress/all');
  },

  updateProgress(data: {
    bookPath: string;
    cfi?: string;
    percentage?: number;
    chapterTitle?: string;
    snippet?: string;
    updatedAt?: number;
    epubPath?: string;
  }) {
    return apiClient.patch('/reader/progress', data);
  },

  markComplete(bookPath: string) {
    return apiClient.post('/reader/complete', { bookPath });
  },
};
