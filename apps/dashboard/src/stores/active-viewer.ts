import { create } from 'zustand';

export interface MinimizedViewerSession {
  sessionId: string;
  deviceId: string;
  deviceName: string;
}

interface ActiveViewerState {
  minimized: MinimizedViewerSession | null;
  minimize: (session: MinimizedViewerSession) => void;
  clearMinimized: () => void;
}

/** Tracks a remote session that was minimized (session stays live). */
export const useActiveViewerStore = create<ActiveViewerState>((set) => ({
  minimized: null,
  minimize: (session) => set({ minimized: session }),
  clearMinimized: () => set({ minimized: null }),
}));
