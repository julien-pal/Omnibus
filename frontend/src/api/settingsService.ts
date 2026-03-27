import apiClient from './client';
import type { ClientConfig, ClientsConfig, IndexerConfig } from '@/types';

export interface FollowEntry {
  name: string;
  author?: string;
  format: 'ebook' | 'audiobook' | 'both';
  libraryId?: string;
}

export const settingsService = {
  // App
  getApp() {
    return apiClient.get('/settings/app');
  },
  updateApp(data: Record<string, unknown>) {
    return apiClient.put('/settings/app', data);
  },

  // Auth
  getAuth() {
    return apiClient.get('/settings/auth');
  },
  updateAuth(data: Record<string, unknown>) {
    return apiClient.put('/settings/auth', data);
  },

  // Prowlarr
  getProwlarr() {
    return apiClient.get('/settings/prowlarr');
  },
  updateProwlarr(data: { url: string; apiKey: string }) {
    return apiClient.put('/settings/prowlarr', data);
  },
  testProwlarr(data: { url: string; apiKey: string }) {
    return apiClient.post('/settings/prowlarr/test', data);
  },
  getIndexers() {
    return apiClient.get<{ indexers: IndexerConfig[] }>('/settings/prowlarr/indexers');
  },
  updateIndexers(indexers: IndexerConfig[]) {
    return apiClient.put('/settings/prowlarr/indexers', { indexers });
  },

  // Clients
  getClients() {
    return apiClient.get<ClientsConfig>('/settings/clients');
  },
  addClient(data: Omit<ClientConfig, 'id'>) {
    return apiClient.post('/settings/clients', data);
  },
  updateClient(id: string, data: Partial<ClientConfig>) {
    return apiClient.put(`/settings/clients/${id}`, data);
  },
  deleteClient(id: string) {
    return apiClient.delete(`/settings/clients/${id}`);
  },
  setActiveClient(id: string) {
    return apiClient.put('/settings/clients-active', { id });
  },
  testClient(id: string) {
    return apiClient.post(`/settings/clients/${id}/test`);
  },

  // Libraries
  getLibraries() {
    return apiClient.get('/settings/libraries');
  },
  addLibrary(data: { name: string; path: string; type: string }) {
    return apiClient.post('/settings/libraries', data);
  },
  updateLibrary(id: string, data: { name?: string; path?: string; type?: string }) {
    return apiClient.put(`/settings/libraries/${id}`, data);
  },
  deleteLibrary(id: string) {
    return apiClient.delete(`/settings/libraries/${id}`);
  },

  // Browse filesystem
  browse(params: Record<string, string>) {
    return apiClient.get('/settings/browse', { params });
  },

  // Cron
  getCron() {
    return apiClient.get('/settings/cron');
  },
  updateCron(data: Record<string, unknown>) {
    return apiClient.put('/settings/cron', data);
  },
  runCron() {
    return apiClient.post('/settings/cron/run');
  },
  dryRunCron() {
    return apiClient.post('/settings/cron/dry-run');
  },
  getCronLogs() {
    return apiClient.get('/settings/cron/logs');
  },

  // Import cron
  getImportCron() {
    return apiClient.get('/settings/cron/import');
  },
  updateImportCron(data: Record<string, unknown>) {
    return apiClient.put('/settings/cron/import', data);
  },
  runImportCron() {
    return apiClient.post('/settings/cron/import/run');
  },
  dryRunImportCron() {
    return apiClient.post('/settings/cron/import/dry-run');
  },
  getImportCronLogs() {
    return apiClient.get('/settings/cron/import/logs');
  },

  // Transcript cron
  getTranscriptCron() {
    return apiClient.get('/settings/cron/transcript');
  },
  updateTranscriptCron(data: Record<string, unknown>) {
    return apiClient.put('/settings/cron/transcript', data);
  },
  runTranscriptCron() {
    return apiClient.post('/settings/cron/transcript/run');
  },
  dryRunTranscriptCron() {
    return apiClient.post('/settings/cron/transcript/dry-run');
  },
  getTranscriptCronLogs() {
    return apiClient.get('/settings/cron/transcript/logs');
  },

  // Library cache rebuild cron
  getLibraryCacheCron() {
    return apiClient.get('/settings/cron/library-cache');
  },
  updateLibraryCacheCron(data: Record<string, unknown>) {
    return apiClient.put('/settings/cron/library-cache', data);
  },
  runLibraryCacheCron() {
    return apiClient.post('/settings/cron/library-cache/run');
  },
  dryRunLibraryCacheCron() {
    return apiClient.post('/settings/cron/library-cache/dry-run');
  },
  getLibraryCacheCronLogs() {
    return apiClient.get('/settings/cron/library-cache/logs');
  },

  // Follow cron
  getFollowCron() {
    return apiClient.get('/settings/cron/follow');
  },
  updateFollowCron(data: Record<string, unknown>) {
    return apiClient.put('/settings/cron/follow', data);
  },
  runFollowCron() {
    return apiClient.post('/settings/cron/follow/run');
  },
  dryRunFollowCron() {
    return apiClient.post('/settings/cron/follow/dry-run');
  },
  getFollowCronLogs() {
    return apiClient.get('/settings/cron/follow/logs');
  },

  // Follows management
  getFollows() {
    return apiClient.get<{ authors: FollowEntry[]; series: FollowEntry[] }>('/settings/follows');
  },
  followAuthor(name: string, format: string, libraryId?: string) {
    return apiClient.post('/settings/follows/author', { name, format, libraryId });
  },
  unfollowAuthor(name: string) {
    return apiClient.delete('/settings/follows/author', { data: { name } });
  },
  followSeries(name: string, author: string | undefined, format: string, libraryId?: string) {
    return apiClient.post('/settings/follows/series', { name, author, format, libraryId });
  },
  unfollowSeries(name: string) {
    return apiClient.delete('/settings/follows/series', { data: { name } });
  },

  // Whisper
  getWhisper() {
    return apiClient.get('/settings/whisper');
  },
  updateWhisper(data: Record<string, unknown>) {
    return apiClient.put('/settings/whisper', data);
  },
  testWhisper() {
    return apiClient.post('/settings/whisper/test');
  },
  getWhisperModels(params: { baseUrl: string; apiKey: string }) {
    return apiClient.get<{ models: string[] }>('/sync/whisper-models', {
      params,
      timeout: 30_000,
    });
  },
  addWhisperModel(model: string) {
    return apiClient.post('/sync/whisper-models', { model }, { timeout: 120_000 });
  },
  testWhisperConnection(params: { baseUrl: string; apiKey: string; model: string }) {
    return apiClient.get<{ ok: boolean; error?: string }>('/sync/test-whisper', { params });
  },

  // Email
  getEmailSettings() {
    return apiClient.get<{
      smtpHost: string; smtpPort: number; smtpUser: string;
      senderEmail: string; readerEmail: string; smtpPassSet: boolean;
    }>('/settings/email');
  },
  updateEmailSettings(data: {
    smtpHost?: string; smtpPort?: number; smtpUser?: string; smtpPass?: string;
    senderEmail?: string; readerEmail?: string;
  }) {
    return apiClient.put('/settings/email', data);
  },
  testEmailSettings() {
    return apiClient.post<{ ok: boolean; error?: string }>('/settings/email/test');
  },
};
