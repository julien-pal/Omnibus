import apiClient from './client';
import type { DownloadEntry } from '@/types';

export const downloadService = {
  getAll() {
    return apiClient.get<DownloadEntry[]>('/downloads');
  },

  add(payload: {
    url: string;
    type: string;
    metadata?: Record<string, unknown>;
    metadataPath?: string;
    clientId?: string;
  }) {
    return apiClient.post('/downloads', payload);
  },

  organize(id: string) {
    return apiClient.post(`/downloads/${id}/organize`);
  },

  remove(id: string) {
    return apiClient.delete(`/downloads/${id}`);
  },
};
