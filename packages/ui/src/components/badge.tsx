import { cva, type VariantProps } from 'class-variance-authority';
import { type HTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-[hsl(var(--nd-primary))] text-[hsl(var(--nd-primary-foreground))]',
        secondary:
          'border-transparent bg-[hsl(var(--nd-secondary))] text-[hsl(var(--nd-secondary-foreground))]',
        outline: 'border-[hsl(var(--nd-border))] text-[hsl(var(--nd-foreground))]',
        success:
          'border-transparent bg-[hsl(var(--nd-accent))] text-[hsl(var(--nd-accent-foreground))]',
        destructive:
          'border-transparent bg-[hsl(var(--nd-destructive))] text-[hsl(var(--nd-destructive-foreground))]',
        muted:
          'border-transparent bg-[hsl(var(--nd-muted))] text-[hsl(var(--nd-muted-foreground))]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
