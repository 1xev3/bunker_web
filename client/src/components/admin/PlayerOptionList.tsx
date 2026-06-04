import type { Player } from '../../types/game';

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
