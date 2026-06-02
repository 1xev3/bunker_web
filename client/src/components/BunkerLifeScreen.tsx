import { useEffect, useState, useRef } from 'react';
import { ArrowLeft, Heart, Calendar, TrendingUp, TrendingDown } from 'lucide-react';
import type { RoomState, ClientMessage } from '../types/game';
import EventModal from './EventModal';

interface Props {
  roomState: RoomState;
  send: (msg: ClientMessage) => void;
  onLeave: () => void;
  eventOutcome: { outcome: 'success' | 'failure' | 'nothing'; survival_change: number } | null;
}

function SurvivalBar({ chance }: { chance: number }) {
  const color =
    chance >= 70 ? 'bg-green-500' :
    chance >= 40 ? 'bg-yellow-500' :
    chance >= 20 ? 'bg-orange-500' : 'bg-red-500';

  const label =
    chance >= 70 ? 'Хорошо' :
    chance >= 40 ? 'Тяжело' :
    chance >= 20 ? 'Критично' : 'Катастрофа';

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
          <Heart size={11} className="text-red-400" /> Шанс выживания
        </span>
        <span className={`font-mono font-bold ${
          chance >= 70 ? 'text-green-400' : chance >= 40 ? 'text-yellow-400' : chance >= 20 ? 'text-orange-400' : 'text-red-400'
        }`}>{chance}% — {label}</span>
      </div>
      <div className="w-full bg-zinc-800 rounded-full h-2.5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${chance}%` }}
        />
      </div>
    </div>
  );
}

function MonthProgressBar({ monthStartTime, monthDuration, hasEvent }: {
  monthStartTime: number | null;
  monthDuration: number;
  hasEvent: boolean;
}) {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (hasEvent || !monthStartTime) {
      setProgress(hasEvent ? 100 : 0);
      return;
    }

    const tick = () => {
      const elapsed = Date.now() - monthStartTime;
      const pct = Math.min(100, (elapsed / monthDuration) * 100);
      setProgress(pct);
      if (pct < 100) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [monthStartTime, monthDuration, hasEvent]);

  return (
    <div className="w-full bg-zinc-800 rounded-full h-1 overflow-hidden">
      <div
        className="h-full rounded-full bg-amber-600/60 transition-none"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

export default function BunkerLifeScreen({ roomState, send, onLeave, eventOutcome }: Props) {
  const activePlayers = roomState.players.filter(p => p.is_active);
  const hasEvent = Boolean(roomState.active_event);

  return (
    <div
      className="min-h-screen bg-zinc-950 flex flex-col"
      style={{
        backgroundImage: `
          linear-gradient(rgba(9, 9, 11, 0.88), rgba(9, 9, 11, 0.92)),
          radial-gradient(circle at top, rgba(245, 158, 11, 0.04), transparent 35%),
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
          <span className="text-zinc-700">·</span>
          <span className="flex items-center gap-1.5 text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-full">
            <Calendar size={10} /> Месяц {roomState.current_month}
          </span>
          {roomState.round > 0 && (
            <>
              <span className="text-zinc-700">·</span>
              <span className="text-xs text-zinc-500 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-full">
                Раунд {roomState.round}
              </span>
            </>
          )}
        </div>
        <button
          onClick={onLeave}
          className="text-zinc-500 hover:text-zinc-100 text-sm transition-all flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-zinc-800 border border-transparent hover:border-zinc-700"
        >
          <ArrowLeft size={14} /> Выйти
        </button>
      </header>

      <div className="flex-1 flex flex-col p-4 gap-4 w-full">
        {/* Survival bar */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3">
          <SurvivalBar chance={roomState.survival_chance} />
        </div>

        {/* Event outcome notification */}
        {eventOutcome && (
          <div className={`rounded-xl border py-3 px-4 text-center text-sm animate-fade-in-up flex items-center justify-center gap-2 ${
            eventOutcome.outcome === 'success'
              ? 'border-green-900/40 bg-green-950/20 text-green-300'
              : 'border-red-900/40 bg-red-950/20 text-red-300'
          }`}>
            {eventOutcome.outcome === 'success' ? (
              <><TrendingUp size={14} /> Вам повезло! Шанс выживания: {eventOutcome.survival_change > 0 ? '+' : ''}{eventOutcome.survival_change}%</>
            ) : (
              <><TrendingDown size={14} /> Не повезло. Шанс выживания: {eventOutcome.survival_change}%</>
            )}
          </div>
        )}

        {/* Month animation — shown when no event */}
        {!hasEvent && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-8 text-center">
            <div className="text-5xl font-mono font-bold text-zinc-700 mb-2 tabular-nums">
              {String(roomState.current_month).padStart(2, '0')}
            </div>
            <p className="text-zinc-600 text-sm">месяц в бункере</p>
            <div className="mt-4 px-4">
              <MonthProgressBar
                monthStartTime={roomState.month_start_time}
                monthDuration={roomState.month_duration}
                hasEvent={hasEvent}
              />
            </div>
            <div className="flex justify-center gap-1 mt-3">
              {[0, 1, 2].map(i => (
                <span
                  key={i}
                  className="inline-block w-1.5 h-1.5 rounded-full bg-zinc-700 animate-pulse"
                  style={{ animationDelay: `${i * 0.2}s` }}
                />
              ))}
            </div>
            <p className="text-zinc-700 text-xs mt-2">Идёт время…</p>
          </div>
        )}

        {/* Players list */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3">
          <p className="text-zinc-500 text-xs uppercase tracking-widest mb-3">Выжившие в бункере</p>
          <div className="flex flex-col gap-2">
            {activePlayers.map(p => (
              <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-900/60">
                <div className="flex flex-col gap-0.5">
                  <span className="text-zinc-200 text-sm font-medium">{p.name}</span>
                  {p.attributes.profession && (
                    <span className="text-zinc-500 text-xs">{p.attributes.profession}</span>
                  )}
                </div>
                <div className="flex flex-col items-end gap-0.5 text-xs text-zinc-600">
                  {p.attributes.inventory && <span>{p.attributes.inventory}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Event modal */}
      {roomState.active_event && (
        <EventModal
          event={roomState.active_event}
          activePlayers={activePlayers}
          send={send}
        />
      )}
    </div>
  );
}
