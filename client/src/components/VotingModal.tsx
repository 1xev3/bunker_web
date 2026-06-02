import { Vote, Check, PauseCircle } from 'lucide-react';
import type { Player, ClientMessage, RoomState } from '../types/game';

interface Props {
  players: Player[];
  myPlayerId: string;
  isAdmin: boolean;
  hasVoted: boolean;
  votedPlayers: string[];
  votes: RoomState['votes'];
  send: (msg: ClientMessage) => void;
}

export default function VotingModal({ players, myPlayerId, isAdmin, hasVoted, votedPlayers, votes, send }: Props) {
  const active = players.filter(p => p.is_active);
  const votableOptions = active.filter(p => p.id !== myPlayerId);
  const myVoteTarget = votes[myPlayerId];
  const totalVoted = votedPlayers.length;
  const totalActive = active.length;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-700/80 rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-fade-in-up" style={{ boxShadow: '0 0 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)' }}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Vote size={18} className="text-amber-500" />
            <h2 className="text-lg font-bold text-zinc-100">Голосование</h2>
          </div>
          <span className="text-xs text-zinc-400 bg-zinc-800 border border-zinc-700 px-2.5 py-1 rounded-full font-mono">
            {totalVoted} / {totalActive}
          </span>
        </div>

        {hasVoted ? (
          <div className="text-center py-6">
            <div className="w-14 h-14 rounded-full bg-emerald-950/50 border border-emerald-700/40 flex items-center justify-center mx-auto mb-4">
              <Check size={24} className="text-emerald-400" />
            </div>
            <p className="text-zinc-200 font-semibold">Голос учтён</p>
            {myVoteTarget && (
              <p className="text-zinc-500 text-sm mt-1">
                Выбор: <span className="text-zinc-300">{players.find(p => p.id === myVoteTarget)?.name}</span>
              </p>
            )}
            <p className="text-zinc-600 text-xs mt-4">Ожидаем остальных…</p>
            <div className="mt-4 flex justify-center gap-1.5">
              {Array.from({ length: totalActive }).map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full transition-colors ${i < totalVoted ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                />
              ))}
            </div>
            {isAdmin && (
              <button
                className="mt-5 w-full px-4 py-2.5 rounded-xl text-sm border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 hover:bg-zinc-700/60 transition-all flex items-center justify-center gap-2"
                onClick={() => send({ type: 'cancel_voting' })}
              >
                <PauseCircle size={14} /> Отложить голосование
              </button>
            )}
          </div>
        ) : (
          <>
            <p className="text-zinc-500 text-sm mb-3">Кто должен покинуть бункер?</p>
            <div className="space-y-1.5">
              {votableOptions.map(player => (
                <button
                  key={player.id}
                  className="w-full border rounded-xl py-2.5 px-4 transition-all text-left text-sm flex items-center justify-between group bg-zinc-800/30 border-zinc-700/60 hover:bg-red-900/30 hover:border-red-700/60 hover:text-red-200"
                  onClick={() => send({ type: 'submit_vote', target_id: player.id })}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-zinc-700 text-zinc-400 group-hover:bg-red-900/50 group-hover:text-red-300">
                      {player.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium text-zinc-200">{player.name}</span>
                  </div>
                </button>
              ))}
            </div>
            {isAdmin && (
              <button
                className="mt-4 w-full px-4 py-2.5 rounded-xl text-sm border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 hover:bg-zinc-700/60 transition-all flex items-center justify-center gap-2"
                onClick={() => send({ type: 'cancel_voting' })}
              >
                <PauseCircle size={14} /> Отложить голосование
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
