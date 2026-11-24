import { create } from 'zustand';
import { messageOf } from '@/api/client';
import { authService } from '@/auth/service';
import type { ClinicUser } from '@/types';

type Status = 'booting' | 'signedIn' | 'signedOut';

type AuthState = {
  status: Status;
  user: ClinicUser | null;
  error: string;
  restore: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: ClinicUser) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  status: 'booting',
  user: null,
  error: '',
  setUser: (user) => set({ user }),
  restore: async () => {
    set({ status: 'booting', error: '' });
    try {
      const user = await authService.restore();
      set(
        user
          ? { status: 'signedIn', user, error: '' }
          : { status: 'signedOut', user: null, error: '' }
      );
    } catch (error) {
      set({ status: 'booting', user: null, error: messageOf(error) });
    }
  },
  login: async (email, password) => {
    const user = await authService.login(email, password);
    set({ status: 'signedIn', user, error: '' });
  },
  logout: async () => {
    await authService.logout();
    set({ status: 'signedOut', user: null, error: '' });
  },
}));
