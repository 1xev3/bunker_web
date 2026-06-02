import { useState } from 'react';
import { Send, Utensils } from 'lucide-react';
import type { BunkerInfo, GameEvent, Player, ClientMessage, SelectedItem, PackSettings } from '../../types/game';
import {
  renderEventText,
  getItemKey,
  getPlayerItemOptions,
  getBunkerItemOptions,
  SelectableItemList,
} from './eventUtils';

interface Props {
  event: GameEvent;
  activePlayers: Player[];
  bunker: BunkerInfo | null;
  packSettings: PackSettings;
  send: (msg: ClientMessage) => void;
}

export default function FoodReplenishCard({ event, activePlayers, bunker, packSettings, send }: Props) {
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
  const projectedFoodPercent = Math.round(packSettings.events.food_replenish.ratio_per_resource * resourceCount * 100);

  const handleSend = () => {
    send({ type: 'resolve_event', selected_professions: selectedProfessions, selected_items: selectedItems });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm animate-fade-in-up overflow-y-auto py-6">
      <div className="bg-zinc-900 border border-orange-900/50 rounded-2xl shadow-2xl max-w-3xl w-full mx-4 flex flex-col">
        <div className="p-5 border-b border-zinc-800">
          <div className="flex items-start gap-3">
            <Utensils size={22} className="text-orange-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h2 className="text-orange-300 font-bold text-lg">{renderEventText(event.title)}</h2>
              <p className="text-zinc-400 text-sm mt-1 leading-relaxed">{renderEventText(event.description)}</p>
            </div>
          </div>
        </div>

        <div className="p-5 flex flex-col gap-4 overflow-y-auto max-h-[55vh]">
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
          <div className="grid gap-2 sm:grid-cols-2">
            <div className={`rounded-xl border px-3 py-2 ${
              resourceCount > 0
                ? 'border-green-900/40 bg-green-950/20 text-green-300'
                : 'border-zinc-700/50 bg-zinc-800/60 text-zinc-300'
            }`}>
              <p className="text-[11px] uppercase tracking-widest opacity-70">Если помочь</p>
              <p className="mt-1 text-sm font-semibold">
                {resourceCount > 0
                  ? `Примерно +${projectedFoodPercent}% от срока запасов еды`
                  : 'Нужно выбрать хотя бы один ресурс'}
              </p>
            </div>
            <div className="rounded-xl border border-red-900/40 bg-red-950/20 px-3 py-2 text-red-300">
              <p className="text-[11px] uppercase tracking-widest opacity-70">Если не помочь</p>
              <p className="mt-1 text-sm font-semibold">Через месяц бункер погибнет от голода</p>
            </div>
          </div>
          {resourceCount === 0 && (
            <p className="text-orange-400/70 text-xs text-center">
              Если ничего не выбрать — следующий месяц станет последним
            </p>
          )}
          {resourceCount > 0 && (
            <p className="text-green-400/70 text-xs text-center">
              {resourceCount} {resourceCount === 1 ? 'ресурс' : resourceCount < 5 ? 'ресурса' : 'ресурсов'} — восполним ~{projectedFoodPercent}% срока
            </p>
          )}
          <button
            className="w-full py-2.5 rounded-xl text-sm font-semibold btn-primary text-white flex items-center justify-center gap-2"
            onClick={handleSend}
          >
            <Send size={14} /> {resourceCount === 0 ? 'Нечем помочь' : 'Пополнить запасы'}
          </button>
        </div>
      </div>
    </div>
  );
}
