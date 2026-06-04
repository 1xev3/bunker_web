import { Shield, Check } from 'lucide-react';
import type { Player, ClientMessage } from '../../types/game';

interface Props {
  capacity: number;
  activePlayers: Player[];
  confirmedIds: string[];
  myPlayerId: string;
  send: (msg: ClientMessage) => void;
}

export default function ReadyModal({ capacity, activePlayers, confirmedIds, myPlayerId, send }: Props) {
  const myConfirmed = confirmedIds.includes(myPlayerId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in-up">
      <div className="bg-zinc-900 ready-modal-border border rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4">
        <div className="text-center mb-5">
          <Shield size={36} className="ready-modal-icon mx-auto mb-3" />
          <h2 className="ready-modal-title font-bold text-xl mb-2">Бункер заполнен</h2>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Место в убежище нашлось для <span className="ready-modal-count font-semibold">{capacity}</span> выживших.
            Лишние изгнаны. Пора начинать совместную жизнь в бункере.
          </p>
        </div>

        <div className="mb-5">
          <p className="text-zinc-500 text-xs uppercase tracking-widest mb-2">Готовы к продолжению</p>
          <div className="flex flex-col gap-1.5">
            {activePlayers.map(p => (
              <div key={p.id} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-zinc-800/60">
                <span className="text-zinc-300 text-sm">{p.name}</span>
                {confirmedIds.includes(p.id) ? (
                  <span className="flex items-center gap-1 text-xs text-green-400">
                    <Check size={12} /> Готов
                  </span>
                ) : (
                  <span className="text-xs text-zinc-600">ожидание…</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <button
          className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${
            myConfirmed
              ? 'bg-zinc-800 border border-zinc-700 text-zinc-500 cursor-not-allowed'
              : 'btn-primary text-white'
          }`}
          disabled={myConfirmed}
          onClick={() => send({ type: 'confirm_bunker_life' })}
        >
          {myConfirmed ? 'Ожидание остальных…' : 'Готов к жизни в бункере'}
        </button>
      </div>
    </div>
  );
}
