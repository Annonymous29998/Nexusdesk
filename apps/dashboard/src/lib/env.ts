export const env = {
  apiUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:4000',
  wsUrl: resolveWsUrl(
    import.meta.env.VITE_API_URL ?? 'http://localhost:4000',
    import.meta.env.VITE_WS_URL ?? 'ws://localhost:4000',
  ),
  demoMode: (import.meta.env.VITE_DEMO_MODE ?? 'auto') as 'auto' | 'force' | 'off',
};

/**
 * WebSockets must hit the API host directly — Vercel cannot proxy long-lived /ws streams.
 * Rewrites www/apex WS URLs to api.{domain} automatically so a stale VITE_WS_URL still works.
 */
function resolveWsUrl(apiUrl: string, configuredWs: string): string {
  const trimmed = configuredWs.replace(/\/$/, '');
  const endpoint = trimmed.endsWith('/ws') ? trimmed : `${trimmed}/ws`;

  try {
    const wsHost = new URL(endpoint).hostname;
    const apiHost = new URL(apiUrl.replace(/\/api\/?$/, '')).hostname;
    const isFrontendWs =
      wsHost === apiHost ||
      (/^(www\.)?nesuxdesk\.xyz$/i.test(wsHost) && !wsHost.startsWith('api.'));
    if (isFrontendWs) {
      const root = apiHost.replace(/^www\./, '');
      if (root.includes('.')) {
        return `wss://api.${root}/ws`;
      }
    }
  } catch {
    /* ignore malformed URLs in dev */
  }

  return endpoint;
}

export function getWsUrl(): string {
  return env.wsUrl;
}

/** WebSocket path for the API gateway (avoids /ws/ws when VITE_WS_URL already ends with /ws). */
export function getWsEndpoint(): string {
  const base = env.wsUrl.replace(/\/$/, '');
  return base.endsWith('/ws') ? base : `${base}/ws`;
}
