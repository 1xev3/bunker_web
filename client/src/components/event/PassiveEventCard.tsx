import { CheckCheck, Send, Sparkles, Users } from 'lucide-react';
import type { GameEvent, Player, ClientMessage } from '../../types/game';
import { renderEventText } from './eventUtils';

interface Props {
  event: GameEvent;
  activePlayers: Player[];
  resolveConfirmations: string[];
  myPlayerId: string;
  send: (msg: ClientMessage) => void;
  disabled?: boolean;
}

function ConfirmationDots({ confirmed, activePlayers }: { confirmed: string[]; activePlayers: Player[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {activePlayers.map(p => {
        const done = confirmed.includes(p.id);
        return (
          <span
            key={p.id}
            title={p.name}
            className={`flex h-5 w-5 items-center justify-center rounded-full border text-[9px] font-bold transition-colors ${
              done
                ? 'border-amber-600/60 bg-amber-900/70 text-amber-200'
                : 'border-zinc-700 bg-zinc-900 text-zinc-500'
            }`}
          >
            {p.name.charAt(0).toUpperCase()}
          </span>
        );
      })}
      <span className="text-[10px] text-zinc-500">{confirmed.length} / {activePlayers.length}</span>
    </div>
  );
}

export default function PassiveEventCard({ event, activePlayers, resolveConfirmations, myPlayerId, send, disabled = false }: Props) {
  const myConfirmed = resolveConfirmations.includes(myPlayerId);
  const allConfirmed = activePlayers.length > 0 && activePlayers.every(p => resolveConfirmations.includes(p.id));

  const handleNext = () => {
    if (!myConfirmed && !disabled) {
      send({ type: 'resolve_event', selected_professions: [], selected_items: [] });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in-up">
      <div className="bg-zinc-900 border border-zinc-700/40 rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-6 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <Sparkles size={20} className="text-zinc-400 shrink-0 mt-0.5" />
          <div>
            <h2 className="font-bold text-lg text-zinc-200">{renderEventText(event.title)}</h2>
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
          <ConfirmationDots confirmed={resolveConfirmations} activePlayers={activePlayers} />
          <button
            className="w-full py-2.5 rounded-xl text-sm font-semibold btn-primary text-white flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            onClick={handleNext}
            disabled={disabled || myConfirmed || allConfirmed}
          >
            {disabled
              ? 'Переподключение...'
              : myConfirmed
              ? <><CheckCheck size={14} /> Подтверждено</>
              : <><Send size={14} /> Готов</>}
          </button>
          <p className="text-center text-xs text-zinc-500">
            {disabled
              ? 'Соединение восстанавливается.'
              : allConfirmed
              ? 'Все готовы, переходим...'
              : `Ждём ${activePlayers.length - resolveConfirmations.length} из ${activePlayers.length}`}
          </p>
        </div>
      </div>
    </div>
  );
}
