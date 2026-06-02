import { useState } from 'react';
import { Copy, Link, Users, Crown, ArrowLeft, Rocket, Clock } from 'lucide-react';
import type { RoomState, ClientMessage } from '../types/game';

interface Props {
  roomState: RoomState;
  myPlayerId: string;
  send: (msg: ClientMessage) => void;
  onLeave: () => void;
}

export default function GameLobby({ roomState, myPlayerId, send, onLeave }: Props) {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const isAdmin = roomState.admin_id === myPlayerId;
  const canStart = isAdmin && (roomState.players.length >= 2 || import.meta.env.DEV);

  const copyCode = () => {
    navigator.clipboard.writeText(roomState.room_code);
    setCopied('code');
    setTimeout(() => setCopied(null), 2000);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied('link');
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div
      className="min-h-screen bg-zinc-950 flex flex-col"
      style={{
        backgroundImage: `
          linear-gradient(rgba(9, 9, 11, 0.86), rgba(9, 9, 11, 0.9)),
          radial-gradient(ellipse at 50% 0%, rgba(var(--accent-rgb),0.06) 0%, transparent 50%),
          url('/images/nuclear-apocalypse-poster.png')
        `,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <header className="border-b border-zinc-900 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-amber-500 text-sm">☢</span>
          <span className="text-zinc-300 font-semibold text-sm">Бункер</span>
        </div>
        <button
          onClick={onLeave}
          className="text-zinc-500 hover:text-zinc-100 text-sm transition-all flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-zinc-800 border border-transparent hover:border-zinc-700"
        >
          <ArrowLeft size={14} /> Выйти
        </button>
      </header>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4 animate-fade-in-up">
          {/* Room code */}
          <div className="card glow-card p-6">
            <p className="text-zinc-500 text-xs uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Copy size={11} className="text-zinc-500" /> Код комнаты
            </p>
            <div className="text-center mb-5">
              <span className="text-5xl font-mono font-bold tracking-[0.25em] text-zinc-100 select-all" style={{ textShadow: '0 0 30px rgba(var(--accent-rgb),0.1)' }}>
                {roomState.room_code}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={copyCode}
                className={`flex-1 py-2 rounded-xl text-sm border transition-all flex items-center justify-center gap-1.5 ${
                  copied === 'code'
                    ? 'border-emerald-700/60 text-emerald-400 bg-emerald-950/30'
                    : 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 hover:bg-zinc-700/60'
                }`}
              >
                <Copy size={13} /> {copied === 'code' ? 'Скопировано' : 'Код'}
              </button>
              <button
                onClick={copyLink}
                className={`flex-1 py-2 rounded-xl text-sm border transition-all flex items-center justify-center gap-1.5 ${
                  copied === 'link'
                    ? 'border-emerald-700/60 text-emerald-400 bg-emerald-950/30'
                    : 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 hover:bg-zinc-700/60'
                }`}
              >
                <Link size={13} /> {copied === 'link' ? 'Скопировано' : 'Ссылка'}
              </button>
            </div>
          </div>

          {/* Players */}
          <div className="card p-4">
            <p className="text-zinc-500 text-xs uppercase tracking-widest mb-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5"><Users size={11} className="text-zinc-500" /> Игроки</span>
              <span className="font-mono text-zinc-600">{roomState.players.length} / 15</span>
            </p>
            <div className="space-y-1">
              {roomState.players.map((p, i) => (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 px-2 py-2 rounded-lg transition-colors ${
                    p.id === myPlayerId ? 'player-row-me' : 'hover:bg-zinc-800/30'
                  }`}
                >
                  <span className="text-zinc-700 text-xs w-4 text-right shrink-0 font-mono">{i + 1}</span>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    p.id === myPlayerId ? 'player-avatar-me' : 'bg-zinc-800 text-zinc-400'
                  }`}>
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <span className={`text-sm flex-1 font-medium ${p.id === myPlayerId ? 'player-name-me' : 'text-zinc-200'}`}>
                    {p.name}
                  </span>
                  <div className="flex gap-1.5 items-center">
                    {p.id === roomState.admin_id && (
                      <span className="admin-badge text-xs border px-1.5 py-0.5 rounded-md flex items-center gap-1">
                        <Crown size={10} /> ведущий
                      </span>
                    )}
                    {p.id === myPlayerId && p.id !== roomState.admin_id && (
                      <span className="text-xs text-zinc-500 border border-zinc-700/50 px-1.5 py-0.5 rounded-md">вы</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Start / wait */}
          {isAdmin ? (
            <button
              className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
                canStart
                  ? 'btn-primary text-white'
                  : 'bg-zinc-900 border border-zinc-800 text-zinc-600 cursor-not-allowed'
              }`}
              disabled={!canStart}
              onClick={() => send({ type: 'start_game' })}
            >
              {canStart
                ? <><Rocket size={15} /> Начать игру</>
                : <><Clock size={15} /> Нужно минимум 2 игрока</>
              }
            </button>
          ) : (
            <div className="text-center py-3">
              <p className="text-zinc-500 text-sm flex items-center justify-center gap-2">
                <span className="inline-block w-1.5 h-1.5 rounded-full ready-dot animate-pulse"></span>
                Ожидаем ведущего…
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
