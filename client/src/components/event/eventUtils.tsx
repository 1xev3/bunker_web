import { Fragment, type ReactNode } from 'react';
import type { BunkerInfo, Player, SelectedItem } from '../../types/game';

export interface ItemOption {
  entry: SelectedItem;
  label: string;
  owner: string;
}

const EVENT_HIGHLIGHT_SEGMENT_RE = /<<event-highlight>>([\s\S]*?)<<\/event-highlight>>/g;

export interface HighlightSegment {
  text: string;
  highlighted: boolean;
}

// Splits a marker-annotated string into plain / accent-colored segments.
export function parseHighlightSegments(text: string): HighlightSegment[] {
  const segments: HighlightSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  EVENT_HIGHLIGHT_SEGMENT_RE.lastIndex = 0;
  while ((match = EVENT_HIGHLIGHT_SEGMENT_RE.exec(text)) !== null) {
    if (match.index > lastIndex) segments.push({ text: text.slice(lastIndex, match.index), highlighted: false });
    segments.push({ text: match[1], highlighted: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) segments.push({ text: text.slice(lastIndex), highlighted: false });
  return segments;
}

// Total visible characters once markers are stripped (for the typewriter).
export function highlightVisibleLength(text: string): number {
  return parseHighlightSegments(text).reduce((sum, seg) => sum + seg.text.length, 0);
}

// Renders segments as JSX, optionally limited to the first `limit` visible
// characters so a typewriter can reveal accent-colored text progressively.
export function renderHighlightSegments(segments: HighlightSegment[], limit = Infinity) {
  let remaining = limit;
  const nodes: ReactNode[] = [];
  segments.forEach((seg, index) => {
    if (remaining <= 0) return;
    const slice = seg.text.slice(0, remaining);
    if (!slice) return;
    remaining -= slice.length;
    nodes.push(seg.highlighted
      ? <span key={index} className="event-text-highlight">{slice}</span>
      : <Fragment key={index}>{slice}</Fragment>);
  });
  return nodes;
}

export function renderEventText(text: string) {
  return renderHighlightSegments(parseHighlightSegments(text));
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
