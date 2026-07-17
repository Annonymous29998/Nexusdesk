import { useEffect } from 'react';
import { useUiStore } from '@/stores/ui';
import { useThemeStore } from '@/stores/theme';

export function useKeyboardShortcuts() {
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if (meta && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }

      if (typing) return;

      if (meta && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        toggleSidebar();
      }

      if (meta && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        toggleTheme();
      }

      if (event.key === '?' && !meta) {
        setCommandPaletteOpen(true);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setCommandPaletteOpen, toggleSidebar, toggleTheme]);
}
