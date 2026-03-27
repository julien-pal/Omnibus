import apiClient from './client';
import type { SearchResult } from '@/types';

export const searchService = {
  search(params: {
    query?: string;
    author?: string;
    title?: string;
    series?: string;
    type?: string;
    indexerIds?: number[];
  }) {
    return apiClient.post<{ results: SearchResult[] }>('/search', params);
  },
};
