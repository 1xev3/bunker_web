import { useState } from 'react';
import type { AttributeKey, Player } from '../../types/game';
import { ATTRIBUTE_KEYS, ATTRIBUTE_LABELS } from '../../types/game';
import AdminModalFrame from './AdminModalFrame';
import PlayerOptionList from './PlayerOptionList';
import Button from '../ui/Button';

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
          <Button
            className="flex-1"
            onClick={() => setSelectedAttributes([...ATTRIBUTE_KEYS])}
          >
            Выбрать все
          </Button>
          <Button
            className="flex-1"
            onClick={() => setSelectedAttributes([])}
          >
            Снять все
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {ATTRIBUTE_KEYS.map(attribute => (
            <Button
              key={attribute}
              variant={selectedAttributes.includes(attribute) ? 'primary' : 'secondary'}
              className="py-2.5"
              onClick={() => toggleAttribute(attribute)}
            >
              {ATTRIBUTE_LABELS[attribute]}
            </Button>
          ))}
        </div>
      </div>

      <div className="mt-5 flex gap-2">
        <Button
          className="flex-1 py-3"
          onClick={onClose}
        >
          Отмена
        </Button>
        <Button
          variant="primary"
          className="flex-1 py-3 font-semibold"
          disabled={!selectedId || selectedAttributes.length === 0}
          onClick={() => onConfirm(selectedId, selectedAttributes)}
        >
          Открыть выбранное
        </Button>
      </div>
    </AdminModalFrame>
  );
}
