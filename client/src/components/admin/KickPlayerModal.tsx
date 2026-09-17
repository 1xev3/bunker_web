import { useState } from 'react';
import type { Player } from '../../types/game';
import AdminModalFrame from './AdminModalFrame';
import PlayerOptionList from './PlayerOptionList';
import Button from '../ui/Button';

export default function KickPlayerModal({
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
        <Button
          className="flex-1 py-3"
          onClick={onClose}
        >
          Отмена
        </Button>
        <Button
          variant="danger"
          className="flex-1 py-3 font-semibold"
          disabled={!selectedId}
          onClick={() => onConfirm(selectedId)}
        >
          Исключить
        </Button>
      </div>
    </AdminModalFrame>
  );
}
