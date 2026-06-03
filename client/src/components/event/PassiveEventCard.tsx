import { Send, Sparkles, Users, Utensils } from 'lucide-react';
import type { GameEvent, ClientMessage } from '../../types/game';
import { renderEventText, EffectLine, formatEffectLabel } from './eventUtils';

interface Props {
  event: GameEvent;
  send: (msg: ClientMessage) => void;
  disabled?: boolean;
}

export default function PassiveEventCard({ event, send, disabled = false }: Props) {
  const allEffects = event.success_effects ?? (event.success_effect ? [event.success_effect] : []);
  const visibleEffects = allEffects.filter(e => formatEffectLabel(e));

  const isNegative = allEffects.some(e =>
    e.type === 'kill_random_active' ||
    e.type === 'kill_participant' ||
    ((e.type === 'survival_change' || e.type === 'food_change') && (e.value ?? 0) < 0)
  );
  const isFoodPrimary = allEffects[0]?.type === 'food_change' && !allEffects.some(e => e.type === 'survival_change');

  const HeaderIcon = isFoodPrimary ? Utensils : Sparkles;

  const handleNext = () => {
    send({ type: 'resolve_event', selected_professions: [], selected_items: [] });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in-up">
      <div className={`bg-zinc-900 border rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-6 flex flex-col gap-4 ${
        isNegative ? 'border-zinc-700/40' : 'ready-modal-border'
      }`}>
        <div className="flex items-start gap-3">
          <HeaderIcon size={20} className={isNegative ? 'text-orange-400 shrink-0 mt-0.5' : 'event-icon-positive shrink-0 mt-0.5'} />
          <div>
            <h2 className={`font-bold text-lg ${isNegative ? 'text-zinc-300' : 'event-title-positive'}`}>{renderEventText(event.title)}</h2>
            <p className="text-zinc-400 text-sm mt-1 leading-relaxed">{renderEventText(event.description)}</p>
          </div>
        </div>

        {event.participants && event.participants.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800/60">
            <Users size={13} className="text-zinc-500 shrink-0" />
            <span className="text-zinc-400 text-sm">{event.participants.join(', ')}</span>
          </div>
        )}

        {visibleEffects.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-zinc-500 text-xs uppercase tracking-widest">Эффект события</p>
            <div className="flex flex-col gap-1">
              {visibleEffects.map((e, i) => (
                <EffectLine key={i} effect={e} />
              ))}
            </div>
          </div>
        )}

        <button
          className="w-full py-2.5 rounded-xl text-sm font-semibold btn-primary text-white flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          onClick={handleNext}
          disabled={disabled}
        >
          <Send size={14} /> {disabled ? 'Переподключение...' : 'Дальше'}
        </button>
        {disabled && <p className="text-center text-xs text-orange-400">Соединение восстанавливается. Продолжение станет доступно после переподключения.</p>}
      </div>
    </div>
  );
}
