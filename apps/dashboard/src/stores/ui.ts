import { create } from 'zustand';

interface UiState {
  sidebarCollapsed: boolean;
  commandPaletteOpen: boolean;
  notificationsOpen: boolean;
  mobileNavOpen: boolean;
  setSidebarCollapsed: (value: boolean) => void;
  toggleSidebar: () => void;
  setCommandPaletteOpen: (value: boolean) => void;
  setNotificationsOpen: (value: boolean) => void;
  setMobileNavOpen: (value: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  commandPaletteOpen: false,
  notificationsOpen: false,
  mobileNavOpen: false,
  setSidebarCollapsed: (value) => set({ sidebarCollapsed: value }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setCommandPaletteOpen: (value) => set({ commandPaletteOpen: value }),
  setNotificationsOpen: (value) => set({ notificationsOpen: value }),
  setMobileNavOpen: (value) => set({ mobileNavOpen: value }),
}));
