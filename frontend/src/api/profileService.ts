import apiClient from './client';

export interface ProfileInfo {
  id: string;
  name: string;
  role: 'admin' | 'user';
  hasPassword: boolean;
}

export const profileService = {
  getProfiles() {
    return apiClient.get<{ profiles: ProfileInfo[] }>('/profiles');
  },

  selectProfile(profileId: string, password?: string) {
    return apiClient.post<{ token: string; profile: { id: string; name: string; role: string } }>(
      '/profiles/select',
      { profileId, ...(password ? { password } : {}) },
    );
  },

  getCurrentProfile() {
    return apiClient.get<{ profile: { id: string; name: string; role: string } | null }>(
      '/profiles/current',
    );
  },

  createProfile(data: { name: string; role: string; password?: string }) {
    return apiClient.post<ProfileInfo>('/profiles', data);
  },

  updateProfile(id: string, data: { name?: string; role?: string; password?: string; removePassword?: boolean }) {
    return apiClient.put<ProfileInfo>(`/profiles/${id}`, data);
  },

  deleteProfile(id: string) {
    return apiClient.delete(`/profiles/${id}`);
  },
};
