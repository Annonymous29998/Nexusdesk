import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { AppCommandPalette } from '@/components/layout/CommandPalette';
import { NotificationsPanel } from '@/components/layout/NotificationsPanel';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useUiStore } from '@/stores/ui';
import { cn } from '@/lib/utils';

export function AppShell() {
  useKeyboardShortcuts();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);

  return (
    <div className="relative flex h-dvh min-h-0 overflow-hidden bg-background font-mono text-foreground">
      <div className="nd-atmosphere" aria-hidden />
      <Sidebar />
      <div
        className={cn(
          'relative flex min-h-0 min-w-0 flex-1 flex-col transition-[padding] duration-150',
          collapsed ? 'lg:pl-[72px]' : 'lg:pl-64',
        )}
      >
        <Topbar />
        <main className="page-enter min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto max-w-7xl px-3 py-4 lg:px-5 lg:py-5">
            <Outlet />
          </div>
        </main>
        <footer className="tui-footer">
          <span className="text-primary">F1</span> Help
          <span className="text-muted-foreground">·</span>
          <span className="text-primary">⌘K</span> Jump
          <span className="text-muted-foreground">·</span>
          <span className="text-primary">q</span> Quit session
          <span className="ml-auto hidden text-muted-foreground sm:inline">
            Press any key? No — use the mouse · NexusDesk TUI
          </span>
        </footer>
      </div>
      <AppCommandPalette />
      <NotificationsPanel />
    </div>
  );
}
