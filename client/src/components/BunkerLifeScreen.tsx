import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Brain, Calendar, CheckCheck, HeartPulse, Skull, Utensils, Baby, DoorOpen, Briefcase, User, Sparkles, Send, Package, Backpack } from 'lucide-react';
import type { ClientMessage, Player, RoomState, StatusChange, VitalChange } from '../types/game';
import EventModal from './EventModal';
import BunkerMap from './BunkerMap';

interface EventOutcome {
  outcome: string;
  message?: string | null;
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
  outcomeConfirmations: string[] | null;
  onDismissEventOutcome: () => void;
  monthlyNotice: MonthlyNotice | null;
  isConnectionLost: boolean;
}

interface MonthlyNotice {
  health_changes?: VitalChange[];
  sanity_changes?: VitalChange[];
  status_changes?: StatusChange[];
  players_killed?: Array<{ id: string; name: string }>;
}

function MonthProgressBar({ progress }: { progress: number }) {
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
      <div className="month-progress-fill h-full rounded-full progress-bar-accent transition-none" style={{ width: `${progress}%` }} />
    </div>
  );
}

function attrDisplay(player: Player, key: 'gender' | 'profession') {
  return player.attributes[key]?.display ?? 'Не раскрыто';
}

function StatMeter({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  const color = value >= 70 ? 'bg-emerald-500' : value >= 40 ? 'bg-amber-500' : value >= 20 ? 'bg-orange-500' : 'bg-red-500';
  const text = value >= 70 ? 'text-emerald-300' : value >= 40 ? 'text-amber-300' : value >= 20 ? 'text-orange-300' : 'text-red-300';
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 uppercase tracking-widest text-zinc-500">{icon}{label}</span>
        <span className={`font-mono font-bold ${text}`}>{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function SurvivorCard({ player, isMe }: { player: Player; isMe: boolean }) {
  const vital = player.vital_status ?? { health: 100, sanity: 100, statuses: [] };
  const statuses = vital.statuses ?? [];
  const inDanger = vital.health <= 25 || vital.sanity <= 25;

  return (
    <article className={`relative overflow-hidden rounded-xl border px-3 py-3 shadow-lg ${
      isMe ? 'border-amber-500/55 bg-amber-950/10' : 'border-zinc-800/90 bg-zinc-950/75'
    }`}>
      <div className="min-w-0">
        <h3 className="flex items-center gap-1.5 truncate text-sm font-bold uppercase tracking-wide text-zinc-100">
          {inDanger && <Skull size={13} className="shrink-0 text-red-400" />}
          {player.name}
        </h3>
        <p className="flex items-center gap-1.5 truncate text-[11px] text-zinc-500">
          <Briefcase size={10} className="shrink-0" /> {attrDisplay(player, 'profession')}
          <span className="text-zinc-700">·</span>
          <User size={10} className="shrink-0" /> {attrDisplay(player, 'gender')}
        </p>
      </div>

      <div className="mt-3 grid gap-2">
        <StatMeter icon={<HeartPulse size={12} className="text-red-400" />} label="Здоровье" value={vital.health} />
        <StatMeter icon={<Brain size={12} className="text-sky-400" />} label="Рассудок" value={vital.sanity} />
      </div>

      {statuses.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {statuses.map(status => (
            <span
              key={`${status.id}:${status.stat}`}
              className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
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
    </article>
  );
}

function BunkerItemsPanel({ bunker, players }: { bunker: RoomState['bunker']; players: Player[] }) {
  const bunkerItems = bunker?.items ?? [];

  return (
    <div className="card flex flex-col gap-4 px-4 py-4">
      <div>
        <p className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-zinc-500">
          <Package size={13} className="text-amber-400" /> Имущество бункера
        </p>
        {bunkerItems.length === 0 ? (
          <p className="text-sm text-zinc-600">Пусто</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {bunkerItems.map((item, i) => (
              <span key={`${item.id}-${i}`} className="rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1 text-xs text-zinc-300">
                {item.label}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-zinc-800/80 pt-3">
        <p className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-zinc-500">
          <Backpack size={13} className="text-sky-400" /> Инвентарь выживших
        </p>
        <div className="flex flex-col gap-3">
          {players.map(player => {
            const inventory = player.attributes.inventory?.display;
            const backpack = player.attributes.backpack?.value ?? [];
            const hasAny = Boolean(inventory) || backpack.length > 0;
            return (
              <div key={player.id}>
                <p className="truncate text-xs font-semibold text-zinc-300">{player.name}</p>
                {hasAny ? (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {inventory && (
                      <span className="rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1 text-xs text-zinc-300">
                        {inventory}
                      </span>
                    )}
                    {backpack.map((item, i) => (
                      <span key={`${item.id}-${i}`} className="rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1 text-xs text-zinc-300">
                        {item.label}{item.quantity > 1 && <span className="ml-1 text-zinc-500">×{item.quantity}</span>}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-[11px] text-zinc-600">нет предметов</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function OutcomeChip({ children, color }: { children: ReactNode; color: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${color}`}>
      {children}
    </span>
  );
}

function OutcomeRow({ icon, label, value, valueColor }: { icon: ReactNode; label: string; value?: string; valueColor?: string }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 text-sm text-zinc-300">{label}</span>
      {value && <span className={`font-mono text-sm font-bold ${valueColor ?? 'text-zinc-200'}`}>{value}</span>}
    </div>
  );
}

function ConfirmationDots({ confirmed, activePlayers }: { confirmed: string[]; activePlayers: Player[] }) {
  return (
    <span className="font-mono text-base font-bold text-white">
      {confirmed.length} / {activePlayers.length}
    </span>
  );
}

function EventOutcomeModal({ outcome, activePlayers, myPlayerId, outcomeConfirmations, send, disabled }: {
  outcome: EventOutcome;
  activePlayers: Player[];
  myPlayerId: string;
  outcomeConfirmations: string[] | null;
  send: (msg: ClientMessage) => void;
  disabled?: boolean;
}) {
  const confirmed = outcomeConfirmations ?? [];
  const myConfirmed = confirmed.includes(myPlayerId);
  const allConfirmed = activePlayers.length > 0 && activePlayers.every(p => confirmed.includes(p.id));

  const healthChanges = outcome.health_changes?.filter(c => c.delta !== 0) ?? [];
  const sanityChanges = outcome.sanity_changes?.filter(c => c.delta !== 0) ?? [];

  const rows: ReactNode[] = [];
  if (outcome.food_change !== undefined && outcome.food_change !== 0)
    rows.push(<OutcomeRow key="food" icon={<Utensils size={14} className="text-amber-400" />} label="Запасы еды" value={`${outcome.food_change > 0 ? '+' : ''}${outcome.food_change}`} valueColor={outcome.food_change > 0 ? 'text-emerald-400' : 'text-red-400'} />);
  healthChanges.forEach((c, i) =>
    rows.push(<OutcomeRow key={`hp-${i}-${c.name}`} icon={<HeartPulse size={14} className="text-red-400" />} label={c.name} value={`${c.delta > 0 ? '+' : ''}${c.delta}`} valueColor={c.delta > 0 ? 'text-emerald-400' : 'text-red-400'} />));
  sanityChanges.forEach((c, i) =>
    rows.push(<OutcomeRow key={`san-${i}-${c.name}`} icon={<Brain size={14} className="text-sky-400" />} label={c.name} value={`${c.delta > 0 ? '+' : ''}${c.delta}`} valueColor={c.delta > 0 ? 'text-emerald-400' : 'text-red-400'} />));
  (outcome.players_killed ?? []).forEach((p, i) =>
    rows.push(<OutcomeRow key={`killed-${i}-${p.id}`} icon={<Skull size={14} className="text-red-400" />} label={p.name} valueColor="text-red-400" />));
  (outcome.players_added ?? []).forEach((p, i) =>
    rows.push(<OutcomeRow key={`added-${i}-${p.id}`} icon={<Baby size={14} className="text-blue-400" />} label={p.name} />));
  if (outcome.room_changed)
    rows.push(<OutcomeRow key="room" icon={<DoorOpen size={14} className="text-zinc-400" />} label="Бункер изменился" />);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 py-6 backdrop-blur-sm animate-fade-in-up">
      <div className="mx-4 flex w-full max-w-lg flex-col rounded-2xl border border-amber-900/40 bg-zinc-900 shadow-2xl">
        {outcome.message && (
          <div className="border-b border-zinc-800 p-5">
            <div className="flex items-start gap-3">
              <Sparkles size={20} className="mt-0.5 shrink-0 text-amber-400" />
              <p className="mt-1 text-sm leading-relaxed text-zinc-400">{outcome.message}</p>
            </div>
          </div>
        )}

        {rows.length > 0 && (
          <div className="px-5 py-2 border-b border-zinc-800 divide-y divide-zinc-800/60">
            {rows}
          </div>
        )}

        <div className="p-5 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => { if (!myConfirmed && !disabled) send({ type: 'confirm_outcome' }); }}
            disabled={disabled || myConfirmed || allConfirmed}
            className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold btn-primary text-white flex items-center justify-between gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <span className="flex items-center gap-2">
              {disabled ? 'Переподключение...' : myConfirmed ? <><CheckCheck size={14} /> Подтверждено</> : <><Send size={14} /> Готов</>}
            </span>
            <ConfirmationDots confirmed={confirmed} activePlayers={activePlayers} />
          </button>
        </div>
      </div>
    </div>
  );
}

function BuffDebuffSnackbar({ statusChanges = [], healthChanges = [], sanityChanges = [], playersKilled = [] }: {
  statusChanges?: StatusChange[];
  healthChanges?: VitalChange[];
  sanityChanges?: VitalChange[];
  playersKilled?: Array<{ id: string; name: string }>;
}) {
  const added = statusChanges.filter(c => c.action === 'added' && c.status);
  const cleared = statusChanges.filter(c => c.action === 'cleared');
  const hp = healthChanges.filter(c => c.delta !== 0);
  const san = sanityChanges.filter(c => c.delta !== 0);
  if (added.length === 0 && cleared.length === 0 && hp.length === 0 && san.length === 0 && playersKilled.length === 0) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-[60] animate-fade-in-up pointer-events-none">
      <div className="mx-auto max-w-4xl px-3 pb-3">
        <div className="rounded-2xl border border-zinc-700/60 bg-zinc-950/90 px-4 py-3 shadow-2xl backdrop-blur-sm">
          <div className="flex flex-wrap gap-1.5">
            {added.map((c, i) => (
              <OutcomeChip key={`add-${c.id}-${c.status_id ?? i}`} color="border-amber-800/60 bg-amber-950/50 text-amber-200">
                <Sparkles size={11} /> {c.name}: {c.status!.label}
              </OutcomeChip>
            ))}
            {cleared.map(c => (
              <OutcomeChip key={`clr-${c.id}`} color="border-emerald-800/60 bg-emerald-950/50 text-emerald-300">
                <CheckCheck size={11} /> Снят: {c.name}
              </OutcomeChip>
            ))}
            {hp.length > 0 && (
              <OutcomeChip color="border-red-800/60 bg-red-950/50 text-red-300">
                <HeartPulse size={11} /> {hp.map(c => `${c.name} ${c.delta > 0 ? '+' : ''}${c.delta}`).join(', ')}
              </OutcomeChip>
            )}
            {san.length > 0 && (
              <OutcomeChip color="border-sky-800/60 bg-sky-950/50 text-sky-300">
                <Brain size={11} /> {san.map(c => `${c.name} ${c.delta > 0 ? '+' : ''}${c.delta}`).join(', ')}
              </OutcomeChip>
            )}
            {playersKilled.length > 0 && (
              <OutcomeChip color="border-red-800/70 bg-red-950/60 text-red-200">
                <Skull size={11} /> {playersKilled.map(p => p.name).join(', ')}
              </OutcomeChip>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BunkerLifeScreen({ roomState, myPlayerId, send, onLeave, eventOutcome, outcomeConfirmations, onDismissEventOutcome, monthlyNotice, isConnectionLost }: Props) {
  const activePlayers = roomState.players.filter(p => p.is_active);
  const myPlayer = roomState.players.find(p => p.id === myPlayerId);
  const isEliminated = !myPlayer?.is_active;
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

        <section className="grid flex-1 gap-4 lg:grid-cols-[minmax(260px,320px)_1fr] xl:grid-cols-[minmax(260px,320px)_1fr_minmax(260px,340px)]">
          <div className="flex flex-col gap-2.5">
            <p className="flex items-center gap-2 px-1 text-xs uppercase tracking-widest text-zinc-500">
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
            {roomState.bunker?.grid ? (
              <div className="mx-auto w-full max-w-xl">
                <BunkerMap grid={roomState.bunker.grid} />
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
