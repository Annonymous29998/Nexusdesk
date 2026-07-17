import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  ChevronsUpDown,
  LogOut,
  Menu,
  Search,
} from 'lucide-react';
import { Button, Select } from '@nexusdesk/ui';
import { isDemoMode } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';

export function Topbar() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const organizations = useAuthStore((s) => s.organizations);
  const organizationId = useAuthStore((s) => s.organizationId);
  const setOrganizationId = useAuthStore((s) => s.setOrganizationId);
  const logout = useAuthStore((s) => s.logout);
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const setNotificationsOpen = useUiStore((s) => s.setNotificationsOpen);
  const setMobileNavOpen = useUiStore((s) => s.setMobileNavOpen);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  const orgOptions = useMemo(
    () => organizations.map((o) => ({ value: o.id, label: o.name })),
    [organizations],
  );

  const orgName = orgOptions.find((o) => o.value === organizationId)?.label ?? 'ORG';

  return (
    <header className="z-30 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card px-3 font-mono text-xs lg:px-4">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-none lg:hidden"
        onClick={() => setMobileNavOpen(true)}
        aria-label="Open menu"
      >
        <Menu className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="hidden h-8 w-8 rounded-none lg:inline-flex"
        onClick={toggleSidebar}
        aria-label="Toggle sidebar"
      >
        <ChevronsUpDown className="h-3.5 w-3.5 rotate-90" />
      </Button>

      <span className="tui-prompt hidden sm:inline">~/nexusdesk $</span>
      <button
        type="button"
        onClick={() => setCommandPaletteOpen(true)}
        className="hidden h-8 min-w-[180px] flex-1 items-center gap-2 border border-border bg-background px-2 text-left text-muted-foreground transition hover:border-primary/50 hover:text-primary md:flex lg:max-w-sm"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 truncate">command palette…</span>
        <kbd className="nd-kbd">⌘K</kbd>
      </button>

      <div className="ml-auto flex items-center gap-2">
        {isDemoMode() ? (
          <span className="tui-tag tui-tag-info hidden sm:inline">[ INFO ] DEMO</span>
        ) : (
          <span className="tui-tag tui-tag-ok hidden sm:inline">[ LIVE ]</span>
        )}

        <span className="hidden text-accent md:inline">{orgName}</span>

        {orgOptions.length > 0 ? (
          <div className="hidden min-w-[140px] sm:block">
            <Select
              value={organizationId ?? undefined}
              onChange={(e) => setOrganizationId(e.target.value)}
              options={orgOptions}
              aria-label="Organization"
              className="h-8 rounded-none border-border bg-background font-mono text-xs"
            />
          </div>
        ) : null}

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCommandPaletteOpen(true)}
          className="h-8 w-8 rounded-none md:hidden"
          aria-label="Search"
        >
          <Search className="h-3.5 w-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setNotificationsOpen(true)}
          className="h-8 w-8 rounded-none"
          aria-label="Notifications"
        >
          <Bell className="h-3.5 w-3.5" />
        </Button>

        <button
          type="button"
          className="hidden items-center gap-2 border border-transparent px-2 py-1 hover:border-border hover:bg-muted sm:flex"
          onClick={() => navigate('/settings')}
        >
          <span className="text-primary">{user?.displayName ?? 'user'}</span>
        </button>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-none"
          aria-label="Sign out"
          onClick={() => {
            void logout().then(() => navigate('/login'));
          }}
        >
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </div>
    </header>
  );
}
