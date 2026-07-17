import { forwardRef, useId, type SelectHTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: string;
  error?: string;
  hint?: string;
  options: SelectOption[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, hint, options, placeholder, id, ...props }, ref) => {
    const generatedId = useId();
    const selectId = id ?? props.name ?? generatedId;

    return (
      <div className="flex w-full flex-col gap-1.5">
        {label ? (
          <label
            htmlFor={selectId}
            className="text-sm font-medium text-[hsl(var(--nd-foreground))]"
          >
            {label}
          </label>
        ) : null}
        <select
          ref={ref}
          id={selectId}
          aria-invalid={error ? true : undefined}
          className={cn(
            'flex h-10 w-full appearance-none rounded-[var(--nd-radius)] border border-[hsl(var(--nd-border))]',
            'bg-[hsl(var(--nd-card))] px-3 py-2 text-sm text-[hsl(var(--nd-foreground))]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--nd-ring))]',
            'disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-[hsl(var(--nd-destructive))]',
            className,
          )}
          {...props}
        >
          {placeholder ? (
            <option value="" disabled>
              {placeholder}
            </option>
          ) : null}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        {error ? (
          <p className="text-xs text-[hsl(var(--nd-destructive))]">{error}</p>
        ) : hint ? (
          <p className="text-xs text-[hsl(var(--nd-muted-foreground))]">{hint}</p>
        ) : null}
      </div>
    );
  },
);

Select.displayName = 'Select';
