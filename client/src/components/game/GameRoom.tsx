import { useState } from 'react';
import { LogOut, CircleAlert, Info, Trophy, Shuffle, EyeOff, Eye, LayoutGrid, Table2, Users } from 'lucide-react';
import type { RoomState, ClientMessage, Player } from '../../types/game';
import BunkerInfo from '../bunker/BunkerInfo';
import StatusTable from './StatusTable';
import CharacterDossiers from './CharacterDossiers';
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
  const [playerView, setPlayerView] = useState<'dossiers' | 'table'>('dossiers');
  const myPlayer = roomState.players.find(player => player.id === myPlayerId);
  const isFinished = roomState.status === 'finished';
  const amEliminated = myPlayer ? !myPlayer.is_active : false;
  const activePlayerCount = roomState.players.filter(player => player.is_active).length;

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
      <div className="relative z-10 min-h-0 flex-1 flex flex-col p-3 gap-2 w-full">
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
          <div role="status" aria-live="polite" className={`card fixed right-4 top-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] items-center justify-center gap-2 px-4 py-3 text-center text-sm animate-fade-in-up ${
            votingResult.isTie ? '' : 'border-red-900/60'
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
          <div role={flashMessage.kind === 'error' ? 'alert' : 'status'} aria-live="polite" className={`card fixed right-4 top-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] items-start gap-3 px-4 py-3 text-sm shadow-2xl animate-fade-in-up ${
            flashMessage.kind === 'error'
              ? 'border-red-800/70 text-red-200'
              : 'flash-info'
          }`}>
            {flashMessage.kind === 'error' ? <CircleAlert size={18} className="mt-0.5 shrink-0" /> : <Info size={18} className="mt-0.5 shrink-0" />}
            <span className="leading-relaxed">{flashMessage.text}</span>
          </div>
        )}

        <div className="card relative z-[60] flex shrink-0 flex-wrap items-center gap-2 p-2">
          <Button variant="secondary" onClick={onLeave} className="h-10 w-10 p-0 text-zinc-300 hover:border-red-700 hover:bg-red-950/30 hover:text-red-400" aria-label="Выйти" title="Выйти"><LogOut className="h-6 w-6" strokeWidth={2.5} /></Button>
          {roomState.bunker && <BunkerInfo bunker={roomState.bunker} />}
          {roomState.bunker_capacity !== null && <span className={`flex h-10 items-center gap-2 rounded-xl border border-zinc-700 px-4 text-xs ${activePlayerCount <= roomState.bunker_capacity ? 'text-[var(--accent)]' : 'text-zinc-300'}`}><Users size={15} /> {activePlayerCount}/{roomState.bunker_capacity} людей</span>}
          {isFinished && <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-xs text-zinc-500">Завершена</span>}
          {(roomState.spectator_count ?? 0) > 0 && <span className="flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-xs text-zinc-400"><Eye size={10} /> {roomState.spectator_count}</span>}
          {showBunkerLifeReady && <BunkerLifeReadyButton activePlayers={roomState.players.filter(p => p.is_active)} confirmedIds={roomState.confirmed_bunker_life} myPlayerId={myPlayerId} send={send} />}
          <AdminPanel roomState={roomState} myPlayerId={myPlayerId} hasVoted={hasVoted} bunkerLifeReady={showBunkerLifeReady} send={send}>
            <div className="flex gap-2" role="group" aria-label="Вид списка персонажей">
              <button type="button" onClick={() => setPlayerView('dossiers')} className={`flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-700 transition-colors ${playerView === 'dossiers' ? 'text-[var(--accent)]' : 'text-zinc-500 hover:border-zinc-500 hover:text-zinc-200'}`} aria-label="Досье" title="Досье"><LayoutGrid size={13} /></button>
              <button type="button" onClick={() => setPlayerView('table')} className={`flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-700 transition-colors ${playerView === 'table' ? 'text-[var(--accent)]' : 'text-zinc-500 hover:border-zinc-500 hover:text-zinc-200'}`} aria-label="Таблица" title="Таблица"><Table2 size={13} /></button>
            </div>
          </AdminPanel>
        </div>

        {playerView === 'dossiers' ? (
          <CharacterDossiers players={roomState.players} myPlayerId={myPlayerId} send={send} />
        ) : (
          <StatusTable players={roomState.players} myPlayerId={myPlayerId} send={send} />
        )}

      </div>
    </div>
  );
}
