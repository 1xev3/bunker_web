import { LoaderCircle } from 'lucide-react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-md border font-medium tracking-wide transition-[color,background-color,border-color,box-shadow,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--accent)_55%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:pointer-events-none disabled:opacity-45 active:translate-y-px',
  {
    variants: {
      variant: {
        primary: 'border-[color:color-mix(in_srgb,var(--accent)_55%,transparent)] bg-[var(--accent)] text-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,.25),0_2px_0_rgba(0,0,0,.45)] hover:brightness-110',
        secondary: 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800 hover:text-white',
        danger: 'border-red-800 bg-red-950 text-red-100 hover:border-red-600 hover:bg-red-900',
        ghost: 'border-transparent bg-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-sm',
        icon: 'size-10 p-0',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export default function Button({ asChild, loading, children, className, variant, size, disabled, type = 'button', ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button';
  return (
    <Component type={asChild ? undefined : type} className={cn(buttonVariants({ variant, size }), className)} disabled={asChild ? undefined : disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </Component>
  );
}
