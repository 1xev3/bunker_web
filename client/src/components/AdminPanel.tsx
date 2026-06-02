import { useMemo, useState, type ReactNode } from 'react';
import { Vote, UserX, Flag, Check, X, Crown, PauseCircle, Eye, Users, Sparkles, WandSparkles } from 'lucide-react';
import type { RoomState, ClientMessage, AttributeKey, Player, ProfessionAbilityInfo } from '../types/game';
import { ATTRIBUTE_KEYS, ATTRIBUTE_LABELS } from '../types/game';

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

  const activeTargets = useMemo(
    () => roomState.players.filter(p => p.is_active && (ability?.allowSelf || p.id !== myPlayerId)),
    [ability?.allowSelf, roomState.players, myPlayerId]
  );

  const showAbility = Boolean(ability);
  const showAdminControls = isAdmin && !isFinished;

  if (!showAbility && !showAdminControls) return null;

  const abilityDisabled =
    roomState.status !== 'running'
    || roomState.is_voting
    || !myPlayer?.is_active
    || ability?.used
    || !ability?.hasAbility;

  const needsTarget = ability?.targetType === 'other';
  const needsPair = ability?.targetType === 'pair';

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
        <p className="text-zinc-500 text-xs uppercase tracking-widest mb-3 flex items-center gap-1.5">
          <Crown size={11} className="text-zinc-500" /> Управление
        </p>
        <div className={`grid gap-4 ${showAbility && showAdminControls ? 'xl:grid-cols-[420px_minmax(0,1fr)] xl:items-start' : ''}`}>
          {showAbility && ability && (
            <div>
              <button
                className={`ability-card ability-card-compact group text-left ${abilityDisabled ? 'opacity-70' : ''}`}
                disabled={!ability?.hasAbility}
                onClick={() => {
                  if (!abilityDisabled) setAdminModal({ type: 'ability' });
                }}
              >
                <div className="ability-card-glow" />
                <div className="ability-card-stars" />
                <div className="relative z-10">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex items-start gap-3">
                      <div className="ability-card-icon mt-0.5">
                        <WandSparkles size={18} />
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.3em] text-amber-200/70 mb-1">Способность профессии</p>
                        <h3 className="text-zinc-50 font-semibold text-lg leading-tight">{ability.title}</h3>
                      </div>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full border shrink-0 backdrop-blur-sm ${
                      ability.hasAbility
                        ? ability.used
                          ? 'border-zinc-600 text-zinc-400 bg-zinc-900/60'
                          : 'border-amber-400/40 text-amber-100 bg-amber-400/10'
                        : 'border-zinc-700 text-zinc-500 bg-zinc-900/60'
                    }`}>
                      {!ability.hasAbility ? 'нет способности' : ability.used ? 'использовано' : 'доступно'}
                    </span>
                  </div>

                  <p className="text-sm leading-relaxed text-zinc-200/90 mb-4">{ability.description}</p>

                  <div className="flex flex-wrap gap-2 mb-4">
                    {needsTarget && <AbilityChip label="Выбор цели" />}
                    {needsPair && <AbilityChip label="Две цели" />}
                    {!needsTarget && !needsPair && <AbilityChip label="Без выбора цели" />}
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs text-amber-100/70">
                      <Sparkles size={12} />
                      <span>{abilityDisabled ? 'Сейчас недоступно' : 'Нажми, чтобы открыть ритуал применения'}</span>
                    </div>
                    <span className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                      abilityDisabled
                        ? 'border border-zinc-800 bg-zinc-950/70 text-zinc-600'
                        : 'ability-card-action'
                    }`}>
                      Использовать
                    </span>
                  </div>
                </div>
              </button>
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

function AbilityChip({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-amber-300/15 bg-black/20 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-amber-100/70">
      {label}
    </span>
  );
}

function AdminModalFrame({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-700/80 bg-zinc-900 p-6 shadow-2xl animate-fade-in-up">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="text-lg font-bold text-zinc-100">{title}</h2>
            <p className="text-zinc-400 text-sm mt-1">{description}</p>
          </div>
          <button
            className="rounded-lg p-2 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PlayerOptionList({
  players,
  selectedId,
  onSelect,
}: {
  players: Player[];
  selectedId: string;
  onSelect: (playerId: string) => void;
}) {
  return (
    <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
      {players.map(player => (
        <button
          key={player.id}
          className={`w-full rounded-xl border px-4 py-3 text-left transition-all ${
            selectedId === player.id
              ? 'border-amber-500/70 bg-amber-950/30 text-amber-100'
              : 'border-zinc-700/70 bg-zinc-800/40 text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800/70'
          }`}
          onClick={() => onSelect(player.id)}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium">{player.name}</span>
            <span className={`text-xs ${player.is_active ? 'text-emerald-400' : 'text-zinc-500'}`}>
              {player.is_active ? 'в игре' : 'выбыл'}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

function KickPlayerModal({
  players,
  onClose,
  onConfirm,
}: {
  players: Player[];
  onClose: () => void;
  onConfirm: (playerId: string) => void;
}) {
  const [selectedId, setSelectedId] = useState('');

  return (
    <AdminModalFrame
      title="Кикнуть игрока"
      description="Игрок будет исключён из текущей партии."
      onClose={onClose}
    >
      <PlayerOptionList players={players} selectedId={selectedId} onSelect={setSelectedId} />
      <div className="mt-5 flex gap-2">
        <button
          className="flex-1 rounded-xl border border-zinc-700 px-4 py-3 text-sm text-zinc-300 hover:text-white hover:border-zinc-500 hover:bg-zinc-700/60 transition-all"
          onClick={onClose}
        >
          Отмена
        </button>
        <button
          className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
            selectedId
              ? 'btn-danger text-red-100'
              : 'bg-zinc-900 border border-zinc-800 text-zinc-600 cursor-not-allowed'
          }`}
          disabled={!selectedId}
          onClick={() => onConfirm(selectedId)}
        >
          Исключить
        </button>
      </div>
    </AdminModalFrame>
  );
}

function RevealPlayerAttributeModal({
  players,
  onClose,
  onConfirm,
}: {
  players: Player[];
  onClose: () => void;
  onConfirm: (playerId: string, attributes: AttributeKey[]) => void;
}) {
  const [selectedId, setSelectedId] = useState('');
  const [selectedAttributes, setSelectedAttributes] = useState<AttributeKey[]>([]);

  const toggleAttribute = (attribute: AttributeKey) => {
    setSelectedAttributes(current =>
      current.includes(attribute)
        ? current.filter(value => value !== attribute)
        : [...current, attribute]
    );
  };

  return (
    <AdminModalFrame
      title="Открыть характеристику"
      description="Выбери игрока и одну или несколько характеристик, которые нужно раскрыть всем."
      onClose={onClose}
    >
      <div className="space-y-4">
        <PlayerOptionList players={players} selectedId={selectedId} onSelect={setSelectedId} />

        <div className="flex gap-2">
          <button
            className="flex-1 rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:border-zinc-500 hover:bg-zinc-700/60 transition-all"
            onClick={() => setSelectedAttributes([...ATTRIBUTE_KEYS])}
          >
            Выбрать все
          </button>
          <button
            className="flex-1 rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:border-zinc-500 hover:bg-zinc-700/60 transition-all"
            onClick={() => setSelectedAttributes([])}
          >
            Снять все
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {ATTRIBUTE_KEYS.map(attribute => (
            <button
              key={attribute}
              className={`rounded-xl border px-3 py-2.5 text-sm transition-all ${
                selectedAttributes.includes(attribute)
                  ? 'border-amber-500/70 bg-amber-950/30 text-amber-100'
                  : 'border-zinc-700/70 bg-zinc-800/40 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800/70'
              }`}
              onClick={() => toggleAttribute(attribute)}
            >
              {ATTRIBUTE_LABELS[attribute]}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 flex gap-2">
        <button
          className="flex-1 rounded-xl border border-zinc-700 px-4 py-3 text-sm text-zinc-300 hover:text-white hover:border-zinc-500 hover:bg-zinc-700/60 transition-all"
          onClick={onClose}
        >
          Отмена
        </button>
        <button
          className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
            selectedId && selectedAttributes.length > 0
              ? 'btn-primary text-white'
              : 'bg-zinc-900 border border-zinc-800 text-zinc-600 cursor-not-allowed'
          }`}
          disabled={!selectedId || selectedAttributes.length === 0}
          onClick={() => onConfirm(selectedId, selectedAttributes)}
        >
          Открыть выбранное
        </button>
      </div>
    </AdminModalFrame>
  );
}

function UseAbilityModal({
  ability,
  activeTargets,
  myPlayerId,
  onClose,
  onConfirm,
}: {
  ability: ProfessionAbilityInfo;
  activeTargets: Player[];
  myPlayerId: string;
  onClose: () => void;
  onConfirm: (payload: { target_id?: string; second_target_id?: string }) => void;
}) {
  const needsTarget = ability.targetType === 'other';
  const needsPair = ability.targetType === 'pair';

  const [targetId, setTargetId] = useState('');
  const [secondTargetId, setSecondTargetId] = useState('');

  const secondTargetOptions = activeTargets.filter(player => player.id !== targetId);
  const canConfirm =
    (!needsTarget || Boolean(targetId))
    && (!needsPair || (Boolean(targetId) && Boolean(secondTargetId)));

  return (
    <AdminModalFrame
      title={ability.title}
      description={ability.description}
      onClose={onClose}
    >
      <div className="space-y-4">
        {ability.lockedVariant && (
          <div className="rounded-xl border border-zinc-700/70 bg-zinc-800/40 px-4 py-3 text-sm text-zinc-300">
            <span className="text-zinc-500 text-xs uppercase tracking-widest mr-2">Эффект:</span>
            {ability.lockedVariant.label}
          </div>
        )}

        {(needsTarget || needsPair) && (
          <div>
            <p className="text-zinc-500 text-xs uppercase tracking-widest mb-2">Первая цель</p>
            <PlayerOptionList players={activeTargets} selectedId={targetId} onSelect={setTargetId} />
          </div>
        )}

        {needsPair && (
          <div>
            <p className="text-zinc-500 text-xs uppercase tracking-widest mb-2">Вторая цель</p>
            <PlayerOptionList players={secondTargetOptions} selectedId={secondTargetId} onSelect={setSecondTargetId} />
          </div>
        )}

        {!needsTarget && !needsPair && (
          <div className="rounded-xl border border-amber-400/20 bg-amber-500/8 px-4 py-3 text-sm text-amber-100/80">
            Способность не требует выбора цели. Применение сработает сразу.
          </div>
        )}

        {(needsTarget || needsPair) && targetId && (
          <div className="rounded-xl border border-zinc-700/70 bg-zinc-800/40 px-4 py-3 text-xs text-zinc-400">
            Первая цель:
            {' '}
            <span className="text-zinc-200">
              {activeTargets.find(player => player.id === targetId)?.id === myPlayerId
                ? `${activeTargets.find(player => player.id === targetId)?.name} (вы)`
                : activeTargets.find(player => player.id === targetId)?.name}
            </span>
            {needsPair && secondTargetId && (
              <>
                {' '}• Вторая цель:{' '}
                <span className="text-zinc-200">{secondTargetOptions.find(player => player.id === secondTargetId)?.name}</span>
              </>
            )}
          </div>
        )}
      </div>

      <div className="mt-5 flex gap-2">
        <button
          className="flex-1 rounded-xl border border-zinc-700 px-4 py-3 text-sm text-zinc-300 hover:text-white hover:border-zinc-500 hover:bg-zinc-700/60 transition-all"
          onClick={onClose}
        >
          Отмена
        </button>
        <button
          className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
            canConfirm
              ? 'btn-primary text-white'
              : 'bg-zinc-900 border border-zinc-800 text-zinc-600 cursor-not-allowed'
          }`}
          disabled={!canConfirm}
          onClick={() => onConfirm({
            target_id: needsTarget || needsPair ? targetId : undefined,
            second_target_id: needsPair ? secondTargetId : undefined,
          })}
        >
          Активировать
        </button>
      </div>
    </AdminModalFrame>
  );
}
