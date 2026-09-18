import { useId, useMemo, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Crown, Eye, Flag, Menu, Target, UserX, Users, WandSparkles, X } from 'lucide-react';
import type { ClientMessage, RoomState } from '../../types/game';
import KickPlayerModal from './KickPlayerModal';
import RevealPlayerAttributeModal from './RevealPlayerAttributeModal';
import UseAbilityModal from './UseAbilityModal';
import VotingModal from '../game/VotingModal';
import BunkerLifeReadyButton from '../game/BunkerLifeReadyButton';
import Button from '../ui/Button';

interface Props { roomState: RoomState; myPlayerId: string; hasVoted: boolean; bunkerLifeReady: boolean; send: (msg: ClientMessage) => void; children?: ReactNode; }
type AdminModal = 'ability' | 'kick' | 'reveal' | null;

export default function AdminPanel({ roomState, myPlayerId, hasVoted, bunkerLifeReady, send, children }: Props) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [adminModal, setAdminModal] = useState<AdminModal>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const abilityTooltipId = useId();
  const secretGoalTooltipId = useId();
  const isAdmin = roomState.admin_id === myPlayerId;
  const me = roomState.players.find(p => p.id === myPlayerId) ?? null;
  const ability = me?.profession_ability ?? null;
  const kickablePlayers = roomState.players.filter(p => p.is_active && p.id !== myPlayerId);
  const showVoting = roomState.status === 'running' && Boolean(me?.is_active) && !bunkerLifeReady;
  const abilityDisabled = roomState.status !== 'running' || roomState.is_voting || !me?.is_active || ability?.used || !ability?.hasAbility;
  const canReveal = roomState.status === 'running' || roomState.status === 'bunker_life';
  const activeTargets = useMemo(() => roomState.players.filter(p => p.is_active && (ability?.allowSelf || p.id !== myPlayerId)), [ability?.allowSelf, roomState.players, myPlayerId]);
  const votingControl = bunkerLifeReady
    ? <BunkerLifeReadyButton activePlayers={roomState.players.filter(p => p.is_active)} confirmedIds={roomState.confirmed_bunker_life} myPlayerId={myPlayerId} send={send} />
    : showVoting && <VotingModal players={roomState.players} myPlayerId={myPlayerId} isAdmin={isAdmin} hasVoted={hasVoted} voting={roomState.voting} send={send} />;

  if (!ability && !me?.secret_goal && !showVoting && !bunkerLifeReady && !isAdmin && !children) return null;

  const controls = <>
      {ability && <div className="group relative shrink-0">
        <Button className="h-10 text-xs text-violet-300 hover:text-violet-100" disabled={Boolean(abilityDisabled)} aria-describedby={abilityTooltipId} onClick={() => setAdminModal('ability')}><WandSparkles size={14} /> Способность: {ability.title}</Button>
        <div id={abilityTooltipId} role="tooltip" className="pointer-events-none absolute left-1/2 top-[calc(100%+8px)] z-50 w-72 -translate-x-1/2 translate-y-1 rounded-xl border border-violet-900/70 bg-zinc-950/95 px-3 py-2.5 text-xs leading-relaxed text-zinc-200 opacity-0 shadow-2xl backdrop-blur transition duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
          <span className="mb-1 block font-semibold text-violet-300">{ability.title}</span>
          {ability.description}
        </div>
      </div>}
      {me?.secret_goal && <div className="group relative shrink-0">
        <Button className="h-10 text-xs" aria-describedby={secretGoalTooltipId}><Target size={14} /> Тайная цель</Button>
        <div id={secretGoalTooltipId} role="tooltip" className="pointer-events-none absolute left-1/2 top-[calc(100%+8px)] z-50 w-80 -translate-x-1/2 translate-y-1 rounded-xl border border-zinc-700 bg-zinc-950/95 px-3 py-2.5 text-sm leading-relaxed text-zinc-200 opacity-0 shadow-2xl backdrop-blur transition duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
          {me.secret_goal}
        </div>
      </div>}
      <div className="ml-auto flex items-center gap-2">
        <div className="hidden items-center gap-2 md:flex">{children}</div>
        {isAdmin && roomState.status !== 'finished' && <details className="relative shrink-0">
          <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-xl border border-zinc-700 px-4 text-xs text-zinc-300 transition-all hover:border-zinc-500 hover:bg-zinc-800 hover:text-white"><Crown size={14} /> Управление <ChevronDown size={12} /></summary>
          <div className="card fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[80] grid max-h-[65dvh] gap-2 overflow-auto p-3 shadow-2xl md:absolute md:inset-x-auto md:bottom-auto md:right-0 md:top-[calc(100%+8px)] md:w-[min(720px,calc(100vw-24px))] md:grid-cols-3">
            <Group title="Игра"><Action disabled={roomState.status !== 'running' || roomState.is_voting || bunkerLifeReady} onClick={() => window.confirm('Начать голосование без общего согласия?') && send({ type: 'force_start_voting' })}><Flag size={13} /> Начать голосование</Action>{!confirmEnd ? <Action onClick={() => setConfirmEnd(true)}><Flag size={13} /> Завершить</Action> : <div className="flex items-center gap-1 text-xs text-zinc-500">Точно?<Action onClick={() => { send({ type: 'end_game' }); setConfirmEnd(false); }}><Check size={13} /> Да</Action><button onClick={() => setConfirmEnd(false)}><X size={13} /></button></div>}<Action disabled={roomState.status !== 'running' || roomState.is_voting} onClick={() => send({ type: 'force_start_bunker_life' })}><Crown size={13} /> К выживанию</Action></Group>
            <Group title="Раскрытие"><Action disabled={!canReveal} onClick={() => setAdminModal('reveal')}><Eye size={13} /> Характеристика</Action><Action disabled={!canReveal} onClick={() => send({ type: 'admin_reveal_all_players' })}><Users size={13} /> Всё у всех</Action></Group>
            <Group title="Игроки"><Action danger disabled={!kickablePlayers.length} onClick={() => setAdminModal('kick')}><UserX size={13} /> Исключить</Action></Group>
          </div>
        </details>}
        <div className="hidden md:block">{votingControl}</div>
      </div>
  </>;

  return <>
    <div className="relative hidden min-w-0 flex-1 items-center gap-2 md:flex">
      {controls}
    </div>
    <div className="fixed inset-x-0 bottom-0 z-[70] border-t border-zinc-700 bg-zinc-950/95 px-2 pt-2 pb-[calc(.5rem+env(safe-area-inset-bottom))] shadow-[0_-12px_36px_rgba(0,0,0,.55)] backdrop-blur-xl md:hidden">
      {mobileOpen && <button type="button" aria-label="Закрыть меню" className="fixed inset-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] bg-black/55" onClick={() => setMobileOpen(false)} />}
      {mobileOpen && (
        <div className="card absolute inset-x-2 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 max-h-[min(70dvh,38rem)] overflow-y-auto p-3 shadow-2xl animate-fade-in-up">
          <div className="mb-3 flex items-center justify-between border-b border-zinc-800 pb-2">
            <span className="term-label">// ДЕЙСТВИЯ</span>
            <button type="button" className="flex h-9 w-9 items-center justify-center text-zinc-400" onClick={() => setMobileOpen(false)} aria-label="Закрыть"><X size={18} /></button>
          </div>
          <div className="flex flex-col gap-2 [&>div]:w-full [&>div:last-child]:ml-0 [&>div:last-child]:flex-col [&>div:last-child]:items-stretch [&_button]:min-h-11 [&_button]:w-full [&_button]:justify-start [&_details]:w-full [&_summary]:w-full">
            {controls}
          </div>
        </div>
      )}
      <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(7.5rem,auto)] items-center gap-2">
        <div className="flex shrink-0 gap-1 [&_button]:h-12 [&_button]:w-11">{children}</div>
        <div className="flex min-w-0 justify-center overflow-visible [&>div]:min-w-0 [&_button]:h-12 [&_button]:max-w-full [&_button]:px-2 [&_button]:text-[10px]">
          {votingControl}
        </div>
        <button type="button" onClick={() => setMobileOpen(open => !open)} aria-expanded={mobileOpen} className="flex h-12 min-w-[7.5rem] items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-sm font-semibold text-zinc-100">
          {mobileOpen ? <X size={18} /> : <Menu size={18} />} {mobileOpen ? 'Закрыть' : 'Действия'}
        </button>
      </div>
    </div>
    {adminModal === 'kick' && <KickPlayerModal players={kickablePlayers} onClose={() => setAdminModal(null)} onConfirm={id => { send({ type: 'kick_player', player_id: id }); setAdminModal(null); }} />}
    {adminModal === 'reveal' && <RevealPlayerAttributeModal players={roomState.players} onClose={() => setAdminModal(null)} onConfirm={(id, attributes) => { send({ type: 'admin_reveal_player_attributes', player_id: id, attributes }); setAdminModal(null); }} />}
    {adminModal === 'ability' && ability && <UseAbilityModal ability={ability} activeTargets={activeTargets} myPlayerId={myPlayerId} onClose={() => setAdminModal(null)} onConfirm={payload => { send({ type: 'use_profession_ability', ...payload }); setAdminModal(null); }} />}
  </>;
}

function Group({ title, children }: { title: string; children: ReactNode }) { return <div className="rounded-lg border border-zinc-800 p-2"><p className="mb-2 text-[10px] uppercase tracking-widest text-zinc-600">{title}</p><div className="flex flex-wrap gap-1.5">{children}</div></div>; }
function Action({ children, danger = false, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) { return <Button variant={danger ? 'danger' : 'secondary'} className="px-2.5 py-1.5 text-xs" {...props}>{children}</Button>; }
