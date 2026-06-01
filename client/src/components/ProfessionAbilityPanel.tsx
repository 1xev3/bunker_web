import { useMemo, useState } from 'react';
import type { ClientMessage, RoomState } from '../types/game';

interface Props {
  roomState: RoomState;
  myPlayerId: string;
  send: (msg: ClientMessage) => void;
}

export default function ProfessionAbilityPanel({ roomState, myPlayerId, send }: Props) {
  const myPlayer = roomState.players.find(player => player.id === myPlayerId) ?? null;
  const ability = myPlayer?.profession_ability ?? null;
  const canTargetSelf = ability?.targetType === 'other' && Boolean(ability?.variants?.length);
  const activeTargets = useMemo(
    () => roomState.players.filter(player => player.is_active && (canTargetSelf || player.id !== myPlayerId)),
    [canTargetSelf, roomState.players, myPlayerId]
  );
  const [targetId, setTargetId] = useState('');
  const [secondTargetId, setSecondTargetId] = useState('');
  const [variant, setVariant] = useState('');

  if (!myPlayer || !ability) return null;

  const disabled =
    roomState.status !== 'running'
    || roomState.is_voting
    || !myPlayer.is_active
    || ability.used
    || !ability.hasAbility;

  const needsTarget = ability.targetType === 'other';
  const needsPair = ability.targetType === 'pair';
  const needsVariant = Boolean(ability.variants?.length);

  const handleUseAbility = () => {
    send({
      type: 'use_profession_ability',
      target_id: needsTarget || needsPair ? targetId : undefined,
      second_target_id: needsPair ? secondTargetId : undefined,
      variant: needsVariant ? variant : undefined,
    });
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-zinc-500 text-xs uppercase tracking-widest mb-1">Способность профессии</p>
          <h3 className="text-zinc-100 font-semibold">{ability.title}</h3>
          <p className="text-zinc-400 text-sm mt-1">{ability.description}</p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full border ${
          ability.hasAbility
            ? ability.used
              ? 'border-zinc-700 text-zinc-500'
              : 'border-amber-700/50 text-amber-300 bg-amber-950/20'
            : 'border-zinc-800 text-zinc-600'
        }`}>
          {!ability.hasAbility ? 'нет способности' : ability.used ? 'использовано' : 'доступно'}
        </span>
      </div>

      {ability.hasAbility && (
        <div className="mt-4 flex flex-wrap gap-2">
          {needsVariant && (
            <select
              className="bg-zinc-800/80 border border-zinc-700 text-zinc-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-zinc-400 transition-colors min-w-52"
              value={variant}
              onChange={event => setVariant(event.target.value)}
              disabled={disabled}
            >
              <option value="">Выбери эффект</option>
              {ability.variants?.map(option => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
          )}

          {(needsTarget || needsPair) && (
            <select
              className="bg-zinc-800/80 border border-zinc-700 text-zinc-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-zinc-400 transition-colors min-w-52"
              value={targetId}
              onChange={event => setTargetId(event.target.value)}
              disabled={disabled}
            >
              <option value="">Выбери цель</option>
              {activeTargets.map(player => (
                <option key={player.id} value={player.id}>{player.id === myPlayerId ? `${player.name} (вы)` : player.name}</option>
              ))}
            </select>
          )}

          {needsPair && (
            <select
              className="bg-zinc-800/80 border border-zinc-700 text-zinc-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-zinc-400 transition-colors min-w-52"
              value={secondTargetId}
              onChange={event => setSecondTargetId(event.target.value)}
              disabled={disabled}
            >
              <option value="">Выбери вторую цель</option>
              {activeTargets
                .filter(player => player.id !== targetId)
                .map(player => (
                  <option key={player.id} value={player.id}>{player.name}</option>
                ))}
            </select>
          )}

          <button
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              disabled
              || (needsVariant && !variant)
              || (needsTarget && !targetId)
              || (needsPair && (!targetId || !secondTargetId))
                ? 'bg-zinc-900 border border-zinc-800 text-zinc-600 cursor-not-allowed'
                : 'btn-primary text-white'
            }`}
            disabled={disabled || (needsVariant && !variant) || (needsTarget && !targetId) || (needsPair && (!targetId || !secondTargetId))}
            onClick={handleUseAbility}
          >
            Использовать
          </button>
        </div>
      )}
    </div>
  );
}
