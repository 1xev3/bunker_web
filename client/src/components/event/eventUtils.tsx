import { Fragment } from 'react';
import { TrendingUp, TrendingDown, Skull, Utensils, Baby, DoorOpen, Calendar, type LucideIcon } from 'lucide-react';
import type { BunkerInfo, EventEffect, Player, SelectedItem, PackSettings } from '../../types/game';
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

export function formatEffectLabel(effect: EventEffect): string {
  if (effect.type === 'survival_change') {
    if (!effect.value) return 'Шанс выживания без изменений';
    return `${effect.value > 0 ? '+' : ''}${effect.value}% к шансу выживания`;
  }
  if (effect.type === 'food_change') {
    if (!effect.value) return 'Запасы еды без изменений';
    if (effect.value < 0) return `-${Math.abs(effect.value)}% от запасов еды`;
    return `${effect.value > 0 ? '+' : ''}${effect.value} еды`;
  }
  if (effect.type === 'kill_random_active') return 'Случайный выживший погибнет';
  if (effect.type === 'kill_participant') {
    if (effect.target === 'participant1') return 'Первый участник погибнет';
    if (effect.target === 'participant2') return 'Второй участник погибнет';
    if (effect.target === 'each_participant') return 'У каждого участника свой шанс погибнуть';
    return 'Кто-то из участников погибнет';
  }
  if (effect.type === 'add_player') return 'Новый выживший присоединится к бункеру';
  if (effect.type === 'remove_room') return 'Одна комната бункера разрушится';
  if (effect.type === 'add_room') return 'Бункер получит новую комнату';
  if (effect.type === 'schedule_event') return 'Последствия проявятся позже';
  return '';
}

export function getEffectMeta(effect: EventEffect): { Icon: LucideIcon | null; colorClass: string } {
  if (effect.type === 'survival_change') {
    const positive = (effect.value ?? 0) >= 0;
    return { Icon: positive ? TrendingUp : TrendingDown, colorClass: positive ? 'text-green-400' : 'text-red-400' };
  }
  if (effect.type === 'food_change') {
    const positive = (effect.value ?? 0) >= 0;
    return { Icon: Utensils, colorClass: positive ? 'text-amber-400' : 'text-orange-400' };
  }
  if (effect.type === 'kill_random_active' || effect.type === 'kill_participant') {
    return { Icon: Skull, colorClass: 'text-red-400' };
  }
  if (effect.type === 'add_player') {
    return { Icon: Baby, colorClass: 'text-blue-400' };
  }
  if (effect.type === 'remove_room') {
    return { Icon: DoorOpen, colorClass: 'text-orange-400' };
  }
  if (effect.type === 'add_room') {
    return { Icon: DoorOpen, colorClass: 'text-emerald-400' };
  }
  if (effect.type === 'schedule_event') {
    return { Icon: Calendar, colorClass: 'text-zinc-500' };
  }
  return { Icon: null, colorClass: 'text-zinc-400' };
}

export function EffectLine({ effect, className }: { effect: EventEffect; className?: string }) {
  const { Icon, colorClass } = getEffectMeta(effect);
  const label = formatEffectLabel(effect);
  if (!label) return null;
  const chanceParts = [];
  if (effect.chance != null && effect.chance < 1) {
    chanceParts.push(`${Math.round(effect.chance * 100)}% на эффект`);
  }
  if (effect.per_target_chance != null && effect.per_target_chance < 1) {
    chanceParts.push(`${Math.round(effect.per_target_chance * 100)}% на каждого`);
  }
  const chanceLabel = chanceParts.length > 0 ? chanceParts.join(' · ') : null;
  return (
    <div className={`flex items-center gap-1.5 ${className ?? ''}`}>
      {Icon && <Icon size={12} className={`shrink-0 ${colorClass}`} />}
      <span className="text-sm font-semibold">{label}</span>
      {chanceLabel && (
        <span className="text-xs text-zinc-500 font-normal">· {chanceLabel}</span>
      )}
    </div>
  );
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

export function OutcomePreview({
  label,
  effects,
  tone,
}: {
  label: string;
  effects: EventEffect[];
  tone: 'good' | 'bad' | 'neutral';
}) {
  const toneClass = tone === 'good'
    ? 'border-green-900/40 bg-green-950/20 text-green-300'
    : tone === 'bad'
      ? 'border-red-900/40 bg-red-950/20 text-red-300'
      : 'border-zinc-700/50 bg-zinc-800/60 text-zinc-300';

  const visible = effects.filter(e => formatEffectLabel(e));

  return (
    <div className={`rounded-xl border px-3 py-2 ${toneClass}`}>
      <p className="text-[11px] uppercase tracking-widest opacity-70 mb-1">{label}</p>
      {visible.length === 0 ? (
        <p className="text-sm font-semibold">Без изменений</p>
      ) : (
        <div className="flex flex-col gap-0.5">
          {visible.map((effect, i) => (
            <EffectLine key={i} effect={effect} />
          ))}
        </div>
      )}
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
