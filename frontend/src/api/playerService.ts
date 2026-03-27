import apiClient from './client';
import type { Chapter, ProgressEntry } from '@/types';

export const playerService = {
  getProgress(bookPath: string) {
    return apiClient.get<ProgressEntry | null>(
      `/player/progress?bookPath=${encodeURIComponent(bookPath)}`,
    );
  },

  getAllProgress() {
    return apiClient.get<Record<string, ProgressEntry>>('/player/progress/all');
  },

  updateProgress(data: {
    bookPath: string;
    position?: number;
    fileIndex?: number;
    percentage?: number;
    chapterTitle?: string;
    updatedAt?: number;
  }) {
    return apiClient.patch('/player/progress', data);
  },

  markComplete(bookPath: string) {
    return apiClient.post('/player/complete', { bookPath });
  },

  getChapters(filePath: string) {
    return apiClient.get<Chapter[]>(`/player/chapters?path=${encodeURIComponent(filePath)}`);
  },
};
