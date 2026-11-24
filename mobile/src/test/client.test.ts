import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { client, get, messageOf, post } from '@/api/client';
import { apiUrlProblem } from '@/config';
import { tokenStore } from '@/auth/tokenStore';

jest.mock('@/config', () => ({
  apiBaseUrl: () => 'http://127.0.0.1:5000',
  apiUrlProblem: jest.fn(() => null),
}));

const urlProblem = apiUrlProblem as unknown as jest.Mock;

function authorization(config: { headers?: unknown }) {
  const headers = config.headers as { get?: (name: string) => unknown } | undefined;
  const value = headers?.get?.('Authorization');
  return typeof value === 'string' ? value : '';
}

describe('API client', () => {
  let http: MockAdapter;

  beforeEach(() => {
    http = new MockAdapter(client);
    jest.spyOn(tokenStore, 'getAccess').mockResolvedValue(null);
    jest.spyOn(tokenStore, 'getRefresh').mockResolvedValue(null);
    jest.spyOn(tokenStore, 'save').mockResolvedValue();
    jest.spyOn(tokenStore, 'clear').mockResolvedValue();
    urlProblem.mockReset();
    urlProblem.mockReturnValue(null);
  });

  afterEach(() => {
    http.restore();
    jest.restoreAllMocks();
  });

  it('reports a network failure', async () => {
    http.onGet('/api/health').networkError();
    await expect(get('/api/health')).rejects.toMatchObject({ status: 0 });
    try {
      await get('/api/health');
    } catch (error) {
      expect(messageOf(error)).toBe('Cannot reach the clinic server. Check the API address and that the server is running.');
    }
  });

  it('surfaces forbidden and expired responses', async () => {
    jest.mocked(tokenStore.getAccess).mockResolvedValue('expired');
    jest.mocked(tokenStore.getRefresh).mockResolvedValue(null);
    const expired = jest.fn();
    const { setSessionExpiredHandler } = require('@/api/client') as typeof import('@/api/client');
    setSessionExpiredHandler(expired);
    http.onGet('/api/patients').reply(403, { message: 'You do not have access to that' });
    await expect(get('/api/patients')).rejects.toMatchObject({ status: 403, message: 'You do not have access to that' });

    http.onGet('/api/shelves').reply(401, { message: 'Sign in to continue' });
    await expect(get('/api/shelves')).rejects.toMatchObject({ status: 401, message: 'Sign in to continue' });
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('refreshes once after a 401 and retries with the new access token', async () => {
    jest.mocked(tokenStore.getAccess).mockResolvedValueOnce('expired').mockResolvedValue('next-access');
    jest.mocked(tokenStore.getRefresh).mockResolvedValue('refresh-token');
    const refresh = jest.spyOn(axios, 'post').mockResolvedValue({
      data: { accessToken: 'next-access', refreshToken: 'next-refresh' },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: { headers: {} },
    });
    http.onGet('/api/inventory/stock').reply((config) => {
      if (authorization(config).includes('next-access')) return [200, { stock: [] }];
      return [401, { message: 'Sign in to continue' }];
    });
    await expect(get('/api/inventory/stock')).resolves.toEqual({ stock: [] });
    expect(tokenStore.save).toHaveBeenCalledWith('next-access', 'next-refresh');
    expect(refresh).toHaveBeenCalledWith(
      'http://127.0.0.1:5000/api/auth/refresh',
      null,
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Pharmavision-Client': 'mobile',
          'X-Refresh-Token': 'refresh-token',
        }),
      })
    );
  });

  it('does not refresh a failed login, and blocks a call when the API address is missing', async () => {
    const refresh = jest.spyOn(axios, 'post');
    http.onPost('/api/auth/login').reply(401, { message: 'Email or password is incorrect' });
    await expect(post('/api/auth/login', { email: 'a@b.c', password: 'nope' })).rejects.toMatchObject({
      status: 401,
      message: 'Email or password is incorrect',
    });
    expect(refresh).not.toHaveBeenCalled();
    expect(tokenStore.clear).not.toHaveBeenCalled();

    urlProblem.mockReturnValue('Set EXPO_PUBLIC_API_URL in mobile/.env to the clinic API address, then restart Expo.');
    const { ApiError } = require('@/api/client') as typeof import('@/api/client');
    await expect(get('/api/health')).rejects.toBeInstanceOf(ApiError);
  });
});
