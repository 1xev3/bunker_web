import { Vote, Check, PauseCircle } from 'lucide-react';
import type { Player, ClientMessage, RoomState } from '../../types/game';

interface Props {
  players: Player[];
  myPlayerId: string;
  isAdmin: boolean;
  hasVoted: boolean;
  votedPlayers: string[];
  electorateIds: string[];
  votes: RoomState['votes'];
  send: (msg: ClientMessage) => void;
}

export default function VotingModal({ players, myPlayerId, isAdmin, hasVoted, votedPlayers, electorateIds, votes, send }: Props) {
  const active = players.filter(player => player.is_active);
  const myVoteTarget = votes[myPlayerId];

  return (
    <aside className="fixed bottom-4 right-4 z-40 w-[calc(100%-2rem)] max-w-sm max-h-[75vh] overflow-auto">
      <div className="bg-zinc-900/95 backdrop-blur border border-zinc-700/80 rounded-2xl p-5 shadow-2xl animate-fade-in-up">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2"><Vote size={18} className="text-amber-500" /><h2 className="font-bold text-zinc-100">Голосование</h2></div>
          <span className="text-xs text-zinc-400 bg-zinc-800 border border-zinc-700 px-2.5 py-1 rounded-full font-mono">{votedPlayers.length} / {electorateIds.length}</span>
        </div>
        {hasVoted && <p className="mb-3 text-xs text-emerald-400 flex items-center gap-1.5"><Check size={13} /> Голос учтён. Его можно изменить.</p>}
        <div className="space-y-1.5">
          {active.filter(player => player.id !== myPlayerId).map(player => {
            const selected = myVoteTarget === player.id;
            return (
              <button key={player.id} className={`w-full border rounded-xl py-2.5 px-4 text-left text-sm flex items-center gap-2.5 transition-all ${selected ? 'border-amber-600 bg-amber-950/30 text-amber-200' : 'bg-zinc-800/30 border-zinc-700/60 hover:border-red-700/60 text-zinc-200'}`} onClick={() => send({ type: 'cast_elimination_vote', target_id: player.id })}>
                <span className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold">{player.name.charAt(0).toUpperCase()}</span>
                <span className="font-medium">{player.name}</span>
                {selected && <Check size={14} className="ml-auto" />}
              </button>
            );
          })}
        </div>
        <button className="mt-4 w-full px-4 py-2.5 rounded-xl text-sm border border-zinc-700 text-zinc-300 hover:bg-zinc-800 flex items-center justify-center gap-2" onClick={() => send({ type: 'toggle_voting_cancellation' })}>
          <PauseCircle size={14} /> Предложить / отозвать отмену
        </button>
        {isAdmin && <button className="mt-2 w-full px-4 py-2 rounded-xl text-xs border border-red-900/50 text-red-300" onClick={() => window.confirm('Принудительно отменить голосование?') && send({ type: 'force_cancel_voting' })}>Аварийная отмена</button>}
      </div>
    </aside>
  );
}
