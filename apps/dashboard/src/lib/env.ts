export const env = {
  apiUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:4000',
  wsUrl: import.meta.env.VITE_WS_URL ?? 'ws://localhost:4000',
  demoMode: (import.meta.env.VITE_DEMO_MODE ?? 'auto') as 'auto' | 'force' | 'off',
};

export function getWsUrl(): string {
  return env.wsUrl;
}
