import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { cn } from '../../lib/utils';
export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export function DropdownMenuContent({ className, sideOffset = 6, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) { return <DropdownMenuPrimitive.Portal><DropdownMenuPrimitive.Content sideOffset={sideOffset} className={cn('z-[60] min-w-44 rounded-md border border-zinc-700 bg-zinc-950 p-1 shadow-xl', className)} {...props} /></DropdownMenuPrimitive.Portal>; }
export function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Item>) { return <DropdownMenuPrimitive.Item className={cn('flex cursor-default select-none items-center rounded-sm px-3 py-2 text-sm text-zinc-300 outline-none focus:bg-zinc-800 focus:text-white data-[disabled]:opacity-50', className)} {...props} />; }
