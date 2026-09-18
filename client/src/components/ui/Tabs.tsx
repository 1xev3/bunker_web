import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '../../lib/utils';
export const Tabs = TabsPrimitive.Root;
export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) { return <TabsPrimitive.List className={cn('inline-flex rounded-md border border-zinc-800 bg-zinc-950 p-1', className)} {...props} />; }
export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) { return <TabsPrimitive.Trigger className={cn('rounded-sm px-3 py-2 text-sm text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] data-[state=active]:bg-zinc-800 data-[state=active]:text-white', className)} {...props} />; }
export const TabsContent = TabsPrimitive.Content;
