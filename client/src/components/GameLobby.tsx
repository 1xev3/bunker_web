import { useState } from 'react';
import { Copy, Link, Users, Crown, ArrowLeft, Rocket, Clock, Check, Package, ShieldCheck } from 'lucide-react';
import type { RoomState, ClientMessage } from '../types/game';

interface Props {
  roomState: RoomState;
  myPlayerId: string;
  send: (msg: ClientMessage) => void;
  onLeave: () => void;
}

const MAX_PLAYERS = 12;

// Deterministic accent hue per player so avatars feel distinct.
function avatarStyle(id: string): React.CSSProperties {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return {
    background: `linear-gradient(135deg, hsl(${hue} 55% 32%), hsl(${(hue + 40) % 360} 55% 22%))`,
    color: `hsl(${hue} 80% 85%)`,
  };
}

export default function GameLobby({ roomState, myPlayerId, send, onLeave }: Props) {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const isAdmin = roomState.admin_id === myPlayerId;
  const playerCount = roomState.players.length;
  const canStart = isAdmin && (playerCount >= 2 || import.meta.env.DEV);

  const copy = (kind: 'code' | 'link') => {
    navigator.clipboard.writeText(kind === 'code' ? roomState.room_code : window.location.href);
    setCopied(kind);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col relative isolate overflow-hidden">
      <div
        className="absolute inset-0 scale-105 blur-sm pointer-events-none"
        style={{
          backgroundImage: `
          radial-gradient(ellipse at 0% 0%, rgba(var(--accent-rgb), 0.13) 0%, transparent 45%),
          radial-gradient(ellipse at 100% 100%, rgba(var(--accent-rgb), 0.13) 0%, transparent 45%),
          linear-gradient(rgba(9, 9, 11, 0.75), rgba(9, 9, 11, 0.85)),
          radial-gradient(ellipse at 50% 0%, rgba(var(--accent-rgb),0.16) 0%, transparent 50%),
          url('/images/nuclear-apocalypse-poster.png')
        `,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      <header className="topbar relative z-10 px-4 py-3 flex items-center justify-between">
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

      <div className="relative z-10 flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-4xl animate-fade-in-up">
          <div className="grid md:grid-cols-5 gap-4">
            {/* Left: invite + meta */}
            <div className="md:col-span-2 space-y-4">
              <div className="card glow-card p-6">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-zinc-500 text-xs uppercase tracking-widest flex items-center gap-1.5">
                    <Copy size={11} className="text-zinc-500" /> Код комнаты
                  </p>
                  <span
                    className="text-[11px] font-medium px-2 py-0.5 rounded-md border flex items-center gap-1"
                    style={{
                      color: roomState.pack_meta.color,
                      borderColor: `color-mix(in srgb, ${roomState.pack_meta.color} 45%, transparent)`,
                      background: `color-mix(in srgb, ${roomState.pack_meta.color} 14%, transparent)`,
                    }}
                  >
                    <Package size={10} /> {roomState.pack_meta.name}
                  </span>
                </div>
                <div className="text-center mb-5">
                  <span
                    className="text-5xl font-mono font-bold tracking-[0.25em] text-zinc-100 select-all"
                    style={{ textShadow: '0 0 30px rgba(var(--accent-rgb),0.45)' }}
                  >
                    {roomState.room_code}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => copy('code')}
                    className={`flex-1 py-2 rounded-xl text-sm border transition-all flex items-center justify-center gap-1.5 ${
                      copied === 'code'
                        ? 'border-emerald-700/60 text-emerald-400 bg-emerald-950/30'
                        : 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 hover:bg-zinc-700/60'
                    }`}
                  >
                    {copied === 'code' ? <Check size={13} /> : <Copy size={13} />} {copied === 'code' ? 'Скопировано' : 'Код'}
                  </button>
                  <button
                    onClick={() => copy('link')}
                    className={`flex-1 py-2 rounded-xl text-sm border transition-all flex items-center justify-center gap-1.5 ${
                      copied === 'link'
                        ? 'border-emerald-700/60 text-emerald-400 bg-emerald-950/30'
                        : 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 hover:bg-zinc-700/60'
                    }`}
                  >
                    {copied === 'link' ? <Check size={13} /> : <Link size={13} />} {copied === 'link' ? 'Скопировано' : 'Ссылка'}
                  </button>
                </div>
                <p className="text-zinc-600 text-xs text-center mt-4 leading-relaxed">
                  Поделитесь кодом или ссылкой с друзьями, чтобы&nbsp;они присоединились к&nbsp;игре.
                </p>
              </div>

              {/* Start / wait */}
              {isAdmin ? (
                <button
                  className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
                    canStart ? 'btn-primary text-white' : 'bg-zinc-900 border border-zinc-800 text-zinc-600 cursor-not-allowed'
                  }`}
                  disabled={!canStart}
                  onClick={() => send({ type: 'start_game' })}
                >
                  {canStart ? (
                    <><Rocket size={15} /> Начать игру</>
                  ) : (
                    <><Clock size={15} /> Нужно минимум 2 игрока</>
                  )}
                </button>
              ) : (
                <div className="card p-4 text-center">
                  <p className="text-zinc-400 text-sm flex items-center justify-center gap-2">
                    <span className="inline-block w-1.5 h-1.5 rounded-full ready-dot animate-pulse"></span>
                    Ожидаем, пока ведущий начнёт игру…
                  </p>
                </div>
              )}
            </div>

            {/* Right: players */}
            <div className="md:col-span-3 card p-5 flex flex-col">
              <p className="text-zinc-500 text-xs uppercase tracking-widest mb-4 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Users size={11} className="text-zinc-500" /> Игроки в комнате
                </span>
                <span className="font-mono text-zinc-500">
                  <span className="text-zinc-300">{playerCount}</span> / {MAX_PLAYERS}
                </span>
              </p>

              <div className="grid sm:grid-cols-2 gap-2 content-start flex-1">
                {roomState.players.map((p, i) => {
                  const isMe = p.id === myPlayerId;
                  const isRoomAdmin = p.id === roomState.admin_id;
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                        isMe ? 'player-row-me' : 'border-zinc-800/70 bg-zinc-900/40 hover:bg-zinc-800/40'
                      }`}
                    >
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 shadow-inner"
                        style={isMe ? undefined : avatarStyle(p.id)}
                      >
                        <span className={isMe ? 'player-avatar-me w-full h-full rounded-full flex items-center justify-center' : ''}>
                          {p.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-sm font-medium truncate ${isMe ? 'player-name-me' : 'text-zinc-200'}`}>
                            {p.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {isRoomAdmin && (
                            <span className="admin-badge text-[10px] border px-1.5 py-0.5 rounded-md flex items-center gap-1">
                              <Crown size={9} /> ведущий
                            </span>
                          )}
                          {isMe && !isRoomAdmin && (
                            <span className="text-[10px] text-zinc-500 border border-zinc-700/50 px-1.5 py-0.5 rounded-md">вы</span>
                          )}
                          {!isRoomAdmin && !isMe && (
                            <span className="text-[10px] text-zinc-600 flex items-center gap-1">
                              <ShieldCheck size={9} /> готов
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-zinc-700 text-xs shrink-0 font-mono">#{i + 1}</span>
                    </div>
                  );
                })}

                {/* Empty slot hint while waiting for a second player */}
                {playerCount < 2 && (
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-dashed border-zinc-800 text-zinc-600">
                    <div className="w-9 h-9 rounded-full border border-dashed border-zinc-700 flex items-center justify-center shrink-0">
                      <Users size={14} className="text-zinc-700" />
                    </div>
                    <span className="text-sm">Ждём игроков…</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
