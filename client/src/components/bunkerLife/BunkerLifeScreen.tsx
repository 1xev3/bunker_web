import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Brain, Calendar, HeartPulse, Utensils, DoorOpen, User, Eye } from 'lucide-react';
import type { ClientMessage, EventOutcome, MonthlyNotice, RoomState } from '../../types/game';
import EventModal from '../event/EventModal';
import BunkerMap from '../bunker/BunkerMap';
import MonthProgressBar from './MonthProgressBar';
import StatMeter from './StatMeter';
import SurvivorCard from './SurvivorCard';
import BunkerItemsPanel from './BunkerItemsPanel';
import EventOutcomeModal from './EventOutcomeModal';
import BuffDebuffSnackbar from './BuffDebuffSnackbar';

interface Props {
  roomState: RoomState;
  myPlayerId: string;
  send: (msg: ClientMessage) => void;
  onLeave: () => void;
  eventOutcome: EventOutcome | null;
  outcomeConfirmations: string[] | null;
  monthlyNotice: MonthlyNotice | null;
  isConnectionLost: boolean;
}

export default function BunkerLifeScreen({ roomState, myPlayerId, send, onLeave, eventOutcome, outcomeConfirmations, monthlyNotice, isConnectionLost }: Props) {
  const activePlayers = roomState.players.filter(p => p.is_active);
  const myPlayer = roomState.players.find(p => p.id === myPlayerId);
  const isEliminated = !myPlayer?.is_active;
  const hasEvent = Boolean(roomState.active_event);
  const foodConsumptionPerPlayer = roomState.pack_settings.bunker_life.food_consumption_per_player;
  const monthlyConsumption = Math.max(1, activePlayers.length * foodConsumptionPerPlayer);
  const monthsLeft = Math.floor(roomState.food / monthlyConsumption);
  const avgHealth = activePlayers.length > 0 ? Math.round(activePlayers.reduce((sum, p) => sum + (p.vital_status?.health ?? 0), 0) / activePlayers.length) : 0;
  const avgSanity = activePlayers.length > 0 ? Math.round(activePlayers.reduce((sum, p) => sum + (p.vital_status?.sanity ?? 0), 0) / activePlayers.length) : 0;
  const [monthProgress, setMonthProgress] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (hasEvent || !roomState.month_start_time) {
      rafRef.current = requestAnimationFrame(() => setMonthProgress(hasEvent ? 100 : 0));
      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    }

    const tick = () => {
      const elapsed = Date.now() - roomState.month_start_time!;
      const pct = Math.min(100, (elapsed / roomState.month_duration) * 100);
      setMonthProgress(pct);
      if (pct < 100) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [roomState.month_start_time, roomState.month_duration, hasEvent]);

  return (
    <div className="relative isolate flex min-h-screen flex-col overflow-hidden bg-zinc-950">
      <div
        className="pointer-events-none absolute inset-0 scale-105 blur-sm"
        style={{
          backgroundImage: `
            radial-gradient(ellipse at 0% 0%, rgba(var(--accent-rgb), 0.16) 0%, transparent 45%),
            linear-gradient(rgba(9, 9, 11, 0.74), rgba(9, 9, 11, 0.9)),
            url('/images/bunker-control-room.png')
          `,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />

      <header className="topbar sticky top-0 z-10 flex shrink-0 items-center justify-between px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-amber-500">☢</span>
          <span className="text-sm font-semibold text-zinc-300">Бункер</span>
          <span className="font-mono text-sm tracking-widest text-zinc-500">{roomState.room_code}</span>
          <span className="flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-xs text-zinc-400">
            <Calendar size={10} /> Месяц {roomState.current_month}{roomState.total_months > 0 && <span className="text-zinc-600"> / {roomState.total_months}</span>}
          </span>
          {(roomState.spectator_count ?? 0) > 0 && (
            <span className="flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-xs text-zinc-400">
              <Eye size={10} /> {roomState.spectator_count}
            </span>
          )}
        </div>
        <button onClick={onLeave} className="flex items-center gap-1.5 rounded-lg border border-transparent px-3 py-1.5 text-sm text-zinc-500 transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-100">
          <ArrowLeft size={14} /> Выйти
        </button>
      </header>

      <main className="relative z-10 flex flex-1 flex-col gap-4 p-4">
        <section className="grid gap-3 lg:grid-cols-[minmax(260px,320px)_1fr]">
          <div className="month-status-card card relative overflow-hidden px-3 py-2.5">
            <div className="month-status-glow pointer-events-none absolute inset-0" />
            <div className="relative z-10 flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">Хроника</p>
                <div className="font-mono text-2xl font-bold tabular-nums text-zinc-200">
                  {String(roomState.current_month).padStart(2, '0')}
                  {roomState.total_months > 0 && <span className="text-zinc-600"> / {roomState.total_months}</span>}
                </div>
              </div>
              <MonthProgressBar progress={monthProgress} />
              <p className="text-xs text-zinc-600">{hasEvent ? 'месяц остановлен событием' : 'идёт месяц выживания'}</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="month-status-card card flex items-center gap-3 px-3 py-2.5">
              <Utensils size={28} className="shrink-0 text-amber-400" />
              <div className="min-w-0 flex-1">
                <p className="text-sm uppercase tracking-widest text-zinc-400">Еда</p>
                <p className="text-sm text-zinc-500">примерно {monthsLeft} мес.</p>
              </div>
              <p className="font-mono text-2xl font-bold text-zinc-100">{roomState.food}</p>
            </div>
            <div className="month-status-card card flex flex-col justify-center gap-2 px-3 py-2.5">
              <StatMeter icon={<HeartPulse size={12} className="text-red-400" />} label="Общее здоровье" value={avgHealth} />
              <StatMeter icon={<Brain size={12} className="text-sky-400" />} label="Общий рассудок" value={avgSanity} />
            </div>
          </div>
        </section>

        <section className="grid flex-1 gap-4 lg:grid-cols-[minmax(260px,320px)_1fr] xl:grid-cols-[minmax(260px,320px)_1fr_minmax(260px,340px)]">
          <div className="card flex flex-col gap-2.5 px-4 py-4">
            <p className="flex items-center gap-2 text-xs uppercase tracking-widest text-zinc-500">
              <User size={13} /> Выжившие · {activePlayers.length}
            </p>
            {activePlayers.map(player => (
              <SurvivorCard key={player.id} player={player} isMe={player.id === myPlayerId} />
            ))}
          </div>

          <div className="card flex flex-col gap-3 px-4 py-4">
            <p className="flex items-center gap-2 text-xs uppercase tracking-widest text-zinc-500">
              <DoorOpen size={13} /> Карта бункера
            </p>
            {roomState.bunker?.layout ? (
              <div className="mx-auto w-full max-w-xl">
                <BunkerMap layout={roomState.bunker.layout} />
              </div>
            ) : (
              <p className="text-sm text-zinc-600">Карта недоступна</p>
            )}
          </div>

          <BunkerItemsPanel bunker={roomState.bunker} players={activePlayers} />
        </section>
      </main>

      {roomState.active_event && !eventOutcome && (
        <EventModal
          event={roomState.active_event}
          activePlayers={activePlayers}
          bunker={roomState.bunker}
          packSettings={roomState.pack_settings}
          eventSelection={roomState.active_event_selection}
          choiceVotes={roomState.choice_votes}
          choicePendingSelection={roomState.choice_pending_selection ?? null}
          resolveConfirmations={roomState.resolve_confirmations ?? []}
          myPlayerId={myPlayerId}
          send={send}
          disabled={isConnectionLost || isEliminated}
        />
      )}

      {eventOutcome && (
        <EventOutcomeModal
          outcome={eventOutcome}
          activePlayers={activePlayers}
          myPlayerId={myPlayerId}
          outcomeConfirmations={outcomeConfirmations}
          send={send}
          disabled={isConnectionLost || isEliminated}
        />
      )}

      {eventOutcome && (eventOutcome.status_changes?.length ?? 0) > 0 && (
        <BuffDebuffSnackbar statusChanges={eventOutcome.status_changes!} />
      )}

      {monthlyNotice && (
        <BuffDebuffSnackbar
          statusChanges={monthlyNotice.status_changes}
          healthChanges={monthlyNotice.health_changes}
          sanityChanges={monthlyNotice.sanity_changes}
          playersKilled={monthlyNotice.players_killed}
        />
      )}
    </div>
  );
}
