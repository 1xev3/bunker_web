import type { ReactNode } from 'react';
import { Brain, CheckCheck, HeartPulse, Skull, Utensils, Baby, DoorOpen, Sparkles, Send, Package, ShieldAlert, Clock } from 'lucide-react';
import type { ClientMessage, EventOutcome, Player } from '../../types/game';
import { renderEventText } from '../event/eventUtils';
import Button from '../ui/Button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/Dialog';

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

export default function EventOutcomeModal({ outcome, activePlayers, myPlayerId, outcomeConfirmations, send, disabled, readOnly }: {
  outcome: EventOutcome;
  activePlayers: Player[];
  myPlayerId: string;
  outcomeConfirmations: string[] | null;
  send: (msg: ClientMessage) => void;
  disabled?: boolean;
  readOnly?: boolean;
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
  (outcome.status_changes ?? []).forEach((c, i) =>
    rows.push(<OutcomeRow
      key={`status-${i}-${c.id}`}
      icon={<ShieldAlert size={14} className={c.action === 'added' ? 'text-amber-400' : 'text-emerald-400'} />}
      label={`${c.name}: ${c.action === 'added' ? c.status?.label ?? c.status_id ?? 'эффект' : 'эффект снят'}`}
    />));
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
  (outcome.scheduled_events ?? []).forEach((scheduled, i) =>
    rows.push(<OutcomeRow key={`scheduled-${i}-${scheduled.title}`} icon={<Clock size={14} className="text-violet-400" />} label={`Отложено: ${scheduled.title}`} value={`через ${scheduled.in_months} мес.`} />));

  return (
    <Dialog open>
      <DialogContent showCloseButton={false} onEscapeKeyDown={event => event.preventDefault()} onPointerDownOutside={event => event.preventDefault()} className="max-w-lg p-0">
        <div className="border-b border-zinc-800 p-5">
          <DialogTitle>{outcome.event_title ? renderEventText(outcome.event_title) : outcome.ai_explanation ? 'Решение ИИ' : 'Итог события'}</DialogTitle>
          {outcome.event_description && <DialogDescription className="mt-1 leading-relaxed">{renderEventText(outcome.event_description)}</DialogDescription>}
        </div>
        {outcome.ai_explanation && (
          <div className="border-b border-zinc-800 p-5">
            <div className="flex items-start gap-3">
              <Brain size={20} className="mt-0.5 shrink-0 text-sky-400" />
              <div>
                <p className={`mb-1 text-xs font-bold uppercase tracking-wide ${outcome.ai_outcome === 'success' ? 'text-emerald-400' : outcome.ai_outcome === 'failure' ? 'text-red-400' : 'text-sky-400'}`}>
                  {outcome.ai_outcome === 'success' ? 'Решение ИИ: успех' : outcome.ai_outcome === 'failure' ? 'Решение ИИ: неудача' : outcome.ai_score != null ? `Оценка ИИ: ${outcome.ai_score}%` : 'Объяснение расчёта'}
                </p>
                <p className="text-sm leading-relaxed text-zinc-300">{outcome.ai_explanation}</p>
                {(outcome.selected_resources?.length ?? 0) > 0 && (
                  <div className="mt-3 space-y-1 text-xs">
                    <p className="text-zinc-400">Выбрано: {outcome.selected_resources!.join(', ')}</p>
                    {(outcome.accepted_resources?.length ?? 0) > 0 && <p className="text-emerald-400">Зачтено: {outcome.accepted_resources!.join(', ')}</p>}
                    {(outcome.rejected_resources?.length ?? 0) > 0 && <p className="text-red-400">Не помогло: {outcome.rejected_resources!.join(', ')}</p>}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
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
          <Button
            type="button"
            onClick={() => { if (!myConfirmed && !disabled && !readOnly) send({ type: 'confirm_outcome' }); }}
            disabled={disabled || readOnly || myConfirmed || allConfirmed}
            variant="primary" className="w-full justify-between"
          >
            <span className="flex items-center gap-2">
              {disabled ? 'Переподключение...' : readOnly ? 'Вы наблюдаете' : myConfirmed ? <><CheckCheck size={14} /> Подтверждено</> : <><Send size={14} /> Готов</>}
            </span>
            <ConfirmationDots confirmed={confirmed} activePlayers={activePlayers} />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
