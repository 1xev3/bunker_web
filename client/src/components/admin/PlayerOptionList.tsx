import type { Player } from '../../types/game';
import Button from '../ui/Button';

// A single-select list of players, used by the kick/reveal/ability modals.
export default function PlayerOptionList({
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
        <Button
          key={player.id}
          variant={selectedId === player.id ? 'primary' : 'secondary'}
          className={`w-full justify-between px-3 py-2 text-left ${
            selectedId === player.id
              ? ''
              : 'bg-zinc-950/30'
          }`}
          onClick={() => onSelect(player.id)}
        >
          <div className="flex w-full items-center justify-between gap-3">
            <span className="font-medium">{player.name}</span>
            <span className={`text-xs ${player.is_active ? 'text-emerald-400' : 'text-zinc-500'}`}>
              {player.is_active ? 'в игре' : 'выбыл'}
            </span>
          </div>
        </Button>
      ))}
    </div>
  );
}
