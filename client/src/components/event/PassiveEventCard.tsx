import { CheckCheck, Send, Sparkles, Users } from 'lucide-react';
import type { GameEvent, Player, ClientMessage } from '../../types/game';
import { renderEventText } from './eventUtils';
import Button from '../ui/Button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/Dialog';

interface Props {
  event: GameEvent;
  activePlayers: Player[];
  resolveConfirmations: string[];
  myPlayerId: string;
  send: (msg: ClientMessage) => void;
  disabled?: boolean;
  readOnly?: boolean;
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

export default function PassiveEventCard({ event, activePlayers, resolveConfirmations, myPlayerId, send, disabled = false, readOnly = false }: Props) {
  const myConfirmed = resolveConfirmations.includes(myPlayerId);
  const allConfirmed = activePlayers.length > 0 && activePlayers.every(p => resolveConfirmations.includes(p.id));

  const handleNext = () => {
    if (!myConfirmed && !disabled) {
      send({ type: 'resolve_event', selected_professions: [], selected_items: [] });
    }
  };

  return (
    <Dialog open>
      <DialogContent showCloseButton={false} onEscapeKeyDown={event => event.preventDefault()} onPointerDownOutside={event => event.preventDefault()} className="max-w-sm p-6">
        <div className="flex items-start gap-3">
          <Sparkles size={20} className="text-zinc-400 shrink-0 mt-0.5" />
          <div>
            <DialogHeader className="mb-0 pr-0"><DialogTitle>{renderEventText(event.title)}</DialogTitle><DialogDescription className="mt-1 leading-relaxed">{renderEventText(event.description)}</DialogDescription></DialogHeader>
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
          <Button variant="primary" className="w-full"
            onClick={handleNext}
            disabled={disabled || readOnly || myConfirmed || allConfirmed}
          >
            {disabled
              ? 'Переподключение...'
              : readOnly
              ? 'Вы наблюдаете'
              : myConfirmed
              ? <><CheckCheck size={14} /> Подтверждено</>
              : <><Send size={14} /> Готов</>}
          </Button>
          <p className="text-center text-xs text-zinc-500">
            {disabled
              ? 'Соединение восстанавливается.'
              : readOnly
              ? 'Ожидаем решения выживших.'
              : allConfirmed
              ? 'Все готовы, переходим...'
              : `Ждём ${activePlayers.length - resolveConfirmations.length} из ${activePlayers.length}`}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
