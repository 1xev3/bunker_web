import { Check, ChevronDown, Vote } from 'lucide-react';
import type { ClientMessage, Player, RoomState } from '../../types/game';
import Button from '../ui/Button';

interface Props { players: Player[]; myPlayerId: string; isAdmin: boolean; hasVoted: boolean; voting: RoomState['voting']; send: (msg: ClientMessage) => void; }

export default function VotingModal({ players, myPlayerId, isAdmin, hasVoted, voting, send }: Props) {
  const idle = voting.phase === 'idle' || voting.phase === 'proposing';
  const proposed = voting.start_approvals.includes(myPlayerId);
  const cancelling = voting.cancel_approvals.includes(myPlayerId);
  const connected = players.filter(p => p.is_active && p.connection_status === 'connected').length;
  const candidates = players.filter(p => voting.candidate_ids.includes(p.id) && p.id !== myPlayerId);

  if (idle) return <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
    <span className="hidden items-center gap-1.5 text-xs text-zinc-500 lg:flex"><Vote size={14} className="text-amber-500" /> {voting.start_approvals.length}/{connected}</span>
    <Button className={`h-10 px-3 text-xs ${proposed ? 'border-amber-700 bg-amber-950/30 text-amber-200' : ''}`} onClick={() => send({ type: 'toggle_voting_proposal' })}>{proposed ? 'Голосование поддержано' : 'Предложить голосование'}</Button>
    {isAdmin && <Button variant="danger" className="h-10 px-3 text-xs" title="Начать без общего согласия" onClick={() => window.confirm('Начать без общего согласия?') && send({ type: 'force_start_voting' })}>Начать сразу</Button>}
  </div>;

  return <details className="relative min-w-0 flex-1" open>
    <summary className="flex h-10 cursor-pointer list-none items-center justify-between gap-3 rounded-lg border border-amber-800/60 bg-amber-950/20 px-3 text-xs text-amber-200">
      <span className="flex items-center gap-2"><Vote size={14} /> {voting.round_kind === 'runoff' ? 'Второй тур' : 'Голосование'}{hasVoted && <Check size={13} className="text-emerald-400" />}</span>
      <span className="flex items-center gap-2 font-mono text-zinc-400">{voting.voted_player_ids.length}/{voting.electorate_ids.length}<ChevronDown size={12} /></span>
    </summary>
    <div className="card absolute right-0 top-[calc(100%+8px)] z-50 w-[min(680px,calc(100vw-24px))] p-3 shadow-2xl">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {candidates.map(player => <Button key={player.id} variant={voting.my_vote === player.id ? 'primary' : 'secondary'} className="justify-start px-3 py-2 text-left" onClick={() => send({ type: 'cast_elimination_vote', target_id: player.id })}>{player.name}{voting.my_vote === player.id && <Check size={13} className="ml-auto" />}</Button>)}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button className={`px-3 py-2 text-xs ${cancelling ? 'border-amber-700 text-amber-200' : ''}`} onClick={() => send({ type: 'toggle_voting_cancellation' })}>{cancelling ? 'Отмена поддержана' : 'Предложить отмену'} · {voting.cancel_approvals.length}/{voting.electorate_ids.length}</Button>
        {isAdmin && <Button variant="danger" className="px-3 py-2 text-xs" onClick={() => window.confirm('Отменить без общего согласия?') && send({ type: 'force_cancel_voting' })}>Отменить сразу</Button>}
      </div>
    </div>
  </details>;
}
