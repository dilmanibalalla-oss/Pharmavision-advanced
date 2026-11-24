import { ApiError, get, patch, post } from '@/api/client';
import { tokenStore } from '@/auth/tokenStore';
import type { ClinicUser, SessionResponse } from '@/types';

export const authService = {
  async login(email: string, password: string) {
    const data = await post<SessionResponse>('/api/auth/login', {
      email: email.trim().toLowerCase(),
      password,
    });
    if (!data.user || !data.accessToken || !data.refreshToken) {
      throw new ApiError('The clinic server did not start a mobile session', 500);
    }
    await tokenStore.save(data.accessToken, data.refreshToken);
    return data.user;
  },

  async restore(): Promise<ClinicUser | null> {
    const access = await tokenStore.getAccess();
    const refresh = await tokenStore.getRefresh();
    if (!access && !refresh) return null;
    try {
      const data = await get<{ user: ClinicUser }>('/api/auth/me');
      return data.user;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },

  async me() {
    const data = await get<{ user: ClinicUser }>('/api/auth/me');
    return data.user;
  },

  async updateProfile(name: string) {
    const data = await patch<{ user: ClinicUser }>('/api/auth/profile', { name: name.trim() });
    return data.user;
  },

  async changePassword(currentPassword: string, newPassword: string) {
    const data = await post<SessionResponse>('/api/auth/password', { currentPassword, newPassword });
    if (!data.user || !data.accessToken || !data.refreshToken) {
      throw new ApiError('The clinic server did not refresh the mobile session', 500);
    }
    await tokenStore.save(data.accessToken, data.refreshToken);
    return data.user;
  },

  async logout() {
    const refreshToken = await tokenStore.getRefresh();
    try {
      if (refreshToken) {
        await post('/api/auth/logout', {}, { headers: { 'X-Refresh-Token': refreshToken } });
      }
    } catch {
      // Local sign-out still stands when the server cannot be reached.
    } finally {
      await tokenStore.clear();
    }
  },
};
