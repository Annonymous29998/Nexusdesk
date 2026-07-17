import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';
import { Spinner } from './spinner.js';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--nd-radius)]',
    'text-sm font-medium transition-colors focus-visible:outline-none',
    'focus-visible:ring-2 focus-visible:ring-[hsl(var(--nd-ring))] focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50',
  ].join(' '),
  {
    variants: {
      variant: {
        primary:
          'bg-[hsl(var(--nd-primary))] text-[hsl(var(--nd-primary-foreground))] hover:opacity-90',
        secondary:
          'bg-[hsl(var(--nd-secondary))] text-[hsl(var(--nd-secondary-foreground))] hover:opacity-90',
        outline:
          'border border-[hsl(var(--nd-border))] bg-transparent hover:bg-[hsl(var(--nd-muted))]',
        ghost: 'hover:bg-[hsl(var(--nd-muted))]',
        destructive:
          'bg-[hsl(var(--nd-destructive))] text-[hsl(var(--nd-destructive-foreground))] hover:opacity-90',
        link: 'text-[hsl(var(--nd-primary))] underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4',
        lg: 'h-11 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading = false, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? <Spinner size="sm" className="text-current" /> : null}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';

export { buttonVariants };
