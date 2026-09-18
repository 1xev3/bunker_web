import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export function SelectTrigger({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return <SelectPrimitive.Trigger className={cn('accent-input flex min-w-24 items-center justify-between gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-zinc-500 focus-visible:ring-2 focus-visible:ring-[var(--accent)]', className)} {...props}>
    {children}<SelectPrimitive.Icon asChild><ChevronDown className="size-4 shrink-0 text-zinc-500" /></SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>;
}

export function SelectContent({ className, children, position = 'popper', ...props }: ComponentProps<typeof SelectPrimitive.Content>) {
  return <SelectPrimitive.Portal><SelectPrimitive.Content position={position} className={cn('z-[70] max-h-80 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 text-zinc-100 shadow-2xl data-[state=closed]:animate-out data-[state=open]:animate-in', position === 'popper' && 'translate-y-1', className)} {...props}>
    <SelectPrimitive.ScrollUpButton className="flex h-7 items-center justify-center"><ChevronUp className="size-4" /></SelectPrimitive.ScrollUpButton>
    <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
    <SelectPrimitive.ScrollDownButton className="flex h-7 items-center justify-center"><ChevronDown className="size-4" /></SelectPrimitive.ScrollDownButton>
  </SelectPrimitive.Content></SelectPrimitive.Portal>;
}

export function SelectItem({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Item>) {
  return <SelectPrimitive.Item className={cn('relative flex cursor-default select-none items-center rounded-md py-2 pl-8 pr-3 text-sm outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-zinc-800 data-[disabled]:opacity-50', className)} {...props}>
    <span className="absolute left-2 flex size-4 items-center justify-center"><SelectPrimitive.ItemIndicator><Check className="size-4 text-[var(--accent)]" /></SelectPrimitive.ItemIndicator></span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>;
}

export function SelectLabel({ className, ...props }: ComponentProps<typeof SelectPrimitive.Label>) { return <SelectPrimitive.Label className={cn('px-3 py-2 text-xs font-semibold text-zinc-500', className)} {...props} />; }
export function SelectSeparator({ className, ...props }: ComponentProps<typeof SelectPrimitive.Separator>) { return <SelectPrimitive.Separator className={cn('-mx-1 my-1 h-px bg-zinc-800', className)} {...props} />; }
