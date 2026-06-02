import { useEffect, useState, useRef } from 'react';
import { ArrowLeft, Heart, Calendar, TrendingUp, TrendingDown, Utensils } from 'lucide-react';
import type { RoomState, ClientMessage } from '../types/game';
import EventModal from './EventModal';
import StatusTable from './StatusTable';

interface Props {
  roomState: RoomState;
  myPlayerId: string;
  send: (msg: ClientMessage) => void;
  onLeave: () => void;
  eventOutcome: { outcome: 'success' | 'failure' | 'nothing'; survival_change: number; food_change?: number; event_id?: string } | null;
}

function SurvivalBar({ chance }: { chance: number }) {
  const pct = Math.min(100, (chance / 150) * 100);
  const color =
    chance > 100 ? 'bg-emerald-400' :
    chance >= 70 ? 'bg-green-500' :
    chance >= 40 ? 'bg-yellow-500' :
    chance >= 20 ? 'bg-orange-500' : 'bg-red-500';

  const label =
    chance > 100 ? 'Отлично' :
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
          chance > 100 ? 'text-emerald-300' : chance >= 70 ? 'text-green-400' : chance >= 40 ? 'text-yellow-400' : chance >= 20 ? 'text-orange-400' : 'text-red-400'
        }`}>{chance}% — {label}</span>
      </div>
      <div className="w-full bg-zinc-800 rounded-full h-2.5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function FoodBar({ foodMonths, totalMonths }: { foodMonths: number; totalMonths: number }) {
  const pct = totalMonths > 0
    ? Math.min(100, Math.round((foodMonths / totalMonths) * 100))
    : 100;
  const color =
    pct >= 60 ? 'bg-green-500' :
    pct >= 30 ? 'bg-yellow-500' :
    pct >= 10 ? 'bg-orange-500' : 'bg-red-500';
  const label =
    pct >= 60 ? 'Достаточно' :
    pct >= 30 ? 'Мало' :
    pct >= 10 ? 'Критично' : 'Голод!';

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
          <Utensils size={11} className="text-amber-400" /> Запасы еды
        </span>
        <span className={`font-mono font-bold ${
          pct >= 60 ? 'text-green-400' : pct >= 30 ? 'text-yellow-400' : pct >= 10 ? 'text-orange-400' : 'text-red-400'
        }`}>{foodMonths} мес. — {label}</span>
      </div>
      <div className="w-full bg-zinc-800 rounded-full h-2.5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${pct}%` }}
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
        className="h-full rounded-full progress-bar-accent transition-none"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

export default function BunkerLifeScreen({ roomState, myPlayerId, send, onLeave, eventOutcome }: Props) {
  const activePlayers = roomState.players.filter(p => p.is_active);
  const hasEvent = Boolean(roomState.active_event);

  return (
    <div
      className="min-h-screen bg-zinc-950 flex flex-col relative isolate overflow-hidden"
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
      <header className="topbar px-4 py-3 flex items-center justify-between shrink-0 sticky top-0 z-10">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-amber-500 text-sm">☢</span>
          <span className="text-zinc-300 font-semibold text-sm">Бункер</span>
          <span className="text-zinc-700">·</span>
          <span className="font-mono text-zinc-500 text-sm tracking-widest">{roomState.room_code}</span>
          <span className="text-zinc-700">·</span>
          <span className="flex items-center gap-1.5 text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-full">
            <Calendar size={10} /> Месяц {roomState.current_month}
            {roomState.total_months > 0 && (
              <span className="text-zinc-600"> / {roomState.total_months}</span>
            )}
          </span>
          {roomState.total_months > 0 && roomState.current_month < roomState.total_months && (
            <>
              <span className="text-zinc-700">·</span>
              <span className="text-xs text-zinc-500 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-full">
                Осталось: {roomState.total_months - roomState.current_month} мес.
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

      <div className="relative z-10 flex-1 flex flex-col p-4 gap-4 w-full">
        {/* Survival + food bars */}
        <div className="card px-4 py-3 flex flex-col gap-3">
          <SurvivalBar chance={roomState.survival_chance} />
          <div className="w-full h-px bg-zinc-800" />
          <FoodBar foodMonths={roomState.food_months_display} totalMonths={roomState.total_months} />
        </div>

        {/* Event outcome notification */}
        {eventOutcome && (
          <div className={`rounded-xl border py-3 px-4 text-center text-sm animate-fade-in-up flex items-center justify-center gap-2 ${
            eventOutcome.food_change !== undefined && eventOutcome.food_change < 0
              ? 'border-orange-900/40 bg-orange-950/20 text-orange-300'
              : eventOutcome.outcome === 'success'
                ? 'border-green-900/40 bg-green-950/20 text-green-300'
                : eventOutcome.event_id === 'food_replenish'
                  ? 'border-orange-900/40 bg-orange-950/20 text-orange-300'
                  : 'border-red-900/40 bg-red-950/20 text-red-300'
          }`}>
            {eventOutcome.event_id === 'food_replenish' ? (
              eventOutcome.outcome === 'success' ? (
                <><Utensils size={14} /> Запасы пополнены! +{eventOutcome.food_change} мес. еды</>
              ) : (
                <><TrendingDown size={14} /> Нечем пополнить запасы. Следующий месяц — последний</>
              )
            ) : eventOutcome.food_change !== undefined ? (
              eventOutcome.food_change > 0 ? (
                <><Utensils size={14} /> Запасы еды: +{eventOutcome.food_change} мес.</>
              ) : eventOutcome.food_change < 0 ? (
                <><Utensils size={14} /> Запасы еды: {eventOutcome.food_change} мес.</>
              ) : (
                <><Utensils size={14} /> Запасы еды не изменились</>
              )
            ) : eventOutcome.outcome === 'success' ? (
              <><TrendingUp size={14} /> Вам повезло! Шанс выживания: {eventOutcome.survival_change > 0 ? '+' : ''}{eventOutcome.survival_change}%</>
            ) : (
              <><TrendingDown size={14} /> Не повезло. Шанс выживания: {eventOutcome.survival_change}%</>
            )}
          </div>
        )}

        {/* Month animation — shown when no event */}
        {!hasEvent && (
          <div className="card px-4 py-8 text-center">
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

        <StatusTable
          players={roomState.players}
          myPlayerId={myPlayerId}
          send={send}
        />
      </div>

      {/* Event modal */}
      {roomState.active_event && (
        <EventModal
          event={roomState.active_event}
          activePlayers={activePlayers}
          bunker={roomState.bunker}
          send={send}
        />
      )}
    </div>
  );
}
