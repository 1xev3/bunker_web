import { useState } from 'react';
import type { Player, ProfessionAbilityInfo } from '../../types/game';
import AdminModalFrame from './AdminModalFrame';
import PlayerOptionList from './PlayerOptionList';

export default function UseAbilityModal({
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
