import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CommandPalette, type CommandItem } from '@nexusdesk/ui';
import {
  BarChart3,
  LayoutDashboard,
  Monitor,
  Moon,
  Settings,
  Users,
  Video,
} from 'lucide-react';
import { useThemeStore } from '@/stores/theme';
import { useUiStore } from '@/stores/ui';

export function AppCommandPalette() {
  const open = useUiStore((s) => s.commandPaletteOpen);
  const setOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const navigate = useNavigate();

  const items = useMemo<CommandItem[]>(
    () => [
      {
        id: 'dash',
        label: 'Go to Dashboard',
        group: 'Navigation',
        icon: <LayoutDashboard className="h-4 w-4" />,
        shortcut: 'G D',
        onSelect: () => navigate('/'),
      },
      {
        id: 'devices',
        label: 'Go to Devices',
        group: 'Navigation',
        icon: <Monitor className="h-4 w-4" />,
        onSelect: () => navigate('/devices'),
      },
      {
        id: 'sessions',
        label: 'Go to Sessions',
        group: 'Navigation',
        icon: <Video className="h-4 w-4" />,
        onSelect: () => navigate('/sessions'),
      },
      {
        id: 'users',
        label: 'Go to Users',
        group: 'Navigation',
        icon: <Users className="h-4 w-4" />,
        onSelect: () => navigate('/users'),
      },
      {
        id: 'analytics',
        label: 'Go to Analytics',
        group: 'Navigation',
        icon: <BarChart3 className="h-4 w-4" />,
        onSelect: () => navigate('/analytics'),
      },
      {
        id: 'settings',
        label: 'Go to Settings',
        group: 'Navigation',
        icon: <Settings className="h-4 w-4" />,
        onSelect: () => navigate('/settings'),
      },
      {
        id: 'theme',
        label: 'Toggle dark / light mode',
        group: 'Actions',
        icon: <Moon className="h-4 w-4" />,
        shortcut: '⌘D',
        onSelect: () => toggleTheme(),
      },
    ],
    [navigate, toggleTheme],
  );

  return (
    <CommandPalette
      open={open}
      onOpenChange={setOpen}
      items={items}
      placeholder="Jump to a page or run an action…"
    />
  );
}
