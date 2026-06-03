import { Fragment } from 'react';
import type { BunkerInfo, Player, SelectedItem, PackSettings } from '../../types/game';
import EventSelectableRow from './EventSelectableRow';

export interface ItemOption {
  entry: SelectedItem;
  label: string;
  owner: string;
}

const EVENT_HIGHLIGHT_RE = /(<<event-highlight>>.*?<<\/event-highlight>>)/g;
const EVENT_HIGHLIGHT_START = '<<event-highlight>>';
const EVENT_HIGHLIGHT_END = '<</event-highlight>>';

export function getSuccessChance(resourceCount: number, baseChance: number, packSettings: PackSettings): number {
  if (resourceCount === 0) return Math.round(baseChance * 100);
  if (resourceCount === 1) return Math.round(packSettings.events.success_chances.one_resource * 100);
  if (resourceCount === 2) return Math.round(packSettings.events.success_chances.two_resources * 100);
  return Math.round(packSettings.events.success_chances.three_plus_resources * 100);
}

export function renderEventText(text: string) {
  return text.split(EVENT_HIGHLIGHT_RE).filter(Boolean).map((part, index) => {
    if (part.startsWith(EVENT_HIGHLIGHT_START) && part.endsWith(EVENT_HIGHLIGHT_END)) {
      const value = part.slice(EVENT_HIGHLIGHT_START.length, -EVENT_HIGHLIGHT_END.length);
      return <span key={index} className="event-text-highlight">{value}</span>;
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

export function getItemKey(entry: SelectedItem): string {
  return entry.source === 'bunker'
    ? `bunker:${entry.item_id}`
    : `${entry.player_id}:${entry.source}:${entry.item_id}`;
}

export function getPlayerItemOptions(activePlayers: Player[]): ItemOption[] {
  return activePlayers.flatMap(p => {
    const items: ItemOption[] = [];
    if (p.attributes.inventory) {
      items.push({
        entry: { player_id: p.id, item_id: String(p.attributes.inventory.value.id), source: 'inventory' },
        label: p.attributes.inventory.display,
        owner: p.name,
      });
    }
    p.attributes.backpack?.value.forEach(item => {
      items.push({
        entry: { player_id: p.id, item_id: item.id, source: 'backpack' },
        label: item.quantity > 1 ? `${item.label} (${item.quantity} шт)` : item.label,
        owner: p.name,
      });
    });
    return items;
  });
}

export function getBunkerItemOptions(bunker: BunkerInfo | null): ItemOption[] {
  return bunker?.items.map(item => ({
    entry: { item_id: item.id, source: 'bunker' as const },
    label: item.label,
    owner: 'Бункер',
  })) ?? [];
}

export function ChanceBar({ chance }: { chance: number }) {
  const color = chance >= 90 ? 'bg-green-500' : chance >= 75 ? 'bg-yellow-500' : chance >= 30 ? 'bg-orange-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 bg-zinc-800 rounded-full h-2 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-300 ${color}`} style={{ width: `${chance}%` }} />
      </div>
      <span className={`text-xs font-mono font-bold w-10 text-right ${
        chance >= 90 ? 'text-green-400' : chance >= 75 ? 'text-yellow-400' : chance >= 30 ? 'text-orange-400' : 'text-red-400'
      }`}>{chance}%</span>
    </div>
  );
}

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
