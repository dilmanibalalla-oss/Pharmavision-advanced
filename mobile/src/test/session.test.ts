import * as SecureStore from 'expo-secure-store';
import { ApiError, get, post } from '@/api/client';
import { tokenStore } from '@/auth/tokenStore';
import { authService } from '@/auth/service';
import { useAuthStore } from '@/store/authStore';

jest.mock('@/api/client', () => {
  const actual = jest.requireActual('@/api/client') as typeof import('@/api/client');
  return {
    ...actual,
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  };
});

const mockedGet = get as jest.MockedFunction<typeof get>;
const mockedPost = post as jest.MockedFunction<typeof post>;

const user = {
  _id: 'user-1',
  name: 'Clinic admin',
  email: 'admin@helio.local',
  role: 'ADMIN',
  active: true,
};

describe('token storage', () => {
  it('stores only the access and refresh tokens under the app keys', async () => {
    await tokenStore.save('access-token', 'refresh-token');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('pharmavision.access', 'access-token');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('pharmavision.refresh', 'refresh-token');
    expect(await tokenStore.getAccess()).toBe('access-token');
    expect(await tokenStore.getRefresh()).toBe('refresh-token');
    await tokenStore.clear();
    expect(await tokenStore.getAccess()).toBeNull();
    expect(await tokenStore.getRefresh()).toBeNull();
  });
});

describe('login and logout', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedPost.mockReset();
    useAuthStore.setState({ status: 'booting', user: null, error: '' });
  });

  it('saves the mobile session and signs in', async () => {
    mockedPost.mockResolvedValue({ user, accessToken: 'access-token', refreshToken: 'refresh-token' });
    await useAuthStore.getState().login(' Ada@Helio.local ', 'correct-password');
    expect(mockedPost).toHaveBeenCalledWith('/api/auth/login', {
      email: 'ada@helio.local',
      password: 'correct-password',
    });
    expect(await tokenStore.getAccess()).toBe('access-token');
    expect(useAuthStore.getState().status).toBe('signedIn');
    expect(useAuthStore.getState().user?.role).toBe('ADMIN');
  });

  it('refuses a login body that has no mobile tokens', async () => {
    mockedPost.mockResolvedValue({ user });
    await expect(authService.login('ada@helio.local', 'correct-password')).rejects.toThrow(/mobile session/);
    expect(await tokenStore.getAccess()).toBeNull();
  });

  it('clears stored tokens on logout even when the server cannot be reached', async () => {
    await tokenStore.save('access-token', 'refresh-token');
    mockedPost.mockRejectedValue(new Error('Cannot reach the clinic server. Check the API address and that the server is running.'));
    await useAuthStore.getState().logout();
    expect(mockedPost).toHaveBeenCalledWith('/api/auth/logout', {}, { headers: { 'X-Refresh-Token': 'refresh-token' } });
    expect(await tokenStore.getAccess()).toBeNull();
    expect(useAuthStore.getState().status).toBe('signedOut');
  });

  it('keeps the splash up when restore cannot reach the server, and signs out on 401', async () => {
    await tokenStore.save('access-token', 'refresh-token');
    mockedGet.mockRejectedValue(new ApiError('Cannot reach the clinic server. Check the API address and that the server is running.', 0));
    await useAuthStore.getState().restore();
    expect(useAuthStore.getState().status).toBe('booting');
    expect(useAuthStore.getState().error).toMatch(/Cannot reach/);

    mockedGet.mockRejectedValue(new ApiError('Sign in to continue', 401));
    await useAuthStore.getState().restore();
    expect(useAuthStore.getState().status).toBe('signedOut');
    expect(useAuthStore.getState().user).toBeNull();
  });
});
