import apiClient from './client';

interface SyncResult {
  audioSeconds?: number;
  fileIndex?: number;
  fileSeconds?: number;
  percentage?: number;
  confidence: string;
}

export const syncService = {
  ebookToAudio(data: { bookPath: string; ebookPct?: number; cfi?: string }) {
    return apiClient.post<SyncResult>('/sync/ebook-to-audio', data);
  },

  audioToEbook(data: { bookPath: string; audioSeconds: number; fileIndex?: number }) {
    return apiClient.post('/sync/audio-to-ebook', data);
  },

  buildTranscript(data: {
    bookPath: string;
    audioFiles: Array<string | { path: string }>;
    epubPath?: string;
  }) {
    return apiClient.post('/sync/build-transcript', data);
  },

  getTranscriptStatus(bookPath: string) {
    return apiClient.get(`/sync/transcript-status?bookPath=${encodeURIComponent(bookPath)}`);
  },

  getActiveBuilds() {
    return apiClient.get('/sync/active-builds');
  },

  getTranscriptProgress(bookPath: string) {
    return apiClient.get<{ current: number; total: number }>(
      `/sync/transcript-progress?bookPath=${encodeURIComponent(bookPath)}`,
    );
  },

  transcriptToEbook(data: { bookPath: string; audioSeconds: number; fileIndex?: number }) {
    return apiClient.post('/sync/transcript-to-ebook', data);
  },

  debugPositions(params: {
    bookPath: string;
    audioSeconds?: number;
    fileIndex?: number;
    cfi?: string;
  }) {
    return apiClient.get('/sync/debug-positions', { params });
  },
};
