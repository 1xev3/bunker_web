import { useId, useMemo, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Crown, Eye, Flag, Target, UserX, Users, WandSparkles, X } from 'lucide-react';
import type { ClientMessage, RoomState } from '../../types/game';
import KickPlayerModal from './KickPlayerModal';
import RevealPlayerAttributeModal from './RevealPlayerAttributeModal';
import UseAbilityModal from './UseAbilityModal';
import VotingModal from '../game/VotingModal';
import Button from '../ui/Button';

interface Props { roomState: RoomState; myPlayerId: string; hasVoted: boolean; bunkerLifeReady: boolean; send: (msg: ClientMessage) => void; children?: ReactNode; }
type AdminModal = 'ability' | 'kick' | 'reveal' | null;

export default function AdminPanel({ roomState, myPlayerId, hasVoted, bunkerLifeReady, send, children }: Props) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [adminModal, setAdminModal] = useState<AdminModal>(null);
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

  if (!ability && !me?.secret_goal && !showVoting && !isAdmin && !children) return null;

  return <>
    <div className="relative flex min-w-0 flex-1 items-center gap-2">
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
        {children}
        {isAdmin && roomState.status !== 'finished' && <details className="relative shrink-0">
          <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-xl border border-zinc-700 px-4 text-xs text-zinc-300 transition-all hover:border-zinc-500 hover:bg-zinc-800 hover:text-white"><Crown size={14} /> Управление <ChevronDown size={12} /></summary>
          <div className="card absolute right-0 top-[calc(100%+8px)] z-50 grid w-[min(720px,calc(100vw-24px))] gap-2 p-3 shadow-2xl sm:grid-cols-3">
            <Group title="Игра"><Action disabled={roomState.status !== 'running' || roomState.is_voting || bunkerLifeReady} onClick={() => window.confirm('Начать голосование без общего согласия?') && send({ type: 'force_start_voting' })}><Flag size={13} /> Начать голосование</Action>{!confirmEnd ? <Action onClick={() => setConfirmEnd(true)}><Flag size={13} /> Завершить</Action> : <div className="flex items-center gap-1 text-xs text-zinc-500">Точно?<Action onClick={() => { send({ type: 'end_game' }); setConfirmEnd(false); }}><Check size={13} /> Да</Action><button onClick={() => setConfirmEnd(false)}><X size={13} /></button></div>}<Action disabled={roomState.status !== 'running' || roomState.is_voting} onClick={() => send({ type: 'force_start_bunker_life' })}><Crown size={13} /> К выживанию</Action></Group>
            <Group title="Раскрытие"><Action disabled={!canReveal} onClick={() => setAdminModal('reveal')}><Eye size={13} /> Характеристика</Action><Action disabled={!canReveal} onClick={() => send({ type: 'admin_reveal_all_players' })}><Users size={13} /> Всё у всех</Action></Group>
            <Group title="Игроки"><Action danger disabled={!kickablePlayers.length} onClick={() => setAdminModal('kick')}><UserX size={13} /> Исключить</Action></Group>
          </div>
        </details>}
        {showVoting && <VotingModal players={roomState.players} myPlayerId={myPlayerId} isAdmin={isAdmin} hasVoted={hasVoted} voting={roomState.voting} send={send} />}
      </div>
    </div>
    {adminModal === 'kick' && <KickPlayerModal players={kickablePlayers} onClose={() => setAdminModal(null)} onConfirm={id => { send({ type: 'kick_player', player_id: id }); setAdminModal(null); }} />}
    {adminModal === 'reveal' && <RevealPlayerAttributeModal players={roomState.players} onClose={() => setAdminModal(null)} onConfirm={(id, attributes) => { send({ type: 'admin_reveal_player_attributes', player_id: id, attributes }); setAdminModal(null); }} />}
    {adminModal === 'ability' && ability && <UseAbilityModal ability={ability} activeTargets={activeTargets} myPlayerId={myPlayerId} onClose={() => setAdminModal(null)} onConfirm={payload => { send({ type: 'use_profession_ability', ...payload }); setAdminModal(null); }} />}
  </>;
}

function Group({ title, children }: { title: string; children: ReactNode }) { return <div className="rounded-lg border border-zinc-800 p-2"><p className="mb-2 text-[10px] uppercase tracking-widest text-zinc-600">{title}</p><div className="flex flex-wrap gap-1.5">{children}</div></div>; }
function Action({ children, danger = false, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) { return <Button variant={danger ? 'danger' : 'secondary'} className="px-2.5 py-1.5 text-xs" {...props}>{children}</Button>; }
