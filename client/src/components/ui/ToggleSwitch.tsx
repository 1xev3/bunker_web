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
    <span className={`toggle-switch ${className}`.trim()}>
      <input
        type="checkbox"
        className="toggle-switch-input"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={ariaLabel}
        disabled={disabled}
      />
      <span aria-hidden="true" className="toggle-switch-box">
        <span className="toggle-switch-check" />
      </span>
    </span>
  );
}
