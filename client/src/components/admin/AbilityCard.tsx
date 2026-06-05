import { Sparkles, WandSparkles } from 'lucide-react';
import type { ProfessionAbilityInfo } from '../../types/game';

function AbilityChip({ label }: { label: string }) {
  return (
    <span className="border border-zinc-700 bg-black/30 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
      {label}
    </span>
  );
}

// The profession-ability call-to-action card. Clicking it (when enabled) opens
// the ritual/use modal via `onOpen`.
export default function AbilityCard({
  ability,
  disabled,
  onOpen,
}: {
  ability: ProfessionAbilityInfo;
  disabled: boolean;
  onOpen: () => void;
}) {
  const needsTarget = ability.targetType === 'other';
  const needsPair = ability.targetType === 'pair';

  return (
    <div>
      <button
        className={`ability-card ability-card-compact group text-left ${disabled ? 'opacity-70' : ''}`}
        disabled={!ability.hasAbility}
        onClick={() => { if (!disabled) onOpen(); }}
      >
        <div className="relative z-10">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex items-start gap-3">
              <div className="ability-card-icon mt-0.5">
                <WandSparkles size={18} />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500 mb-1">Способность профессии</p>
                <h3 className="text-zinc-50 font-semibold text-lg leading-tight">{ability.title}</h3>
              </div>
            </div>
            <span className={`text-xs px-2.5 py-1 border shrink-0 ${
              ability.hasAbility
                ? ability.used
                  ? 'border-zinc-600 text-zinc-400 bg-zinc-900/60'
                  : 'badge-waiting'
                : 'border-zinc-700 text-zinc-500 bg-zinc-900/60'
            }`}>
              {!ability.hasAbility ? 'нет способности' : ability.used ? 'использовано' : 'доступно'}
            </span>
          </div>

          <p className="text-sm leading-relaxed text-zinc-200/90 mb-4">{ability.description}</p>

          <div className="flex flex-wrap gap-2 mb-4">
            {needsTarget && <AbilityChip label="Выбор цели" />}
            {needsPair && <AbilityChip label="Две цели" />}
            {!needsTarget && !needsPair && <AbilityChip label="Без выбора цели" />}
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Sparkles size={12} />
              <span>{disabled ? 'Сейчас недоступно' : 'Нажми, чтобы открыть ритуал применения'}</span>
            </div>
            <span className={`px-4 py-2 text-sm font-semibold transition-all ${
              disabled
                ? 'border border-zinc-800 bg-zinc-950/70 text-zinc-600'
                : 'ability-card-action'
            }`}>
              Использовать
            </span>
          </div>
        </div>
      </button>
    </div>
  );
}
