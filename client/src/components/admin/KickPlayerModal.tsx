import { useState } from 'react';
import type { Player } from '../../types/game';
import AdminModalFrame from './AdminModalFrame';
import PlayerOptionList from './PlayerOptionList';

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
