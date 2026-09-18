import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

const badgeVariants = cva('inline-flex items-center rounded-sm border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[.14em]', { variants: { variant: {
  neutral: 'border-zinc-700 bg-zinc-900 text-zinc-300',
  success: 'border-emerald-800 bg-emerald-950/70 text-emerald-300',
  warning: 'border-amber-800 bg-amber-950/70 text-amber-300',
  danger: 'border-red-800 bg-red-950/70 text-red-300',
  accent: 'border-[color:color-mix(in_srgb,var(--accent)_55%,transparent)] bg-[color:color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--accent)]',
} }, defaultVariants: { variant: 'neutral' } });

export function Badge({ className, variant, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
