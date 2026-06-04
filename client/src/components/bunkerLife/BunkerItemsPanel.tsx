import { Package, Backpack } from 'lucide-react';
import type { Player, RoomState } from '../../types/game';

export default function BunkerItemsPanel({ bunker, players }: { bunker: RoomState['bunker']; players: Player[] }) {
  const bunkerItems = bunker?.items ?? [];

  return (
    <div className="card flex flex-col gap-4 px-4 py-4">
      <div>
        <p className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-zinc-500">
          <Package size={13} className="text-amber-400" /> Имущество бункера
        </p>
        {bunkerItems.length === 0 ? (
          <p className="text-sm text-zinc-600">Пусто</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {bunkerItems.map((item, i) => (
              <span key={`${item.id}-${i}`} className="rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1 text-xs text-zinc-300">
                {item.label}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-zinc-800/80 pt-3">
        <p className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-zinc-500">
          <Backpack size={13} className="text-sky-400" /> Инвентарь выживших
        </p>
        <div className="flex flex-col gap-3">
          {players.map(player => {
            const inventory = player.attributes.inventory?.display;
            const backpack = player.attributes.backpack?.value ?? [];
            const hasAny = Boolean(inventory) || backpack.length > 0;
            return (
              <div key={player.id}>
                <p className="truncate text-xs font-semibold text-zinc-300">{player.name}</p>
                {hasAny ? (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {inventory && (
                      <span className="rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1 text-xs text-zinc-300">
                        {inventory}
                      </span>
                    )}
                    {backpack.map((item, i) => (
                      <span key={`${item.id}-${i}`} className="rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1 text-xs text-zinc-300">
                        {item.label}{item.quantity > 1 && <span className="ml-1 text-zinc-500">×{item.quantity}</span>}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-[11px] text-zinc-600">нет предметов</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
