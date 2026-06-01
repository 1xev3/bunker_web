import { useState } from 'react';
import { Vote, UserX, Flag, Check, X, Crown } from 'lucide-react';
import type { RoomState, ClientMessage } from '../types/game';

interface Props {
  roomState: RoomState;
  send: (msg: ClientMessage) => void;
}

export default function AdminPanel({ roomState, send }: Props) {
  const [confirmEnd, setConfirmEnd] = useState(false);

  const active = roomState.players.filter(p => p.is_active);
  const canVote = !roomState.is_voting && active.length >= 2;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 shadow-[0_10px_30px_rgba(0,0,0,0.16)] px-4 py-3">
      <p className="text-zinc-500 text-xs uppercase tracking-widest mb-3 flex items-center gap-1.5">
        <Crown size={11} className="text-zinc-500" /> Управление
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${
            canVote
              ? 'btn-primary text-white'
              : 'bg-zinc-900 border border-zinc-800 text-zinc-600 cursor-not-allowed'
          }`}
          disabled={!canVote}
          onClick={() => send({ type: 'start_voting' })}
        >
          {roomState.is_voting
            ? <><span className="inline-block w-1.5 h-1.5 rounded-full bg-current animate-pulse"></span> Голосование идёт…</>
            : <><Vote size={14} /> Начать голосование</>
          }
        </button>

        <KickDropdown players={roomState.players} send={send} />

        {!confirmEnd ? (
          <button
            className="px-4 py-2 rounded-xl text-sm border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 hover:bg-zinc-700/60 transition-all flex items-center gap-2"
            onClick={() => setConfirmEnd(true)}
          >
            <Flag size={14} /> Завершить игру
          </button>
        ) : (
          <div className="flex gap-2 items-center">
            <span className="text-zinc-600 text-xs">Точно завершить?</span>
            <button
              className="px-3 py-2 rounded-xl text-sm btn-danger text-red-200 font-medium transition-all flex items-center gap-1.5"
              onClick={() => { send({ type: 'end_game' }); setConfirmEnd(false); }}
            >
              <Check size={13} /> Да
            </button>
            <button
              className="px-3 py-2 rounded-xl text-sm text-zinc-500 hover:text-zinc-200 transition-colors flex items-center gap-1"
              onClick={() => setConfirmEnd(false)}
            >
              <X size={13} /> Отмена
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function KickDropdown({ players, send }: { players: RoomState['players']; send: (msg: ClientMessage) => void }) {
  const [selected, setSelected] = useState('');
  const active = players.filter(p => p.is_active);

  const handleKick = () => {
    if (!selected) return;
    send({ type: 'kick_player', player_id: selected });
    setSelected('');
  };

  return (
    <div className="flex gap-1.5">
      <select
        className="bg-zinc-800/80 border border-zinc-700 text-zinc-400 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200 cursor-pointer"
        value={selected}
        onChange={e => setSelected(e.target.value)}
      >
        <option value="">Исключить…</option>
        {active.map(p => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      {selected && (
        <button
          className="px-3 py-2 rounded-xl text-sm btn-danger text-red-300 font-medium transition-all flex items-center gap-1"
          onClick={handleKick}
        >
          <UserX size={14} />
        </button>
      )}
    </div>
  );
}
