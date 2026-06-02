import { useState } from 'react';
import { AlertTriangle, Send, Users } from 'lucide-react';
import type { BunkerInfo, GameEvent, Player, ClientMessage, SelectedItem, PackSettings } from '../../types/game';
import {
  renderEventText,
  getItemKey,
  getPlayerItemOptions,
  getBunkerItemOptions,
  getSuccessChance,
  ChanceBar,
  OutcomePreview,
  SelectableItemList,
} from './eventUtils';

interface Props {
  event: GameEvent;
  activePlayers: Player[];
  bunker: BunkerInfo | null;
  packSettings: PackSettings;
  send: (msg: ClientMessage) => void;
}

export default function InteractiveEventCard({ event, activePlayers, bunker, packSettings, send }: Props) {
  const [selectedProfessions, setSelectedProfessions] = useState<string[]>([]);
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const playerItems = getPlayerItemOptions(activePlayers);
  const bunkerItems = getBunkerItemOptions(bunker);

  const toggleProfession = (profession: string) => {
    setSelectedProfessions(prev =>
      prev.includes(profession) ? prev.filter(p => p !== profession) : [...prev, profession]
    );
  };

  const toggleItem = (entry: SelectedItem) => {
    const key = getItemKey(entry);
    setSelectedItems(prev => {
      const exists = prev.some(i => getItemKey(i) === key);
      return exists ? prev.filter(i => getItemKey(i) !== key) : [...prev, entry];
    });
  };

  const isItemSelected = (entry: SelectedItem) =>
    selectedItems.some(i => getItemKey(i) === getItemKey(entry));

  const resourceCount = selectedProfessions.length + selectedItems.length;
  const successChance = getSuccessChance(resourceCount, event.base_chance ?? 0.1, packSettings);

  const handleSend = () => {
    send({ type: 'resolve_event', selected_professions: selectedProfessions, selected_items: selectedItems });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm animate-fade-in-up overflow-y-auto py-6">
      <div className="bg-zinc-900 border border-red-900/40 rounded-2xl shadow-2xl max-w-3xl w-full mx-4 flex flex-col">
        <div className="p-5 border-b border-zinc-800">
          <div className="flex items-start gap-3">
            <AlertTriangle size={22} className="text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h2 className="text-red-300 font-bold text-lg">{renderEventText(event.title)}</h2>
              <p className="text-zinc-400 text-sm mt-1 leading-relaxed">{renderEventText(event.description)}</p>
            </div>
          </div>
          {event.participants && event.participants.length > 0 && (
            <div className="flex items-center gap-2 mt-4 px-3 py-2 rounded-lg bg-zinc-800/60">
              <Users size={13} className="text-zinc-500 shrink-0" />
              <span className="text-zinc-400 text-sm">{event.participants.join(', ')}</span>
            </div>
          )}
        </div>

        <div className="p-5 flex flex-col gap-4 overflow-y-auto max-h-[55vh]">
          <div className="grid gap-2 sm:grid-cols-2">
            <OutcomePreview label="При успехе" effect={event.success_effect} tone="good" />
            <OutcomePreview label="При провале" effect={event.failure_effect} tone="bad" />
          </div>

          <div>
            <p className="text-zinc-500 text-xs uppercase tracking-widest mb-2">Профессии выживших</p>
            <div className="flex flex-col gap-1">
              {activePlayers.map(p => {
                if (!p.attributes.profession) return null;
                const profId = String(p.attributes.profession.value.id);
                const selected = selectedProfessions.includes(profId);
                return (
                  <label key={p.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors border ${
                    selected ? 'event-selected' : 'border-transparent bg-zinc-800/50 hover:bg-zinc-800'
                  }`}>
                    <input type="checkbox" className="accent-[var(--accent)]" checked={selected} onChange={() => toggleProfession(profId)} />
                    <span className="text-zinc-300 text-sm flex-1">{p.attributes.profession.display}</span>
                    <span className="text-zinc-500 text-xs">{p.name}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-zinc-500 text-xs uppercase tracking-widest mb-2">Предметы</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-zinc-600 text-xs mb-2">Выжившие</p>
                <SelectableItemList items={playerItems} isItemSelected={isItemSelected} toggleItem={toggleItem} />
              </div>
              <div>
                <p className="text-zinc-600 text-xs mb-2">Бункер</p>
                <SelectableItemList items={bunkerItems} isItemSelected={isItemSelected} toggleItem={toggleItem} />
              </div>
            </div>
          </div>
        </div>

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
