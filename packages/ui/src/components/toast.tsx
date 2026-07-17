import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/cn.js';

export type ToastVariant = 'default' | 'success' | 'error' | 'warning';

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
}

interface ToastContextValue {
  toasts: ToastItem[];
  toast: (input: Omit<ToastItem, 'id'> & { id?: string }) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const variantStyles: Record<ToastVariant, string> = {
  default: 'border-[hsl(var(--nd-border))] bg-[hsl(var(--nd-card))]',
  success: 'border-transparent bg-[hsl(var(--nd-accent))] text-[hsl(var(--nd-accent-foreground))]',
  error:
    'border-transparent bg-[hsl(var(--nd-destructive))] text-[hsl(var(--nd-destructive-foreground))]',
  warning: 'border-transparent bg-amber-500 text-white',
};

export interface ToastProviderProps {
  children: ReactNode;
  maxVisible?: number;
}

export function ToastProvider({ children, maxVisible = 5 }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (input: Omit<ToastItem, 'id'> & { id?: string }) => {
      const id = input.id ?? `toast-${crypto.randomUUID()}`;
      const item: ToastItem = {
        id,
        title: input.title,
        description: input.description,
        variant: input.variant ?? 'default',
        durationMs: input.durationMs ?? 4000,
      };

      setToasts((prev) => [item, ...prev].slice(0, maxVisible));

      if (item.durationMs && item.durationMs > 0) {
        window.setTimeout(() => dismiss(id), item.durationMs);
      }

      return id;
    },
    [dismiss, maxVisible],
  );

  const value = useMemo(() => ({ toasts, toast, dismiss }), [toasts, toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {typeof document !== 'undefined'
        ? createPortal(
            <div
              className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2"
              aria-live="polite"
            >
              {toasts.map((item) => (
                <Toast
                  key={item.id}
                  item={item}
                  onDismiss={() => dismiss(item.id)}
                />
              ))}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const variant = item.variant ?? 'default';
  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto rounded-[var(--nd-radius)] border px-4 py-3 shadow-lg',
        'animate-in fade-in slide-in-from-bottom-2',
        variantStyles[variant],
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{item.title}</p>
          {item.description ? (
            <p className="mt-1 text-xs opacity-90">{item.description}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-sm opacity-70 hover:opacity-100"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}
