import { useMemo, useState } from 'react';
import { Vote, UserX, Flag, Check, X, Crown, PauseCircle } from 'lucide-react';
import type { RoomState, ClientMessage } from '../types/game';

interface Props {
  roomState: RoomState;
  myPlayerId: string;
  send: (msg: ClientMessage) => void;
}

export default function AdminPanel({ roomState, myPlayerId, send }: Props) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [secondTargetId, setSecondTargetId] = useState('');
  const [variant, setVariant] = useState('');

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
  const needsVariant = Boolean(ability?.variants?.length);

  const handleUseAbility = () => {
    send({
      type: 'use_profession_ability',
      target_id: needsTarget || needsPair ? targetId : undefined,
      second_target_id: needsPair ? secondTargetId : undefined,
      variant: needsVariant ? variant : undefined,
    });
  };

  const active = roomState.players.filter(p => p.is_active);
  const canVote = !roomState.is_voting && active.length >= 2;

  return (
    <div className="card shadow-[0_10px_30px_rgba(0,0,0,0.16)] px-4 py-3">
      <p className="text-zinc-500 text-xs uppercase tracking-widest mb-3 flex items-center gap-1.5">
        <Crown size={11} className="text-zinc-500" /> Управление
      </p>

      {showAbility && ability && (
        <div className={showAdminControls ? 'mb-4 pb-4 border-b border-zinc-800/60' : ''}>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-zinc-600 text-xs uppercase tracking-widest mb-1">Способность профессии</p>
              <h3 className="text-zinc-100 font-semibold">{ability.title}</h3>
              <p className="text-zinc-400 text-sm mt-1">{ability.description}</p>
            </div>
            <span className={`text-xs px-2 py-1 rounded-full border shrink-0 ${
              ability.hasAbility
                ? ability.used
                  ? 'border-zinc-700 text-zinc-500'
                  : 'phase-banner-voting'
                : 'border-zinc-800 text-zinc-600'
            }`}>
              {!ability.hasAbility ? 'нет способности' : ability.used ? 'использовано' : 'доступно'}
            </span>
          </div>

          {ability.hasAbility && (
            <div className="flex flex-wrap gap-2">
              {needsVariant && (
                <select
                  className="bg-zinc-800/80 border border-zinc-700 text-zinc-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-zinc-400 transition-colors min-w-52"
                  value={variant}
                  onChange={e => setVariant(e.target.value)}
                  disabled={abilityDisabled}
                >
                  <option value="">Выбери эффект</option>
                  {ability.variants?.map(o => (
                    <option key={o.key} value={o.key}>{o.label}</option>
                  ))}
                </select>
              )}

              {(needsTarget || needsPair) && (
                <select
                  className="bg-zinc-800/80 border border-zinc-700 text-zinc-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-zinc-400 transition-colors min-w-52"
                  value={targetId}
                  onChange={e => setTargetId(e.target.value)}
                  disabled={abilityDisabled}
                >
                  <option value="">Выбери цель</option>
                  {activeTargets.map(p => (
                    <option key={p.id} value={p.id}>{p.id === myPlayerId ? `${p.name} (вы)` : p.name}</option>
                  ))}
                </select>
              )}

              {needsPair && (
                <select
                  className="bg-zinc-800/80 border border-zinc-700 text-zinc-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-zinc-400 transition-colors min-w-52"
                  value={secondTargetId}
                  onChange={e => setSecondTargetId(e.target.value)}
                  disabled={abilityDisabled}
                >
                  <option value="">Выбери вторую цель</option>
                  {activeTargets
                    .filter(p => p.id !== targetId)
                    .map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}

              <button
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  abilityDisabled
                  || (needsVariant && !variant)
                  || (needsTarget && !targetId)
                  || (needsPair && (!targetId || !secondTargetId))
                    ? 'bg-zinc-900 border border-zinc-800 text-zinc-600 cursor-not-allowed'
                    : 'btn-primary text-white'
                }`}
                disabled={abilityDisabled || (needsVariant && !variant) || (needsTarget && !targetId) || (needsPair && (!targetId || !secondTargetId))}
                onClick={handleUseAbility}
              >
                Использовать
              </button>
            </div>
          )}
        </div>
      )}

      {showAdminControls && (
        <div className="flex flex-wrap gap-2">
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

          <KickDropdown players={roomState.players} send={send} />

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
        </div>
      )}
    </div>
  );
}

function KickDropdown({ players, send }: { players: RoomState['players']; send: (msg: ClientMessage) => void }) {
  const [selected, setSelected] = useState('');
  const active = players.filter(p => p.is_active);

  const handleKick = () => {
    if (!selected) return;
    send({ type: 'kick_player', player_id: selected });
    setSelected('');
  };

  return (
    <div className="flex gap-1.5">
      <select
        className="bg-zinc-800/80 border border-zinc-700 text-zinc-400 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200 cursor-pointer"
        value={selected}
        onChange={e => setSelected(e.target.value)}
      >
        <option value="">Исключить…</option>
        {active.map(p => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      {selected && (
        <button
          className="px-3 py-2 rounded-xl text-sm btn-danger text-red-300 font-medium transition-all flex items-center gap-1"
          onClick={handleKick}
        >
          <UserX size={14} />
        </button>
      )}
    </div>
  );
}
