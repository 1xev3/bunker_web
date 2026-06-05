import { useMemo, useState, type ReactNode } from 'react';
import { Vote, UserX, Flag, Check, X, Crown, PauseCircle, Eye, Users } from 'lucide-react';
import type { RoomState, ClientMessage } from '../../types/game';
import AbilityCard from './AbilityCard';
import SecretGoalCard from './SecretGoalCard';
import KickPlayerModal from './KickPlayerModal';
import RevealPlayerAttributeModal from './RevealPlayerAttributeModal';
import UseAbilityModal from './UseAbilityModal';

interface Props {
  roomState: RoomState;
  myPlayerId: string;
  send: (msg: ClientMessage) => void;
}

type AdminModal =
  | { type: 'ability' }
  | { type: 'kick' }
  | { type: 'reveal_player_attribute' }
  | null;

export default function AdminPanel({ roomState, myPlayerId, send }: Props) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [adminModal, setAdminModal] = useState<AdminModal>(null);

  const isAdmin = roomState.admin_id === myPlayerId;
  const isFinished = roomState.status === 'finished';
  const myPlayer = roomState.players.find(p => p.id === myPlayerId) ?? null;
  const ability = myPlayer?.profession_ability ?? null;
  const secretGoal = myPlayer?.secret_goal ?? null;

  const activeTargets = useMemo(
    () => roomState.players.filter(p => p.is_active && (ability?.allowSelf || p.id !== myPlayerId)),
    [ability?.allowSelf, roomState.players, myPlayerId]
  );

  const showAbility = Boolean(ability);
  const showGoal = Boolean(secretGoal);
  const showSidebar = showAbility || showGoal;
  const showAdminControls = isAdmin && !isFinished;

  if (!showSidebar && !showAdminControls) return null;

  const abilityDisabled = Boolean(
    roomState.status !== 'running'
    || roomState.is_voting
    || !myPlayer?.is_active
    || ability?.used
    || !ability?.hasAbility
  );

  const activePlayers = roomState.players.filter(p => p.is_active);
  const canVote = !roomState.is_voting && activePlayers.length >= 2;
  const canAdminReveal = roomState.status === 'running' || roomState.status === 'bunker_life';
  const canForceBunkerLife =
    roomState.status === 'running'
    && !roomState.is_voting;
  const kickablePlayers = activePlayers.filter(p => p.id !== myPlayerId);

  return (
    <>
      <div className="card shadow-[0_10px_30px_rgba(0,0,0,0.16)] px-4 py-3">
        <p className="term-label mb-3">
          <Crown size={11} /> Управление
        </p>
        <div className={`grid gap-4 ${showSidebar && showAdminControls ? 'xl:grid-cols-[420px_minmax(0,1fr)] xl:items-start' : ''}`}>
          {showSidebar && (
            <div className="space-y-4">
              {showAbility && ability && (
                <AbilityCard
                  ability={ability}
                  disabled={abilityDisabled}
                  onOpen={() => setAdminModal({ type: 'ability' })}
                />
              )}
              {showGoal && secretGoal && <SecretGoalCard goal={secretGoal} />}
            </div>
          )}

          {showAdminControls && (
            <div className="space-y-4">
              <AdminActionGroup title="Ход игры">
              <button
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${
                  canVote
                    ? 'btn-primary text-white'
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-600 cursor-not-allowed'
                }`}
                disabled={!canVote}
                onClick={() => send({ type: 'start_voting' })}
              >
                {roomState.is_voting
                  ? <><span className="inline-block w-1.5 h-1.5 rounded-full bg-current animate-pulse"></span> Голосование идёт…</>
                  : <><Vote size={14} /> Начать голосование</>
                }
              </button>

              {roomState.is_voting && (
                <button
                  className="px-4 py-2 rounded-xl text-sm border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 hover:bg-zinc-700/60 transition-all flex items-center gap-2"
                  onClick={() => send({ type: 'cancel_voting' })}
                >
                  <PauseCircle size={14} /> Отложить голосование
                </button>
              )}

              {!confirmEnd ? (
                <button
                  className="px-4 py-2 rounded-xl text-sm border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 hover:bg-zinc-700/60 transition-all flex items-center gap-2"
                  onClick={() => setConfirmEnd(true)}
                >
                  <Flag size={14} /> Завершить игру
                </button>
              ) : (
                <div className="flex gap-2 items-center">
                  <span className="text-zinc-600 text-xs">Точно завершить?</span>
                  <button
                    className="px-3 py-2 rounded-xl text-sm btn-danger text-red-200 font-medium transition-all flex items-center gap-1.5"
                    onClick={() => { send({ type: 'end_game' }); setConfirmEnd(false); }}
                  >
                    <Check size={13} /> Да
                  </button>
                  <button
                    className="px-3 py-2 rounded-xl text-sm text-zinc-500 hover:text-zinc-200 transition-colors flex items-center gap-1"
                    onClick={() => setConfirmEnd(false)}
                  >
                    <X size={13} /> Отмена
                  </button>
                </div>
              )}

              <button
                className={`px-4 py-2 rounded-xl text-sm border transition-all flex items-center gap-2 ${
                  canForceBunkerLife
                    ? 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 hover:bg-zinc-700/60'
                    : 'border-zinc-800 text-zinc-600 cursor-not-allowed'
                }`}
                disabled={!canForceBunkerLife}
                onClick={() => send({ type: 'force_start_bunker_life' })}
              >
                <Crown size={14} /> Перейти к выживанию
              </button>
              </AdminActionGroup>

              <AdminActionGroup title="Раскрытие">
              <button
                className={`px-4 py-2 rounded-xl text-sm border transition-all flex items-center gap-2 ${
                  canAdminReveal
                    ? 'border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 hover:bg-zinc-700/60'
                    : 'border-zinc-800 text-zinc-600 cursor-not-allowed'
                }`}
                disabled={!canAdminReveal}
                onClick={() => setAdminModal({ type: 'reveal_player_attribute' })}
              >
                <Eye size={14} /> Открыть характеристику
              </button>

              <button
                className={`px-4 py-2 rounded-xl text-sm border transition-all flex items-center gap-2 ${
                  canAdminReveal
                    ? 'border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 hover:bg-zinc-700/60'
                    : 'border-zinc-800 text-zinc-600 cursor-not-allowed'
                }`}
                disabled={!canAdminReveal}
                onClick={() => send({ type: 'admin_reveal_all_players' })}
              >
                <Users size={14} /> Открыть всё у всех
              </button>
              </AdminActionGroup>

              <AdminActionGroup title="Модерация">
              <button
                className={`px-4 py-2 rounded-xl text-sm border transition-all flex items-center gap-2 ${
                  kickablePlayers.length > 0
                    ? 'border-red-900/70 text-red-300 hover:text-red-100 hover:border-red-700 hover:bg-red-950/40'
                    : 'border-zinc-800 text-zinc-600 cursor-not-allowed'
                }`}
                disabled={kickablePlayers.length === 0}
                onClick={() => setAdminModal({ type: 'kick' })}
              >
                <UserX size={14} /> Кикнуть игрока
              </button>
              </AdminActionGroup>
            </div>
          )}
        </div>
      </div>

      {adminModal?.type === 'kick' && (
        <KickPlayerModal
          players={kickablePlayers}
          onClose={() => setAdminModal(null)}
          onConfirm={(playerId) => {
            send({ type: 'kick_player', player_id: playerId });
            setAdminModal(null);
          }}
        />
      )}

      {adminModal?.type === 'reveal_player_attribute' && (
        <RevealPlayerAttributeModal
          players={roomState.players}
          onClose={() => setAdminModal(null)}
          onConfirm={(playerId, attributes) => {
            send({ type: 'admin_reveal_player_attributes', player_id: playerId, attributes });
            setAdminModal(null);
          }}
        />
      )}

      {adminModal?.type === 'ability' && ability && (
        <UseAbilityModal
          ability={ability}
          activeTargets={activeTargets}
          myPlayerId={myPlayerId}
          onClose={() => setAdminModal(null)}
          onConfirm={(payload) => {
            send({ type: 'use_profession_ability', ...payload });
            setAdminModal(null);
          }}
        />
      )}

    </>
  );
}

function AdminActionGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/45 px-3 py-3">
      <p className="mb-2 text-[11px] uppercase tracking-[0.24em] text-zinc-500">{title}</p>
      <div className="flex flex-wrap gap-2">
        {children}
      </div>
    </div>
  );
}
