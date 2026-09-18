import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';
import { buttonVariants } from './Button';

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
export function AlertDialogContent({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return <AlertDialogPrimitive.Portal><AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm" /><AlertDialogPrimitive.Content className={cn('fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-md border border-zinc-700 bg-zinc-950 p-5 shadow-2xl', className)} {...props} /></AlertDialogPrimitive.Portal>;
}
export const AlertDialogTitle = ({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Title>) => <AlertDialogPrimitive.Title className={cn('text-lg font-bold text-zinc-100', className)} {...props} />;
export const AlertDialogDescription = ({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Description>) => <AlertDialogPrimitive.Description className={cn('mt-2 text-sm text-zinc-400', className)} {...props} />;
export const AlertDialogFooter = ({ className, ...props }: ComponentProps<'div'>) => <div className={cn('mt-5 flex justify-end gap-2', className)} {...props} />;
export const AlertDialogCancel = ({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Cancel>) => <AlertDialogPrimitive.Cancel className={cn(buttonVariants({ variant: 'secondary' }), className)} {...props} />;
export const AlertDialogAction = ({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Action>) => <AlertDialogPrimitive.Action className={cn(buttonVariants({ variant: 'danger' }), className)} {...props} />;
