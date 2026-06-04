import { ArrowLeft, Shield, Skull } from 'lucide-react';
import type { RoomState } from '../types/game';
import { renderEventText } from './event/eventUtils';

interface Props {
  survived: boolean;
  roomState: RoomState;
  onLeave: () => void;
}

export default function BunkerEndScreen({ survived, roomState, onLeave }: Props) {
  const activePlayers = roomState.players.filter(p => p.is_active);
  const bunker = roomState.bunker;
  const avgHealth = activePlayers.length > 0
    ? Math.round(activePlayers.reduce((sum, p) => sum + (p.vital_status?.health ?? 0), 0) / activePlayers.length)
    : 0;
  const avgSanity = activePlayers.length > 0
    ? Math.round(activePlayers.reduce((sum, p) => sum + (p.vital_status?.sanity ?? 0), 0) / activePlayers.length)
    : 0;

  return (
    <div
      className="min-h-screen bg-zinc-950 flex flex-col items-center justify-start relative isolate overflow-hidden"
    >
      <div
        className="absolute inset-0 scale-105 blur-sm pointer-events-none"
        style={{
          backgroundImage: `
          radial-gradient(ellipse at 0% 0%, rgba(var(--accent-rgb), 0.13) 0%, transparent 45%),
          radial-gradient(ellipse at 100% 100%, rgba(var(--accent-rgb), 0.13) 0%, transparent 45%),
          linear-gradient(rgba(9, 9, 11, 0.75), rgba(9, 9, 11, 0.86)),
          url('/images/bunker-control-room.png')
        `,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
      />
      <header className="topbar w-full px-4 py-3 flex items-center justify-between shrink-0 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <span className="text-amber-500 text-sm">☢</span>
          <span className="text-zinc-300 font-semibold text-sm">Бункер</span>
          <span className="text-zinc-700">·</span>
          <span className="font-mono text-zinc-500 text-sm tracking-widest">{roomState.room_code}</span>
        </div>
        <button
          onClick={onLeave}
          className="text-zinc-500 hover:text-zinc-100 text-sm transition-all flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-zinc-800 border border-transparent hover:border-zinc-700"
        >
          <ArrowLeft size={14} /> Выйти
        </button>
      </header>

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-6 gap-6 w-full max-w-lg mx-auto">
        {/* Main result icon */}
        <div className={`rounded-full p-6 ${survived ? 'bg-green-950/40 border border-green-800/40' : 'bg-red-950/40 border border-red-800/40'}`}>
          {survived
            ? <Shield size={56} className="text-green-400" />
            : <Skull size={56} className="text-red-400" />
          }
        </div>

        {/* Title */}
        <div className="text-center">
          <h1 className={`text-3xl font-bold mb-2 ${survived ? 'text-green-300' : 'text-red-300'}`}>
            {survived ? 'Бункер выжил!' : 'Бункер пал'}
          </h1>
          <p className="text-zinc-400 text-sm leading-relaxed">
            {survived
              ? `Выжившие продержались ${roomState.current_month} месяцев и вышли в новый мир.`
              : `Попытка продержаться в бункере провалилась на ${roomState.current_month}-м месяце.`
            }
          </p>
        </div>

        {/* Stats */}
        <div className="card w-full divide-y divide-zinc-800">
          {bunker?.theme && (
            <div className="px-4 py-3 flex items-center justify-between">
              <span className="text-zinc-500 text-sm">Катастрофа</span>
              <span className="text-zinc-300 text-sm font-medium text-right max-w-[60%]">{renderEventText(bunker.theme.label)}</span>
            </div>
          )}
          {bunker?.duration && (
            <div className="px-4 py-3 flex items-center justify-between">
              <span className="text-zinc-500 text-sm">Срок укрытия</span>
              <span className="text-zinc-300 text-sm font-medium">{bunker.duration.label}</span>
            </div>
          )}
          <div className="px-4 py-3 flex items-center justify-between">
            <span className="text-zinc-500 text-sm">Прожито месяцев</span>
            <span className="text-zinc-300 text-sm font-mono font-bold">{roomState.current_month}
              {roomState.total_months > 0 && <span className="text-zinc-600"> / {roomState.total_months}</span>}
            </span>
          </div>
          <div className="px-4 py-3 flex items-center justify-between">
            <span className="text-zinc-500 text-sm">Среднее здоровье</span>
            <span className={`text-sm font-mono font-bold ${avgHealth > 30 ? 'text-green-400' : 'text-red-400'}`}>
              {avgHealth}
            </span>
          </div>
          <div className="px-4 py-3 flex items-center justify-between">
            <span className="text-zinc-500 text-sm">Средний рассудок</span>
            <span className={`text-sm font-mono font-bold ${avgSanity > 30 ? 'text-sky-400' : 'text-red-400'}`}>
              {avgSanity}
            </span>
          </div>
          {bunker?.food && (
            <div className="px-4 py-3 flex items-center justify-between">
              <span className="text-zinc-500 text-sm">Еда</span>
              <span className="text-zinc-300 text-sm font-medium text-right max-w-[60%]">{bunker.food.label} ({bunker.food.amount} на человека)</span>
            </div>
          )}
        </div>

        {/* Survivors */}
        {activePlayers.length > 0 && (
          <div className="card w-full px-4 py-3">
            <p className="text-zinc-500 text-xs uppercase tracking-widest mb-3">
              {survived ? 'Выжившие' : 'Последние в живых'}
            </p>
            <div className="flex flex-col gap-2">
              {activePlayers.map(p => (
                <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-800">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-zinc-200 text-sm font-medium">{p.name}</span>
                    {p.attributes.profession && (
                      <span className="text-zinc-500 text-xs">{p.attributes.profession.display}</span>
                    )}
                  </div>
                  {p.attributes.health && (
                    <span className="text-zinc-600 text-xs">{p.attributes.health.display}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={onLeave}
          className="w-full py-3 rounded-xl text-sm font-semibold btn-primary text-white"
        >
          Завершить игру
        </button>
      </div>
    </div>
  );
}
