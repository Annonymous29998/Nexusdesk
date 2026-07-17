import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/cn.js';

export interface CommandItem {
  id: string;
  label: string;
  description?: string;
  keywords?: string[];
  shortcut?: string;
  group?: string;
  disabled?: boolean;
  icon?: ReactNode;
  onSelect: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CommandItem[];
  placeholder?: string;
  emptyMessage?: string;
}

function matchesQuery(item: CommandItem, query: string): boolean {
  if (!query) return true;
  const haystack = [item.label, item.description ?? '', ...(item.keywords ?? [])]
    .join(' ')
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

export function CommandPalette({
  open,
  onOpenChange,
  items,
  placeholder = 'Type a command or search…',
  emptyMessage = 'No results found.',
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(
    () => items.filter((item) => matchesQuery(item, query)),
    [items, query],
  );

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIndex(0);
      return;
    }
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const runItem = useCallback(
    (item: CommandItem) => {
      if (item.disabled) return;
      item.onSelect();
      close();
    },
    [close],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const item = filtered[activeIndex];
      if (item) runItem(item);
    }
  };

  useEffect(() => {
    const onGlobalKey = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', onGlobalKey);
    return () => window.removeEventListener('keydown', onGlobalKey);
  }, [open, onOpenChange]);

  if (!open || typeof document === 'undefined') return null;

  const groups = filtered.reduce<Record<string, CommandItem[]>>((acc, item) => {
    const group = item.group ?? 'Commands';
    const list = acc[group] ?? [];
    list.push(item);
    acc[group] = list;
    return acc;
  }, {});

  let flatIndex = -1;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[15vh] p-4">
      <div className="absolute inset-0 bg-black/50" onClick={close} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className={cn(
          'relative z-10 w-full max-w-xl overflow-hidden rounded-[var(--nd-radius)]',
          'border border-[hsl(var(--nd-border))] bg-[hsl(var(--nd-card))] shadow-2xl',
        )}
        onKeyDown={onKeyDown}
      >
        <div className="border-b border-[hsl(var(--nd-border))] px-4 py-3">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className={cn(
              'w-full bg-transparent text-sm text-[hsl(var(--nd-foreground))]',
              'placeholder:text-[hsl(var(--nd-muted-foreground))] focus:outline-none',
            )}
            aria-autocomplete="list"
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-2" role="listbox">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-[hsl(var(--nd-muted-foreground))]">
              {emptyMessage}
            </p>
          ) : (
            Object.entries(groups).map(([group, groupItems]) => (
              <div key={group} className="mb-2">
                <p className="px-3 py-1 text-xs font-medium uppercase tracking-wide text-[hsl(var(--nd-muted-foreground))]">
                  {group}
                </p>
                {groupItems.map((item) => {
                  flatIndex += 1;
                  const index = flatIndex;
                  const active = index === activeIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      disabled={item.disabled}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm',
                        active && 'bg-[hsl(var(--nd-muted))]',
                        item.disabled && 'opacity-50',
                      )}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => runItem(item)}
                    >
                      {item.icon ? <span className="shrink-0">{item.icon}</span> : null}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{item.label}</span>
                        {item.description ? (
                          <span className="block truncate text-xs text-[hsl(var(--nd-muted-foreground))]">
                            {item.description}
                          </span>
                        ) : null}
                      </span>
                      {item.shortcut ? (
                        <kbd className="rounded border border-[hsl(var(--nd-border))] px-1.5 py-0.5 text-[10px] text-[hsl(var(--nd-muted-foreground))]">
                          {item.shortcut}
                        </kbd>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="border-t border-[hsl(var(--nd-border))] px-4 py-2 text-[10px] text-[hsl(var(--nd-muted-foreground))]">
          ↑↓ navigate · ↵ select · esc close · ⌘K toggle
        </div>
      </div>
    </div>,
    document.body,
  );
}
