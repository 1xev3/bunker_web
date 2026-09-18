import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

export function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return <CheckboxPrimitive.Root className={cn('flex size-5 items-center justify-center rounded-sm border border-zinc-600 bg-zinc-900 text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] data-[state=checked]:border-[var(--accent)] data-[state=checked]:bg-[var(--accent)] disabled:opacity-50', className)} {...props}><CheckboxPrimitive.Indicator><Check className="size-4" /></CheckboxPrimitive.Indicator></CheckboxPrimitive.Root>;
}
