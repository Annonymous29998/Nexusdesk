import { forwardRef, useId, type ButtonHTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';

export interface ToggleProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
}

export const Toggle = forwardRef<HTMLButtonElement, ToggleProps>(
  ({ checked, onChange, label, description, className, disabled, id, ...props }, ref) => {
    const generatedId = useId();
    const toggleId = id ?? generatedId;

    return (
      <div className={cn('flex items-start gap-3', className)}>
        <button
          ref={ref}
          id={toggleId}
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className={cn(
            'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--nd-ring))]',
            'disabled:cursor-not-allowed disabled:opacity-50',
            checked ? 'bg-[hsl(var(--nd-primary))]' : 'bg-[hsl(var(--nd-muted))]',
          )}
          {...props}
        >
          <span
            aria-hidden
            className={cn(
              'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition',
              checked ? 'translate-x-5' : 'translate-x-0',
            )}
          />
        </button>
        {(label || description) && (
          <div className="flex flex-col">
            {label ? (
              <label htmlFor={toggleId} className="text-sm font-medium cursor-pointer">
                {label}
              </label>
            ) : null}
            {description ? (
              <span className="text-xs text-[hsl(var(--nd-muted-foreground))]">{description}</span>
            ) : null}
          </div>
        )}
      </div>
    );
  },
);

Toggle.displayName = 'Toggle';
