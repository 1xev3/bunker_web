interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}

export default function ToggleSwitch({
  checked,
  onChange,
  ariaLabel,
  disabled = false,
  className = '',
}: ToggleSwitchProps) {
  return (
    <SwitchPrimitive.Root
        className={cn('relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-zinc-700 bg-zinc-800 transition-colors data-[state=checked]:border-[var(--accent)] data-[state=checked]:bg-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50', className)}
        checked={checked}
        onCheckedChange={onChange}
        aria-label={ariaLabel}
        disabled={disabled}
      >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-5 translate-x-0.5 rounded-full bg-zinc-100 shadow transition-transform data-[state=checked]:translate-x-5 data-[state=checked]:bg-zinc-950" />
    </SwitchPrimitive.Root>
  );
}
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '../../lib/utils';
