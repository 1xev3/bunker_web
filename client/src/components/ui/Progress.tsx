import * as ProgressPrimitive from '@radix-ui/react-progress';
import { cn } from '../../lib/utils';

export function Progress({ value = 0, className, ...props }: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  const normalized = Math.max(0, Math.min(100, value ?? 0));
  return <ProgressPrimitive.Root className={cn('relative h-2 overflow-hidden rounded-full bg-zinc-800', className)} value={normalized} {...props}><ProgressPrimitive.Indicator className="h-full bg-[var(--accent)] transition-transform" style={{ transform: `translateX(-${100 - normalized}%)` }} /></ProgressPrimitive.Root>;
}
