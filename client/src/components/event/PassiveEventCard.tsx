import { Send, Sparkles, Users, Utensils } from 'lucide-react';
import type { GameEvent, ClientMessage } from '../../types/game';
import { renderEventText } from './eventUtils';

interface Props {
  event: GameEvent;
  send: (msg: ClientMessage) => void;
}

export default function PassiveEventCard({ event, send }: Props) {
  const isFoodEffect = event.success_effect?.type === 'food_change';
  const isPositive = (event.success_effect?.value ?? 0) >= 0;
  const value = event.success_effect?.value ?? 0;

  const handleNext = () => {
    send({ type: 'resolve_event', selected_professions: [], selected_items: [] });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in-up">
      <div className={`bg-zinc-900 border rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-6 flex flex-col gap-4 ${
        isPositive ? 'ready-modal-border' : 'border-zinc-700/40'
      }`}>
        <div className="flex items-start gap-3">
          {isFoodEffect ? (
            <Utensils size={20} className={isPositive ? 'event-icon-positive shrink-0 mt-0.5' : 'text-orange-400 shrink-0 mt-0.5'} />
          ) : (
            <Sparkles size={20} className={isPositive ? 'event-icon-positive shrink-0 mt-0.5' : 'text-zinc-500 shrink-0 mt-0.5'} />
          )}
          <div>
            <h2 className={`font-bold text-lg ${isPositive ? 'event-title-positive' : 'text-zinc-300'}`}>{renderEventText(event.title)}</h2>
            <p className="text-zinc-400 text-sm mt-1 leading-relaxed">{renderEventText(event.description)}</p>
          </div>
        </div>

        {event.participants && event.participants.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800/60">
            <Users size={13} className="text-zinc-500 shrink-0" />
            <span className="text-zinc-400 text-sm">{event.participants.join(', ')}</span>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <p className="text-zinc-500 text-xs uppercase tracking-widest">Эффект события</p>
          <div className={`text-center text-sm font-semibold rounded-lg py-2 ${
            isPositive
              ? 'text-green-400 bg-green-950/30 border border-green-900/30'
              : 'text-red-400 bg-red-950/30 border border-red-900/30'
          }`}>
            {isFoodEffect
              ? `${value > 0 ? '+' : ''}${value}% запасов еды`
              : `${value > 0 ? '+' : ''}${value}% к шансу выживания`
            }
          </div>
        </div>

        <button
          className="w-full py-2.5 rounded-xl text-sm font-semibold btn-primary text-white flex items-center justify-center gap-2"
          onClick={handleNext}
        >
          <Send size={14} /> Дальше
        </button>
      </div>
    </div>
  );
}
