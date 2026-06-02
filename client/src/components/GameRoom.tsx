import { ArrowLeft, Trophy, Shuffle, EyeOff } from 'lucide-react';
import type { RoomState, ClientMessage, Player } from '../types/game';
import BunkerInfo from './BunkerInfo';
import StatusTable from './StatusTable';
import VotingModal from './VotingModal';
import AdminPanel from './AdminPanel';

interface Props {
  roomState: RoomState;
  myPlayerId: string;
  send: (msg: ClientMessage) => void;
  votingResult: { eliminated: Player | null; isTie: boolean } | null;
  gameWinner: Player | null | undefined;
  hasVoted: boolean;
  flashMessage: { kind: 'info' | 'error'; text: string } | null;
  onLeave: () => void;
}

export default function GameRoom({
  roomState,
  myPlayerId,
  send,
  votingResult,
  gameWinner,
  hasVoted,
  flashMessage,
  onLeave,
}: Props) {
  const myPlayer = roomState.players.find(player => player.id === myPlayerId);
  const isFinished = roomState.status === 'finished';
  const amEliminated = myPlayer ? !myPlayer.is_active : false;

  return (
    <div
      className="min-h-screen bg-zinc-950 flex flex-col"
      style={{
        backgroundImage: `
          linear-gradient(rgba(9, 9, 11, 0.88), rgba(9, 9, 11, 0.92)),
          radial-gradient(circle at top, rgba(var(--accent-rgb), 0.04), transparent 35%),
          url('/images/bunker-control-room.png')
        `,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <header className="border-b border-zinc-900/80 px-4 py-3 flex items-center justify-between shrink-0 backdrop-blur-sm bg-zinc-950/90 sticky top-0 z-10">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-amber-500 text-sm">☢</span>
          <span className="text-zinc-300 font-semibold text-sm">Бункер</span>
          <span className="text-zinc-700">·</span>
          <span className="font-mono text-zinc-500 text-sm tracking-widest">{roomState.room_code}</span>
          {roomState.round > 0 && (
            <>
              <span className="text-zinc-700">·</span>
              <span className="text-xs text-zinc-500 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-full">
                Раунд {roomState.round}
              </span>
            </>
          )}
          {roomState.bunker_capacity !== null && (
            <>
              <span className="text-zinc-700">·</span>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${
                roomState.players.filter(p => p.is_active).length <= roomState.bunker_capacity
                  ? 'phase-banner-voting'
                  : 'text-zinc-400 border-zinc-800 bg-zinc-900'
              }`}>
                {roomState.players.filter(p => p.is_active).length}/{roomState.bunker_capacity} в бункере
              </span>
            </>
          )}
          {isFinished && (
            <span className="text-xs text-zinc-500 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-full">
              Завершена
            </span>
          )}
        </div>
        <button
          onClick={onLeave}
          className="text-zinc-500 hover:text-zinc-100 text-sm transition-all flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-zinc-800 border border-transparent hover:border-zinc-700"
        >
          <ArrowLeft size={14} /> Выйти
        </button>
      </header>

      <div className="flex-1 flex flex-col p-4 gap-3 w-full">
        {isFinished && gameWinner !== undefined && (
          <div className={`rounded-xl border p-4 text-center animate-fade-in-up ${
            gameWinner
              ? 'phase-banner-winner'
              : 'border-zinc-800 bg-zinc-900/60'
          }`}>
            {gameWinner ? (
              <>
                <Trophy size={28} className="winner-trophy mx-auto mb-2" />
                <p className="winner-name font-bold text-lg">Победитель: {gameWinner.name}</p>
                <p className="text-zinc-500 text-sm mt-0.5">Занял место в бункере</p>
              </>
            ) : (
              <p className="text-zinc-400 font-medium">Игра завершена</p>
            )}
          </div>
        )}

        {votingResult && (
          <div className={`rounded-xl border py-3 px-4 text-center animate-fade-in-up flex items-center justify-center gap-2 ${
            votingResult.isTie
              ? 'border-zinc-700 bg-zinc-900/60'
              : 'border-red-900/40 bg-red-950/20'
          }`}>
            {votingResult.isTie ? (
              <>
                <Shuffle size={14} className="text-zinc-400 shrink-0" />
                <span className="text-zinc-400 text-sm">Ничья, никто не исключён. Голосование повторяется.</span>
              </>
            ) : (
              <>
                <span className="text-sm text-zinc-400">Исключён:</span>
                <span className="text-red-300 font-semibold text-sm">{votingResult.eliminated?.name}</span>
              </>
            )}
          </div>
        )}

        {amEliminated && (
          <div className="rounded-xl border border-zinc-800/60 py-2.5 px-4 text-center bg-zinc-900/30 flex items-center justify-center gap-2">
            <EyeOff size={13} className="text-zinc-500" />
            <span className="text-zinc-500 text-sm">Вы выбыли. Можно наблюдать за игрой.</span>
          </div>
        )}

        {flashMessage && (
          <div className={`rounded-xl border py-3 px-4 text-center text-sm animate-fade-in-up ${
            flashMessage.kind === 'error'
              ? 'border-red-900/40 bg-red-950/20 text-red-300'
              : 'flash-info'
          }`}>
            {flashMessage.text}
          </div>
        )}

        {roomState.bunker && <BunkerInfo bunker={roomState.bunker} />}

        <StatusTable
          players={roomState.players}
          myPlayerId={myPlayerId}
          send={send}
        />

        <AdminPanel roomState={roomState} myPlayerId={myPlayerId} send={send} />
      </div>

      {roomState.is_voting && myPlayer?.is_active && (
        <VotingModal
          players={roomState.players}
          myPlayerId={myPlayerId}
          hasVoted={hasVoted}
          votedPlayers={roomState.voted_players}
          votes={roomState.votes}
          send={send}
        />
      )}
    </div>
  );
}
