import { useState } from 'react';
import { AlertTriangle, Send, Sparkles, Users } from 'lucide-react';
import type { GameEvent, Player, ClientMessage, SelectedItem } from '../types/game';

interface Props {
  event: GameEvent;
  activePlayers: Player[];
  send: (msg: ClientMessage) => void;
}

function parseBackpackItems(backpack: string | null): string[] {
  if (!backpack) return [];
  return backpack.split(', ').map(part => {
    const match = part.match(/^(.+)\s+\(\d+ шт\)$/);
    return match ? match[1] : part;
  }).filter(Boolean);
}

function getSuccessChance(resourceCount: number, baseChance: number): number {
  if (resourceCount === 0) return Math.round(baseChance * 100);
  if (resourceCount === 1) return 75;
  if (resourceCount === 2) return 90;
  return 100;
}

function ChanceBar({ chance }: { chance: number }) {
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

function PassiveEventCard({ event }: { event: GameEvent }) {
  const isPositive = (event.success_effect?.value ?? 0) >= 0;
  const value = event.success_effect?.value ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in-up">
      <div className={`bg-zinc-900 border rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-6 flex flex-col gap-4 ${
        isPositive ? 'border-amber-700/40' : 'border-zinc-700/40'
      }`}>
        <div className="flex items-start gap-3">
          <Sparkles size={20} className={isPositive ? 'text-amber-400 shrink-0 mt-0.5' : 'text-zinc-500 shrink-0 mt-0.5'} />
          <div>
            <h2 className={`font-bold text-lg ${isPositive ? 'text-amber-300' : 'text-zinc-300'}`}>{event.title}</h2>
            <p className="text-zinc-400 text-sm mt-1 leading-relaxed">{event.description}</p>
          </div>
        </div>

        {event.participants && event.participants.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800/60">
            <Users size={13} className="text-zinc-500 shrink-0" />
            <span className="text-zinc-400 text-sm">{event.participants.join(', ')}</span>
          </div>
        )}

        <div className={`text-center text-sm font-semibold rounded-lg py-2 ${
          isPositive
            ? 'text-green-400 bg-green-950/30 border border-green-900/30'
            : 'text-red-400 bg-red-950/30 border border-red-900/30'
        }`}>
          {value > 0 ? '+' : ''}{value}% к шансу выживания
        </div>

        <p className="text-zinc-600 text-xs text-center">Разрешается автоматически…</p>
      </div>
    </div>
  );
}

export default function EventModal({ event, activePlayers, send }: Props) {
  const [selectedProfessions, setSelectedProfessions] = useState<string[]>([]);
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);

  if (event.event_type === 'passive') {
    return <PassiveEventCard event={event} />;
  }

  const toggleProfession = (profession: string) => {
    setSelectedProfessions(prev =>
      prev.includes(profession) ? prev.filter(p => p !== profession) : [...prev, profession]
    );
  };

  const toggleItem = (entry: SelectedItem) => {
    const key = `${entry.player_id}:${entry.source}:${entry.item}`;
    setSelectedItems(prev => {
      const exists = prev.some(i => `${i.player_id}:${i.source}:${i.item}` === key);
      return exists ? prev.filter(i => `${i.player_id}:${i.source}:${i.item}` !== key) : [...prev, entry];
    });
  };

  const isItemSelected = (entry: SelectedItem) =>
    selectedItems.some(i => i.player_id === entry.player_id && i.source === entry.source && i.item === entry.item);

  const resourceCount = selectedProfessions.length + selectedItems.length;
  const successChance = getSuccessChance(resourceCount, event.base_chance ?? 0.1);

  const handleSend = () => {
    send({ type: 'resolve_event', selected_professions: selectedProfessions, selected_items: selectedItems });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm animate-fade-in-up overflow-y-auto py-6">
      <div className="bg-zinc-900 border border-red-900/40 rounded-2xl shadow-2xl max-w-lg w-full mx-4 flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-zinc-800">
          <div className="flex items-start gap-3">
            <AlertTriangle size={22} className="text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h2 className="text-red-300 font-bold text-lg">{event.title}</h2>
              <p className="text-zinc-400 text-sm mt-1 leading-relaxed">{event.description}</p>
            </div>
          </div>
        </div>

        <div className="p-5 flex flex-col gap-4 overflow-y-auto max-h-[55vh]">
          {/* Professions */}
          <div>
            <p className="text-zinc-500 text-xs uppercase tracking-widest mb-2">Профессии выживших</p>
            <div className="flex flex-col gap-1">
              {activePlayers.map(p => {
                if (!p.attributes.profession) return null;
                const profName = p.attributes.profession.split(' (')[0];
                const selected = selectedProfessions.includes(profName);
                return (
                  <label key={p.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                    selected ? 'bg-amber-950/30 border border-amber-700/40' : 'bg-zinc-800/50 border border-transparent hover:bg-zinc-800'
                  }`}>
                    <input type="checkbox" className="accent-amber-500" checked={selected} onChange={() => toggleProfession(profName)} />
                    <span className="text-zinc-300 text-sm flex-1">{p.attributes.profession}</span>
                    <span className="text-zinc-500 text-xs">{p.name}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Items */}
          <div>
            <p className="text-zinc-500 text-xs uppercase tracking-widest mb-2">Предметы</p>
            <div className="flex flex-col gap-1">
              {activePlayers.flatMap(p => {
                const items: { entry: SelectedItem; label: string; owner: string }[] = [];
                if (p.attributes.inventory) {
                  items.push({
                    entry: { player_id: p.id, item: p.attributes.inventory, source: 'inventory' },
                    label: p.attributes.inventory,
                    owner: p.name,
                  });
                }
                parseBackpackItems(p.attributes.backpack).forEach(item => {
                  items.push({
                    entry: { player_id: p.id, item, source: 'backpack' },
                    label: item,
                    owner: p.name,
                  });
                });
                return items;
              }).map(({ entry, label, owner }) => {
                const selected = isItemSelected(entry);
                const key = `${entry.player_id}:${entry.source}:${entry.item}`;
                return (
                  <label key={key} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                    selected ? 'bg-amber-950/30 border border-amber-700/40' : 'bg-zinc-800/50 border border-transparent hover:bg-zinc-800'
                  }`}>
                    <input type="checkbox" className="accent-amber-500" checked={selected} onChange={() => toggleItem(entry)} />
                    <span className="text-zinc-300 text-sm flex-1">{label}</span>
                    <span className="text-zinc-500 text-xs">{owner} · {entry.source === 'inventory' ? 'инвентарь' : 'рюкзак'}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer with chance bar + button */}
        <div className="p-5 border-t border-zinc-800 flex flex-col gap-3">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-zinc-500 text-xs uppercase tracking-widest">Шанс успеха</span>
              {resourceCount > 0 && (
                <span className="text-zinc-600 text-xs">{resourceCount} {resourceCount === 1 ? 'ресурс' : resourceCount < 5 ? 'ресурса' : 'ресурсов'} выбрано</span>
              )}
            </div>
            <ChanceBar chance={successChance} />
          </div>
          <button
            className="w-full py-2.5 rounded-xl text-sm font-semibold btn-primary text-white flex items-center justify-center gap-2"
            onClick={handleSend}
          >
            <Send size={14} /> Принять решение
          </button>
        </div>
      </div>
    </div>
  );
}
