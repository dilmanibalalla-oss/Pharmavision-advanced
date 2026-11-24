import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import { apiBaseUrl, apiUrlProblem } from '@/config';
import { tokenStore } from '@/auth/tokenStore';

const MOBILE_CLIENT = 'mobile';

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function messageOf(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return 'The clinic server could not finish that request';
}

type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean };

let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler;
}

function serverMessage(error: AxiosError) {
  const data = error.response?.data;
  if (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string' && data.message) {
    return data.message;
  }
  if (!error.response || error.code === 'ERR_NETWORK') {
    return 'Cannot reach the clinic server. Check the API address and that the server is running.';
  }
  return 'The clinic server rejected that request';
}

let refreshTask: Promise<string | null> | null = null;

async function refreshAccessToken() {
  const refreshToken = await tokenStore.getRefresh();
  if (!refreshToken || apiUrlProblem()) return null;
  try {
    const response = await axios.post(`${apiBaseUrl()}/api/auth/refresh`, null, {
      timeout: 20000,
      headers: {
        Accept: 'application/json',
        'X-Pharmavision-Client': MOBILE_CLIENT,
        'X-Refresh-Token': refreshToken,
      },
    });
    const accessToken = response.data?.accessToken;
    const nextRefresh = response.data?.refreshToken;
    if (typeof accessToken !== 'string' || typeof nextRefresh !== 'string') {
      await tokenStore.clear();
      return null;
    }
    await tokenStore.save(accessToken, nextRefresh);
    return accessToken;
  } catch {
    await tokenStore.clear();
    return null;
  }
}

export const client = axios.create({
  timeout: 20000,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-Pharmavision-Client': MOBILE_CLIENT,
  },
});

client.interceptors.request.use(async (config) => {
  const problem = apiUrlProblem();
  if (problem) throw new ApiError(problem, 0);
  config.baseURL = apiBaseUrl();
  const accessToken = await tokenStore.getAccess();
  if (accessToken) config.headers.set('Authorization', `Bearer ${accessToken}`);
  return config;
});

client.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (error instanceof ApiError) throw error;
    if (!axios.isAxiosError(error)) throw error;
    const original = error.config as RetryConfig | undefined;
    const status = error.response?.status;
    const path = original?.url ?? '';
    const skipRefresh =
      path.includes('/api/auth/login') ||
      path.includes('/api/auth/refresh') ||
      path.includes('/api/auth/logout');
    if (status === 401 && original && !original._retry && !skipRefresh) {
      original._retry = true;
      refreshTask ??= refreshAccessToken().finally(() => {
        refreshTask = null;
      });
      const accessToken = await refreshTask;
      if (accessToken) {
        original.headers.set('Authorization', `Bearer ${accessToken}`);
        return client.request(original);
      }
      onSessionExpired?.();
    }
    throw new ApiError(serverMessage(error), status ?? 0);
  }
);

export async function get<T>(url: string, config?: AxiosRequestConfig) {
  const response = await client.get<T>(url, config);
  return response.data;
}

export async function post<T>(url: string, body?: unknown, config?: AxiosRequestConfig) {
  const response = await client.post<T>(url, body ?? {}, config);
  return response.data;
}

export async function patch<T>(url: string, body?: unknown, config?: AxiosRequestConfig) {
  const response = await client.patch<T>(url, body ?? {}, config);
  return response.data;
}
