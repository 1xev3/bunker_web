import type { ReactNode } from 'react';
import { Brain, CheckCheck, HeartPulse, Skull, Utensils, Baby, DoorOpen, Sparkles, Send, Package } from 'lucide-react';
import type { ClientMessage, EventOutcome, Player } from '../../types/game';

function OutcomeRow({ icon, label, value, valueColor }: { icon: ReactNode; label: string; value?: string; valueColor?: string }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 text-sm text-zinc-300">{label}</span>
      {value && <span className={`font-mono text-sm font-bold ${valueColor ?? 'text-zinc-200'}`}>{value}</span>}
    </div>
  );
}

function ConfirmationDots({ confirmed, activePlayers }: { confirmed: string[]; activePlayers: Player[] }) {
  return (
    <span className="font-mono text-base font-bold text-white">
      {confirmed.length} / {activePlayers.length}
    </span>
  );
}

export default function EventOutcomeModal({ outcome, activePlayers, myPlayerId, outcomeConfirmations, send, disabled }: {
  outcome: EventOutcome;
  activePlayers: Player[];
  myPlayerId: string;
  outcomeConfirmations: string[] | null;
  send: (msg: ClientMessage) => void;
  disabled?: boolean;
}) {
  const confirmed = outcomeConfirmations ?? [];
  const myConfirmed = confirmed.includes(myPlayerId);
  const allConfirmed = activePlayers.length > 0 && activePlayers.every(p => confirmed.includes(p.id));

  const healthChanges = outcome.health_changes?.filter(c => c.delta !== 0) ?? [];
  const sanityChanges = outcome.sanity_changes?.filter(c => c.delta !== 0) ?? [];

  const rows: ReactNode[] = [];
  if (outcome.food_change !== undefined && outcome.food_change !== 0)
    rows.push(<OutcomeRow key="food" icon={<Utensils size={14} className="text-amber-400" />} label="Запасы еды" value={`${outcome.food_change > 0 ? '+' : ''}${outcome.food_change}`} valueColor={outcome.food_change > 0 ? 'text-emerald-400' : 'text-red-400'} />);
  healthChanges.forEach((c, i) =>
    rows.push(<OutcomeRow key={`hp-${i}-${c.name}`} icon={<HeartPulse size={14} className="text-red-400" />} label={c.name} value={`${c.delta > 0 ? '+' : ''}${c.delta}`} valueColor={c.delta > 0 ? 'text-emerald-400' : 'text-red-400'} />));
  sanityChanges.forEach((c, i) =>
    rows.push(<OutcomeRow key={`san-${i}-${c.name}`} icon={<Brain size={14} className="text-sky-400" />} label={c.name} value={`${c.delta > 0 ? '+' : ''}${c.delta}`} valueColor={c.delta > 0 ? 'text-emerald-400' : 'text-red-400'} />));
  (outcome.players_killed ?? []).forEach((p, i) =>
    rows.push(<OutcomeRow key={`killed-${i}-${p.id}`} icon={<Skull size={14} className="text-red-400" />} label={p.name} valueColor="text-red-400" />));
  (outcome.players_added ?? []).forEach((p, i) =>
    rows.push(<OutcomeRow key={`added-${i}-${p.id}`} icon={<Baby size={14} className="text-blue-400" />} label={p.name} />));
  (outcome.item_changes ?? []).forEach((c, i) => {
    const gained = c.action === 'given' || c.action === 'bunker_added';
    const owner = c.name ? `${c.name}: ` : c.action.startsWith('bunker') ? 'Бункер: ' : '';
    const qty = c.quantity && c.quantity > 1 ? ` ×${c.quantity}` : '';
    rows.push(<OutcomeRow
      key={`item-${i}-${c.item}`}
      icon={<Package size={14} className={gained ? 'text-emerald-400' : 'text-red-400'} />}
      label={`${owner}${c.item}${qty}`}
      value={gained ? '+' : '−'}
      valueColor={gained ? 'text-emerald-400' : 'text-red-400'} />);
  });
  if (outcome.room_changed)
    rows.push(<OutcomeRow key="room" icon={<DoorOpen size={14} className="text-zinc-400" />} label="Бункер изменился" />);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 py-6 backdrop-blur-sm animate-fade-in-up">
      <div className="mx-4 flex w-full max-w-lg flex-col rounded-2xl border border-amber-900/40 bg-zinc-900 shadow-2xl">
        {outcome.message && (
          <div className="border-b border-zinc-800 p-5">
            <div className="flex items-start gap-3">
              <Sparkles size={20} className="mt-0.5 shrink-0 text-amber-400" />
              <p className="mt-1 text-sm leading-relaxed text-zinc-400">{outcome.message}</p>
            </div>
          </div>
        )}

        {rows.length > 0 && (
          <div className="px-5 py-2 border-b border-zinc-800 divide-y divide-zinc-800/60">
            {rows}
          </div>
        )}

        <div className="p-5 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => { if (!myConfirmed && !disabled) send({ type: 'confirm_outcome' }); }}
            disabled={disabled || myConfirmed || allConfirmed}
            className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold btn-primary text-white flex items-center justify-between gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <span className="flex items-center gap-2">
              {disabled ? 'Переподключение...' : myConfirmed ? <><CheckCheck size={14} /> Подтверждено</> : <><Send size={14} /> Готов</>}
            </span>
            <ConfirmationDots confirmed={confirmed} activePlayers={activePlayers} />
          </button>
        </div>
      </div>
    </div>
  );
}
