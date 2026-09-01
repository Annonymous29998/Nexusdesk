export const env = {
  apiUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:4000',
  wsUrl: import.meta.env.VITE_WS_URL ?? 'ws://localhost:4000',
  demoMode: (import.meta.env.VITE_DEMO_MODE ?? 'auto') as 'auto' | 'force' | 'off',
};

export function getWsUrl(): string {
  return env.wsUrl;
}

/** WebSocket path for the API gateway (avoids /ws/ws when VITE_WS_URL already ends with /ws). */
export function getWsEndpoint(): string {
  const base = env.wsUrl.replace(/\/$/, '');
  return base.endsWith('/ws') ? base : `${base}/ws`;
}
