import { useState } from 'react';
import type { AttributeKey, Player } from '../../types/game';
import { ATTRIBUTE_KEYS, ATTRIBUTE_LABELS } from '../../types/game';
import AdminModalFrame from './AdminModalFrame';
import PlayerOptionList from './PlayerOptionList';

export default function RevealPlayerAttributeModal({
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
