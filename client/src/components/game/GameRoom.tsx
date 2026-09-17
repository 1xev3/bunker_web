import { ArrowLeft, Trophy, Shuffle, EyeOff, Eye } from 'lucide-react';
import type { RoomState, ClientMessage, Player } from '../../types/game';
import BunkerInfo from '../bunker/BunkerInfo';
import StatusTable from './StatusTable';
import AdminPanel from '../admin/AdminPanel';
import Button from '../ui/Button';
import BunkerLifeReadyButton from './BunkerLifeReadyButton';

interface Props {
  roomState: RoomState;
  myPlayerId: string;
  send: (msg: ClientMessage) => void;
  votingResult: { eliminated: Player | null; isTie: boolean } | null;
  gameWinner: Player | null | undefined;
  hasVoted: boolean;
  flashMessage: { kind: 'info' | 'error'; text: string } | null;
  showBunkerLifeReady: boolean;
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
  showBunkerLifeReady,
  onLeave,
}: Props) {
  const myPlayer = roomState.players.find(player => player.id === myPlayerId);
  const isFinished = roomState.status === 'finished';
  const amEliminated = myPlayer ? !myPlayer.is_active : false;

  return (
    <div
      className="h-screen bg-zinc-950 flex flex-col relative isolate overflow-hidden"
    >
      <div
        className="absolute inset-0 scale-105 blur-sm pointer-events-none"
        style={{
          backgroundImage: `
          radial-gradient(ellipse at 0% 0%, rgba(var(--accent-rgb), 0.13) 0%, transparent 45%),
          radial-gradient(ellipse at 100% 100%, rgba(var(--accent-rgb), 0.13) 0%, transparent 45%),
          linear-gradient(rgba(9, 9, 11, 0.78), rgba(9, 9, 11, 0.86)),
          radial-gradient(circle at top, rgba(var(--accent-rgb), 0.13), transparent 35%),
          url('/images/bunker-control-room.png')
        `,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
      />
      <header className="topbar px-3 py-1.5 flex items-center justify-between shrink-0 z-[60]">
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
          {(roomState.spectator_count ?? 0) > 0 && (
            <>
              <span className="text-zinc-700">·</span>
              <span className="text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Eye size={10} /> {roomState.spectator_count}
              </span>
            </>
          )}
        </div>
        <Button
          variant="ghost"
          onClick={onLeave}
          className="px-3 py-1.5"
        >
          <ArrowLeft size={14} /> Выйти
        </Button>
      </header>

      <div className="relative z-10 min-h-0 flex-1 flex flex-col px-3 pb-3 pt-1 gap-2 w-full">
        {isFinished && gameWinner !== undefined && (
          <div className={`card p-4 text-center animate-fade-in-up ${
            gameWinner ? 'phase-banner-winner' : ''
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
          <div className={`card py-3 px-4 text-center animate-fade-in-up flex items-center justify-center gap-2 ${
            votingResult.isTie ? '' : 'border-red-900/40 bg-red-950/20'
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
          <div className="card py-2.5 px-4 text-center flex items-center justify-center gap-2">
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

        <div className="card relative z-20 flex shrink-0 items-center gap-2 p-2">
          {roomState.bunker && <BunkerInfo bunker={roomState.bunker} />}
          {showBunkerLifeReady && <BunkerLifeReadyButton activePlayers={roomState.players.filter(p => p.is_active)} confirmedIds={roomState.confirmed_bunker_life} myPlayerId={myPlayerId} send={send} />}
          <AdminPanel roomState={roomState} myPlayerId={myPlayerId} hasVoted={hasVoted} send={send} />
        </div>

        <StatusTable
          players={roomState.players}
          myPlayerId={myPlayerId}
          send={send}
        />

      </div>
    </div>
  );
}
