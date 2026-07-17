import { API_ROUTES, type ApiErrorBody } from '@nexusdesk/shared';
import type { TokenPair } from '@nexusdesk/types';
import { env } from '@/lib/env';

const ACCESS_KEY = 'nd_access_token';
const REFRESH_KEY = 'nd_refresh_token';
const ACCESS_EXP_KEY = 'nd_access_expires';
const REFRESH_EXP_KEY = 'nd_refresh_expires';
const DEMO_KEY = 'nd_demo_mode';

export class ApiClientError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody | null;

  constructor(message: string, status: number, body: ApiErrorBody | null = null) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.body = body;
  }
}

type TokenListener = (tokens: TokenPair | null) => void;

let accessToken: string | null = sessionStorage.getItem(ACCESS_KEY);
let refreshToken: string | null = localStorage.getItem(REFRESH_KEY);
let accessExpiresAt: string | null = sessionStorage.getItem(ACCESS_EXP_KEY);
let refreshExpiresAt: string | null = localStorage.getItem(REFRESH_EXP_KEY);
// When demo mode is explicitly disabled, clear any stale "force demo" flag that
// may be stuck in localStorage from a previous session so real API data is used.
if (env.demoMode === 'off') {
  localStorage.removeItem(DEMO_KEY);
  const staleAccess = sessionStorage.getItem(ACCESS_KEY);
  if (staleAccess?.startsWith('demo_')) {
    sessionStorage.removeItem(ACCESS_KEY);
    sessionStorage.removeItem(ACCESS_EXP_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(REFRESH_EXP_KEY);
    accessToken = null;
    refreshToken = null;
    accessExpiresAt = null;
    refreshExpiresAt = null;
  }
  if (localStorage.getItem('nd_org_id')?.startsWith('org_demo_')) {
    localStorage.removeItem('nd_org_id');
  }
}
let demoForced =
  env.demoMode === 'force' ||
  (env.demoMode !== 'off' && localStorage.getItem(DEMO_KEY) === '1');
let apiReachable: boolean | null = null;
let refreshPromise: Promise<TokenPair | null> | null = null;
const listeners = new Set<TokenListener>();

export function isDemoMode(): boolean {
  // An explicit "off" always wins, regardless of any stored/forced flag.
  if (env.demoMode === 'off') return false;
  if (env.demoMode === 'force' || demoForced) return true;
  return apiReachable === false;
}

export function setDemoMode(enabled: boolean) {
  demoForced = enabled;
  if (enabled) localStorage.setItem(DEMO_KEY, '1');
  else localStorage.removeItem(DEMO_KEY);
}

export function getStoredTokens(): TokenPair | null {
  if (!accessToken || !refreshToken || !accessExpiresAt || !refreshExpiresAt) return null;
  return {
    accessToken,
    refreshToken,
    accessExpiresAt,
    refreshExpiresAt,
    tokenType: 'Bearer',
  };
}

export function setTokens(tokens: TokenPair | null) {
  if (!tokens) {
    accessToken = null;
    refreshToken = null;
    accessExpiresAt = null;
    refreshExpiresAt = null;
    sessionStorage.removeItem(ACCESS_KEY);
    sessionStorage.removeItem(ACCESS_EXP_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(REFRESH_EXP_KEY);
  } else {
    accessToken = tokens.accessToken;
    refreshToken = tokens.refreshToken;
    accessExpiresAt = tokens.accessExpiresAt;
    refreshExpiresAt = tokens.refreshExpiresAt;
    sessionStorage.setItem(ACCESS_KEY, tokens.accessToken);
    sessionStorage.setItem(ACCESS_EXP_KEY, tokens.accessExpiresAt);
    localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
    localStorage.setItem(REFRESH_EXP_KEY, tokens.refreshExpiresAt);
  }
  listeners.forEach((fn) => fn(tokens));
}

export function onTokensChange(listener: TokenListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAccessToken(): string | null {
  return accessToken;
}

async function probeApi(): Promise<boolean> {
  if (env.demoMode === 'force') {
    apiReachable = false;
    return false;
  }
  if (env.demoMode === 'off') {
    apiReachable = true;
    return true;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`${env.apiUrl}${API_ROUTES.health}`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timer);
    apiReachable = res.ok || res.status < 500;
    return apiReachable;
  } catch {
    apiReachable = false;
    return false;
  }
}

let probePromise: Promise<boolean> | null = null;

export async function ensureApiMode(): Promise<boolean> {
  if (apiReachable !== null && env.demoMode === 'auto' && !demoForced) {
    return apiReachable;
  }
  if (!probePromise) {
    probePromise = probeApi().finally(() => {
      probePromise = null;
    });
  }
  return probePromise;
}

async function refreshAccessToken(): Promise<TokenPair | null> {
  if (!refreshToken) return null;
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${env.apiUrl}${API_ROUTES.auth.refresh}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        setTokens(null);
        return null;
      }
      const data = (await res.json()) as { tokens: TokenPair } | TokenPair;
      const tokens = 'tokens' in data ? data.tokens : data;
      setTokens(tokens);
      return tokens;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  auth?: boolean;
  orgId?: string;
  skipRefresh?: boolean;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  await ensureApiMode();

  if (isDemoMode()) {
    throw new ApiClientError('DEMO_FALLBACK', 0, null);
  }

  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  const useAuth = options.auth !== false;
  if (useAuth && accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }
  if (options.orgId) {
    headers.set('X-Organization-Id', options.orgId);
  }

  const url = path.startsWith('http') ? path : `${env.apiUrl}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    apiReachable = false;
    throw new ApiClientError(
      error instanceof Error ? error.message : 'Network error',
      0,
      null,
    );
  }

  if (res.status === 401 && useAuth && !options.skipRefresh) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return apiRequest<T>(path, { ...options, skipRefresh: true });
    }
    setTokens(null);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;

  if (!res.ok) {
    const body = data as ApiErrorBody | null;
    throw new ApiClientError(body?.message ?? res.statusText, res.status, body);
  }

  return data as T;
}

export async function withDemoFallback<T>(
  live: () => Promise<T>,
  demo: () => T | Promise<T>,
): Promise<T> {
  await ensureApiMode();
  if (isDemoMode()) {
    return demo();
  }
  // Explicit off: never silently invent demo sessions (that orphaned the UI on org_demo_*).
  if (env.demoMode === 'off') {
    return live();
  }
  try {
    return await live();
  } catch (error) {
    if (error instanceof ApiClientError && (error.status === 0 || error.message === 'DEMO_FALLBACK')) {
      apiReachable = false;
      return demo();
    }
    throw error;
  }
}

export function delay(ms = 180): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
