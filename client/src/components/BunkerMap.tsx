import { DoorOpen } from 'lucide-react';
import type { BunkerCell } from '../types/game';

interface Props {
  grid: BunkerCell[][];
  compact?: boolean;
}

export default function BunkerMap({ grid, compact = false }: Props) {
  return (
    <div className="aspect-square w-full grid grid-cols-5 gap-1">
      {grid.map((row, r) =>
        row.map((cell, c) => {
          const label = cell && !cell.isEntrance
            ? cell.items.length ? cell.items.map(item => item.label).join('\n') : 'Комната'
            : '';

          return (
            <div
              key={`${r}-${c}`}
              title={cell?.isEntrance ? 'Вход' : label || undefined}
              className={[
                'aspect-square rounded flex flex-col items-center justify-center text-center overflow-hidden leading-tight',
                compact ? 'p-0.5 text-[8px]' : 'p-1 text-[10px]',
                cell
                  ? cell.isEntrance
                    ? 'border border-amber-600/70 bg-amber-950/40 text-amber-300/90'
                    : 'border border-zinc-700 bg-zinc-800/60 text-zinc-300'
                  : 'border border-transparent',
              ].join(' ')}
            >
              {cell?.isEntrance ? (
                <>
                  <DoorOpen size={compact ? 9 : 13} className="shrink-0 mb-0.5" />
                  <span>Вход</span>
                </>
              ) : cell ? (
                <span className="line-clamp-3 w-full whitespace-pre-line break-words">{label}</span>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}
