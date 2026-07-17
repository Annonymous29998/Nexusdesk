/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_WS_URL: string;
  readonly VITE_DEMO_MODE: 'auto' | 'force' | 'off';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
