import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Brain, Calendar, HeartPulse, Skull, Utensils, Baby, DoorOpen, Briefcase, User, Sparkles } from 'lucide-react';
import type { ClientMessage, Player, RoomState, StatusChange, VitalChange } from '../types/game';
import EventModal from './EventModal';

interface EventOutcome {
  outcome: 'success' | 'failure' | 'nothing';
  health_changes?: VitalChange[];
  sanity_changes?: VitalChange[];
  status_changes?: StatusChange[];
  food_change?: number;
  event_id?: string;
  players_killed?: Array<{ id: string; name: string }>;
  room_changed?: boolean;
  players_added?: Array<{ id: string; name: string }>;
}

interface Props {
  roomState: RoomState;
  myPlayerId: string;
  send: (msg: ClientMessage) => void;
  onLeave: () => void;
  eventOutcome: EventOutcome | null;
  onDismissEventOutcome: () => void;
  isConnectionLost: boolean;
}

function MonthProgressBar({ progress }: { progress: number }) {
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
      <div className="month-progress-fill h-full rounded-full progress-bar-accent transition-none" style={{ width: `${progress}%` }} />
    </div>
  );
}

function StatMeter({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone: 'health' | 'sanity' }) {
  const color = value >= 70 ? 'bg-emerald-500' : value >= 40 ? 'bg-amber-500' : value >= 20 ? 'bg-orange-500' : 'bg-red-500';
  const text = value >= 70 ? 'text-emerald-300' : value >= 40 ? 'text-amber-300' : value >= 20 ? 'text-orange-300' : 'text-red-300';
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 uppercase tracking-widest text-zinc-500">{icon}{label}</span>
        <span className={`font-mono font-bold ${text}`}>{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-zinc-600">{tone === 'health' ? 'физическое состояние' : 'устойчивость психики'}</p>
    </div>
  );
}

function attrDisplay(player: Player, key: 'gender' | 'profession') {
  return player.attributes[key]?.display ?? 'Не раскрыто';
}

function SurvivorCard({ player, isMe }: { player: Player; isMe: boolean }) {
  const vital = player.vital_status ?? { health: 100, sanity: 100, statuses: [] };
  const statuses = vital.statuses ?? [];

  return (
    <article className={`relative overflow-hidden rounded-2xl border p-4 shadow-2xl ${
      isMe ? 'border-amber-500/45 bg-amber-950/10' : 'border-zinc-800/90 bg-zinc-950/75'
    }`}>
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border text-sm font-bold ${
            isMe ? 'border-amber-400/40 bg-amber-500/15 text-amber-200' : 'border-zinc-700 bg-zinc-900 text-zinc-300'
          }`}>
            {player.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-zinc-100">{player.name}</h3>
            <p className="text-xs uppercase tracking-widest text-zinc-600">{isMe ? 'это вы' : 'выживший'}</p>
          </div>
        </div>
        {(vital.health <= 25 || vital.sanity <= 25) && <Skull size={18} className="text-red-400" />}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/45 px-3 py-2">
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-zinc-500"><User size={12} /> Пол</p>
          <p className="mt-1 text-sm font-semibold text-zinc-200">{attrDisplay(player, 'gender')}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/45 px-3 py-2">
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-zinc-500"><Briefcase size={12} /> Профессия</p>
          <p className="mt-1 text-sm font-semibold text-zinc-200">{attrDisplay(player, 'profession')}</p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <StatMeter icon={<HeartPulse size={12} className="text-red-400" />} label="Здоровье" value={vital.health} tone="health" />
        <StatMeter icon={<Brain size={12} className="text-sky-400" />} label="Рассудок" value={vital.sanity} tone="sanity" />
      </div>

      <div className="mt-3 min-h-8">
        {statuses.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-800 px-3 py-2 text-xs text-zinc-600">Нет активных баффов или дебаффов</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {statuses.map(status => (
              <span
                key={`${status.id}:${status.stat}`}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                  status.type === 'buff'
                    ? 'border-emerald-700/50 bg-emerald-950/30 text-emerald-300'
                    : 'border-red-800/50 bg-red-950/30 text-red-300'
                }`}
                title={`${status.delta > 0 ? '+' : ''}${status.delta} к ${status.stat === 'health' ? 'здоровью' : 'рассудку'} каждый месяц`}
              >
                {status.label} · {status.months} мес.
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function EventOutcomeModal({ outcome, onDismiss }: { outcome: EventOutcome; onDismiss: () => void }) {
  const healthChanges = outcome.health_changes?.filter(change => change.delta !== 0) ?? [];
  const sanityChanges = outcome.sanity_changes?.filter(change => change.delta !== 0) ?? [];
  const statusAdded = outcome.status_changes?.filter(change => change.action === 'added' && change.status) ?? [];
  const statusCleared = outcome.status_changes?.filter(change => change.action === 'cleared') ?? [];
  const hasAny =
    healthChanges.length > 0 ||
    sanityChanges.length > 0 ||
    statusAdded.length > 0 ||
    statusCleared.length > 0 ||
    outcome.food_change !== undefined ||
    Boolean(outcome.players_killed?.length) ||
    Boolean(outcome.players_added?.length) ||
    outcome.room_changed;

  const title = outcome.event_id === 'month_tick'
    ? 'Итоги месяца'
    : outcome.outcome === 'failure'
      ? 'Событие провалилось'
      : 'Событие завершено';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm animate-fade-in-up">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-zinc-700/70 bg-zinc-950 shadow-2xl">
        <div className="border-b border-zinc-800 px-5 py-4">
          <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">Результат</p>
          <h2 className="mt-1 text-xl font-bold text-zinc-100">{title}</h2>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          {!hasAny ? (
            <p className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm text-zinc-400">Ничего заметного не произошло.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {outcome.food_change !== undefined && (
                <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 px-4 py-3 text-sm text-amber-200">
                  <span className="flex items-center gap-2 font-semibold"><Utensils size={15} /> Еда: {outcome.food_change > 0 ? '+' : ''}{outcome.food_change}</span>
                </div>
              )}

              {healthChanges.length > 0 && (
                <div className="rounded-xl border border-red-900/40 bg-red-950/20 px-4 py-3">
                  <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-200"><HeartPulse size={15} /> Здоровье</p>
                  <div className="flex flex-col gap-1">
                    {healthChanges.map((change, index) => (
                      <span key={`${change.id}:health:${index}`} className="text-sm text-zinc-300">{change.name}: {change.delta > 0 ? '+' : ''}{change.delta}</span>
                    ))}
                  </div>
                </div>
              )}

              {sanityChanges.length > 0 && (
                <div className="rounded-xl border border-sky-900/40 bg-sky-950/20 px-4 py-3">
                  <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-sky-200"><Brain size={15} /> Рассудок</p>
                  <div className="flex flex-col gap-1">
                    {sanityChanges.map((change, index) => (
                      <span key={`${change.id}:sanity:${index}`} className="text-sm text-zinc-300">{change.name}: {change.delta > 0 ? '+' : ''}{change.delta}</span>
                    ))}
                  </div>
                </div>
              )}

              {statusAdded.length > 0 && (
                <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 px-4 py-3">
                  <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-200"><Sparkles size={15} /> Новые статусы</p>
                  <div className="flex flex-col gap-1">
                    {statusAdded.map((change, index) => (
                      <span key={`${change.id}:status:${index}`} className="text-sm text-zinc-300">
                        {change.name}: {change.status!.label} ({change.status!.months} мес.)
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {statusCleared.length > 0 && (
                <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-200">
                  Сняты статусы: {statusCleared.map(change => change.name).join(', ')}
                </div>
              )}

              {outcome.players_killed && outcome.players_killed.length > 0 && (
                <div className="rounded-xl border border-red-900/50 bg-red-950/25 px-4 py-3 text-sm text-red-200">
                  <span className="flex items-center gap-2 font-semibold"><Skull size={15} /> Выбыли: {outcome.players_killed.map(p => p.name).join(', ')}</span>
                </div>
              )}

              {outcome.players_added && outcome.players_added.length > 0 && (
                <div className="rounded-xl border border-blue-900/50 bg-blue-950/25 px-4 py-3 text-sm text-blue-200">
                  <span className="flex items-center gap-2 font-semibold"><Baby size={15} /> Присоединились: {outcome.players_added.map(p => p.name).join(', ')}</span>
                </div>
              )}

              {outcome.room_changed && (
                <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-200">
                  <span className="flex items-center gap-2 font-semibold"><DoorOpen size={15} /> Структура бункера изменилась</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-zinc-800 px-5 py-4">
          <button
            type="button"
            onClick={onDismiss}
            className="w-full rounded-xl py-2.5 text-sm font-semibold text-white btn-primary"
          >
            Дальше
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BunkerLifeScreen({ roomState, myPlayerId, send, onLeave, eventOutcome, onDismissEventOutcome, isConnectionLost }: Props) {
  const activePlayers = roomState.players.filter(p => p.is_active);
  const hasEvent = Boolean(roomState.active_event);
  const foodConsumptionPerPlayer = roomState.pack_settings.bunker_life.food_consumption_per_player;
  const monthlyConsumption = Math.max(1, activePlayers.length * foodConsumptionPerPlayer);
  const monthsLeft = Math.floor(roomState.food / monthlyConsumption);
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
        </div>
        <button onClick={onLeave} className="flex items-center gap-1.5 rounded-lg border border-transparent px-3 py-1.5 text-sm text-zinc-500 transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-100">
          <ArrowLeft size={14} /> Выйти
        </button>
      </header>

      <main className="relative z-10 flex flex-1 flex-col gap-4 p-4">
        <section className="card grid gap-4 px-4 py-4 lg:grid-cols-[260px_1fr]">
          <div className="month-status-card relative overflow-hidden rounded-2xl border border-zinc-800/90 bg-zinc-950/80 px-4 py-4">
            <div className="month-status-glow pointer-events-none absolute inset-0" />
            <div className="relative z-10 flex h-full flex-col justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">Хроника бункера</p>
                <div className="mt-2 font-mono text-4xl font-bold tabular-nums text-zinc-200">
                  {String(roomState.current_month).padStart(2, '0')}
                  {roomState.total_months > 0 && <span className="text-zinc-600"> / {roomState.total_months}</span>}
                </div>
                <p className="text-sm text-zinc-600">{hasEvent ? 'месяц остановлен событием' : 'идёт месяц выживания'}</p>
              </div>
              <MonthProgressBar progress={monthProgress} />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
              <p className="flex items-center gap-2 text-xs uppercase tracking-widest text-zinc-500"><Utensils size={13} className="text-amber-400" /> Еда</p>
              <p className="mt-2 text-2xl font-bold text-zinc-100">{roomState.food}</p>
              <p className="text-sm text-zinc-600">примерно {monthsLeft} мес.</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
              <p className="flex items-center gap-2 text-xs uppercase tracking-widest text-zinc-500"><User size={13} className="text-zinc-400" /> Живые</p>
              <p className="mt-2 text-2xl font-bold text-zinc-100">{activePlayers.length}</p>
              <p className="text-sm text-zinc-600">из {roomState.players.length} в бункере</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
              <p className="flex items-center gap-2 text-xs uppercase tracking-widest text-zinc-500"><Brain size={13} className="text-sky-400" /> Режим</p>
              <p className="mt-2 text-2xl font-bold text-zinc-100">{hasEvent ? 'Событие' : 'Ожидание'}</p>
              <p className="text-sm text-zinc-600">решения влияют на людей, не на абстрактный шанс</p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {activePlayers.map(player => (
            <SurvivorCard key={player.id} player={player} isMe={player.id === myPlayerId} />
          ))}
        </section>
      </main>

      {roomState.active_event && (
        <EventModal
          event={roomState.active_event}
          activePlayers={activePlayers}
          bunker={roomState.bunker}
          packSettings={roomState.pack_settings}
          eventSelection={roomState.active_event_selection}
          choiceVotes={roomState.choice_votes}
          myPlayerId={myPlayerId}
          send={send}
          disabled={isConnectionLost}
        />
      )}

      {eventOutcome && (
        <EventOutcomeModal outcome={eventOutcome} onDismiss={onDismissEventOutcome} />
      )}
    </div>
  );
}
