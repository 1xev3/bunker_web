import type { SelectedItem } from '../../types/game';
import EventSelectableRow from './EventSelectableRow';
import { getItemKey, type ItemOption } from './eventUtils';

export function SelectableItemList({
  items,
  isItemSelected,
  toggleItem,
  disabled = false,
}: {
  items: ItemOption[];
  isItemSelected: (entry: SelectedItem) => boolean;
  toggleItem: (entry: SelectedItem) => void;
  disabled?: boolean;
}) {
  if (items.length === 0) {
    return <p className="text-zinc-600 text-xs px-3 py-2 rounded-lg bg-zinc-900/50">Нет доступных предметов</p>;
  }

  return (
    <div className="flex flex-col gap-1">
      {items.map(({ entry, label, owner }) => {
        const selected = isItemSelected(entry);
        const key = getItemKey(entry);
        const sourceLabel = entry.source === 'inventory' ? 'инвентарь' : entry.source === 'backpack' ? 'рюкзак' : 'бункер';
        return (
          <EventSelectableRow
            key={key}
            selected={selected}
            onToggle={() => toggleItem(entry)}
            primary={label}
            secondary={`${owner} · ${sourceLabel}`}
            ariaLabel={`Выбрать предмет ${label}`}
            disabled={disabled}
          />
        );
      })}
    </div>
  );
}
