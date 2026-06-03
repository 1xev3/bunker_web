import type { ReactNode } from 'react';
import ToggleSwitch from '../ToggleSwitch';

interface EventSelectableRowProps {
  selected: boolean;
  onToggle: (checked: boolean) => void;
  primary: ReactNode;
  secondary?: ReactNode;
  ariaLabel: string;
  disabled?: boolean;
}

export default function EventSelectableRow({
  selected,
  onToggle,
  primary,
  secondary,
  ariaLabel,
  disabled = false,
}: EventSelectableRowProps) {
  return (
    <label
      className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors border ${
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
      } ${
        selected ? 'event-selected' : 'border-transparent bg-zinc-800/50 hover:bg-zinc-800'
      }`}
    >
      <ToggleSwitch checked={selected} onChange={onToggle} ariaLabel={ariaLabel} disabled={disabled} />
      <span className="text-zinc-300 text-sm flex-1">{primary}</span>
      {secondary ? <span className="text-zinc-500 text-xs">{secondary}</span> : null}
    </label>
  );
}
