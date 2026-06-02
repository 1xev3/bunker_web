import { useState } from 'react';
import { AlertTriangle, Send, XCircle } from 'lucide-react';
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

export default function EventModal({ event, activePlayers, send }: Props) {
  const [selectedProfessions, setSelectedProfessions] = useState<string[]>([]);
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);

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

  const handleSend = () => {
    send({ type: 'resolve_event', selected_professions: selectedProfessions, selected_items: selectedItems });
  };

  const handleNothing = () => {
    send({ type: 'resolve_event', selected_professions: [], selected_items: [] });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm animate-fade-in-up overflow-y-auto py-6">
      <div className="bg-zinc-900 border border-red-900/40 rounded-2xl shadow-2xl max-w-lg w-full mx-4 flex flex-col gap-0">
        {/* Header */}
        <div className="p-5 border-b border-zinc-800">
          <div className="flex items-start gap-3">
            <AlertTriangle size={22} className="text-red-400 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-red-300 font-bold text-lg">{event.title}</h2>
              <p className="text-zinc-400 text-sm mt-1 leading-relaxed">{event.description}</p>
            </div>
          </div>
        </div>

        <div className="p-5 flex flex-col gap-4 overflow-y-auto max-h-[60vh]">
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
                    <input
                      type="checkbox"
                      className="accent-amber-500"
                      checked={selected}
                      onChange={() => toggleProfession(profName)}
                    />
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
                    <input
                      type="checkbox"
                      className="accent-amber-500"
                      checked={selected}
                      onChange={() => toggleItem(entry)}
                    />
                    <span className="text-zinc-300 text-sm flex-1">{label}</span>
                    <span className="text-zinc-500 text-xs">{owner} · {entry.source === 'inventory' ? 'инвентарь' : 'рюкзак'}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-5 border-t border-zinc-800 flex gap-3">
          <button
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold btn-primary text-white flex items-center justify-center gap-2"
            onClick={handleSend}
          >
            <Send size={14} /> Применить выбранное
          </button>
          <button
            className="px-4 py-2.5 rounded-xl text-sm border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 hover:bg-zinc-700/60 transition-all flex items-center gap-2"
            onClick={handleNothing}
          >
            <XCircle size={14} /> Ничего подходящего
          </button>
        </div>
      </div>
    </div>
  );
}
