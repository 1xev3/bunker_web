import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetTitle = DialogPrimitive.Title;
export const SheetDescription = DialogPrimitive.Description;
export function SheetContent({ className, children, side = 'right', ...props }: ComponentProps<typeof DialogPrimitive.Content> & { side?: 'right' | 'bottom' }) {
  return <DialogPrimitive.Portal><DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" /><DialogPrimitive.Content className={cn('fixed z-50 border-zinc-700 bg-zinc-950 p-5 shadow-2xl focus:outline-none', side === 'right' ? 'inset-y-0 right-0 w-[min(90vw,25rem)] border-l' : 'inset-x-0 bottom-0 max-h-[85dvh] rounded-t-md border-t', className)} {...props}>{children}<DialogPrimitive.Close className="absolute right-3 top-3 p-2 text-zinc-500 hover:text-white" aria-label="Закрыть"><X className="size-4" /></DialogPrimitive.Close></DialogPrimitive.Content></DialogPrimitive.Portal>;
}
