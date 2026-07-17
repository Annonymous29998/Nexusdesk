import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  LayoutDashboard,
  Link2,
  Monitor,
  ScrollText,
  Settings,
  Users,
  Video,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui';

const navGroups = [
  {
    label: 'OPERATE',
    items: [
      { to: '/', label: 'Overview', icon: LayoutDashboard, end: true, key: '1' },
      { to: '/devices', label: 'Devices', icon: Monitor, key: '2' },
      { to: '/guest-links', label: 'Support links', icon: Link2, key: '3' },
      { to: '/sessions', label: 'Sessions', icon: Video, key: '4' },
    ],
  },
  {
    label: 'MANAGE',
    items: [
      { to: '/users', label: 'Users', icon: Users, key: '5' },
      { to: '/analytics', label: 'Analytics', icon: BarChart3, key: '6' },
      { to: '/logs', label: 'Logs', icon: ScrollText, key: '7' },
    ],
  },
  {
    label: 'ACCOUNT',
    items: [
      { to: '/notifications', label: 'Notifications', icon: Bell, key: '8' },
      { to: '/settings', label: 'Settings', icon: Settings, key: 'S' },
    ],
  },
];

type HoverTip = { label: string; top: number };

export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const mobileOpen = useUiStore((s) => s.mobileNavOpen);
  const setMobileNavOpen = useUiStore((s) => s.setMobileNavOpen);
  const [tip, setTip] = useState<HoverTip | null>(null);

  const showTip = (label: string, el: HTMLElement) => {
    if (!collapsed) return;
    const rect = el.getBoundingClientRect();
    setTip({ label, top: rect.top + rect.height / 2 });
  };

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/70 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border bg-[hsl(var(--nd-sidebar))] font-mono transition-all duration-150',
          collapsed ? 'w-[72px]' : 'w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <div
          className={cn(
            'flex h-16 shrink-0 flex-col justify-center border-b border-border px-3',
            collapsed && 'items-center px-2',
          )}
        >
          {!collapsed ? (
            <>
              <p className="text-sm font-bold tracking-widest text-primary">NEXUSDESK</p>
              <p className="mt-0.5 text-[10px] text-accent">TUI control panel · v0.1</p>
            </>
          ) : (
            <span className="text-lg font-bold text-primary">ND</span>
          )}
        </div>

        <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto p-2">
          {navGroups.map((group) => (
            <div key={group.label}>
              {!collapsed ? (
                <p className="mb-1 px-2 text-[10px] text-accent">
                  ── {group.label} ──
                </p>
              ) : null}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    aria-label={item.label}
                    onClick={() => setMobileNavOpen(false)}
                    onMouseEnter={(e) => showTip(item.label, e.currentTarget)}
                    onMouseLeave={() => setTip(null)}
                    onFocus={(e) => showTip(item.label, e.currentTarget)}
                    onBlur={() => setTip(null)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2 px-2 py-1.5 text-xs transition-colors',
                        collapsed && 'justify-center',
                        isActive
                          ? 'nd-nav-active'
                          : 'text-muted-foreground hover:bg-muted hover:text-primary',
                      )
                    }
                  >
                    {!collapsed ? (
                      <span className="w-4 shrink-0 text-accent">[{item.key}]</span>
                    ) : (
                      <item.icon className="h-4 w-4 shrink-0" />
                    )}
                    {!collapsed ? (
                      <>
                        <item.icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                        <span className="truncate">{item.label}</span>
                      </>
                    ) : null}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-border p-2">
          <p className={cn('text-[10px] text-muted-foreground', collapsed ? 'text-center' : 'px-1')}>
            {collapsed ? 'OK' : (
              <>
                <span className="tui-tag tui-tag-ok">[ OK ]</span> agent plane ready
              </>
            )}
          </p>
        </div>
      </aside>

      {collapsed && tip ? (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-[60] -translate-y-1/2 border border-primary/40 bg-card px-2.5 py-1 font-mono text-xs text-primary shadow-lg"
          style={{ left: 80, top: tip.top }}
        >
          {tip.label}
        </div>
      ) : null}
    </>
  );
}
