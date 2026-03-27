import apiClient from './client';

export const authService = {
  login(username: string, password: string) {
    return apiClient.post<{ token: string; user: { username: string; role: string } }>(
      '/auth/login',
      { username, password },
    );
  },

  logout() {
    return apiClient.post('/auth/logout');
  },

  me() {
    return apiClient.get<{ user: { username: string; role: string }; authEnabled: boolean }>(
      '/auth/me',
    );
  },
};
