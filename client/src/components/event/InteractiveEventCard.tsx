import { AlertTriangle, Send, Users, CheckCircle, XCircle } from 'lucide-react';
import type { BunkerInfo, GameEvent, Player, ClientMessage, SelectedItem, PackSettings, EventSelection } from '../../types/game';
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
import EventSelectableRow from './EventSelectableRow';

interface Props {
  event: GameEvent;
  activePlayers: Player[];
  bunker: BunkerInfo | null;
  packSettings: PackSettings;
  eventSelection: EventSelection;
  choiceVotes: Record<string, 'success' | 'failure'>;
  myPlayerId: string;
  send: (msg: ClientMessage) => void;
}

function VoterDots({ voters, activePlayers }: { voters: string[]; activePlayers: Player[] }) {
  if (voters.length === 0) return null;
  return (
    <div className="flex gap-1 flex-wrap mt-1.5">
      {voters.map(id => {
        const p = activePlayers.find(p => p.id === id);
        if (!p) return null;
        return (
          <span key={id} className="w-5 h-5 rounded-full bg-zinc-700 border border-zinc-600 flex items-center justify-center text-[10px] font-bold text-zinc-300" title={p.name}>
            {p.name.charAt(0).toUpperCase()}
          </span>
        );
      })}
    </div>
  );
}

function ChoiceEventCard({
  event,
  activePlayers,
  choiceVotes,
  myPlayerId,
  send,
}: {
  event: GameEvent;
  activePlayers: Player[];
  choiceVotes: Record<string, 'success' | 'failure'>;
  myPlayerId: string;
  send: (msg: ClientMessage) => void;
}) {
  const successEffects = event.success_effects ?? (event.success_effect ? [event.success_effect] : []);
  const failureEffects = event.failure_effects ?? (event.failure_effect ? [event.failure_effect] : []);
  const labels = event.choice_labels!;

  const myVote = choiceVotes[myPlayerId] ?? null;
  const successVoters = Object.entries(choiceVotes).filter(([, v]) => v === 'success').map(([id]) => id);
  const failureVoters = Object.entries(choiceVotes).filter(([, v]) => v === 'failure').map(([id]) => id);
  const totalActive = activePlayers.length;
  const totalVoted = Object.keys(choiceVotes).length;
  const allVoted = totalVoted >= totalActive;

  const castVote = (vote: 'success' | 'failure') => {
    send({ type: 'cast_choice_vote', vote });
  };

  const confirm = (outcome: 'success' | 'failure') => {
    send({ type: 'resolve_event', selected_professions: [], selected_items: [], forced_outcome: outcome });
  };

  const confirmOutcome: 'success' | 'failure' = failureVoters.length > successVoters.length ? 'failure' : 'success';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm animate-fade-in-up overflow-y-auto py-6">
      <div className="bg-zinc-900 border border-zinc-700/50 rounded-2xl shadow-2xl max-w-lg w-full mx-4 flex flex-col">
        <div className="p-5 border-b border-zinc-800">
          <div className="flex items-start gap-3">
            <AlertTriangle size={22} className="text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h2 className="text-zinc-100 font-bold text-lg">{renderEventText(event.title)}</h2>
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

        <div className="p-5 grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <OutcomePreview label={labels.success} effects={successEffects} tone="good" />
            <VoterDots voters={successVoters} activePlayers={activePlayers} />
          </div>
          <div className="flex flex-col gap-1.5">
            <OutcomePreview label={labels.failure} effects={failureEffects} tone="bad" />
            <VoterDots voters={failureVoters} activePlayers={activePlayers} />
          </div>
        </div>

        {totalVoted > 0 && (
          <div className="px-5 pb-2 text-xs text-zinc-500 text-center">
            Проголосовали {totalVoted} из {totalActive}
          </div>
        )}

        <div className="p-5 pt-0 flex flex-col gap-2">
          <div className="flex gap-3">
            <button
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors flex items-center justify-center gap-2 ${
                myVote === 'success'
                  ? 'bg-green-800/60 border-green-600/60 text-green-200'
                  : 'bg-green-900/20 border-green-800/30 text-green-400 hover:bg-green-900/40'
              }`}
              onClick={() => castVote('success')}
            >
              <CheckCircle size={15} /> {labels.success}
            </button>
            <button
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors flex items-center justify-center gap-2 ${
                myVote === 'failure'
                  ? 'bg-red-800/50 border-red-600/50 text-red-200'
                  : 'bg-red-900/20 border-red-800/30 text-red-400 hover:bg-red-900/40'
              }`}
              onClick={() => castVote('failure')}
            >
              <XCircle size={15} /> {labels.failure}
            </button>
          </div>

          {allVoted && (
            <button
              className="w-full py-2 rounded-xl text-sm font-semibold btn-primary text-white flex items-center justify-center gap-2"
              onClick={() => confirm(confirmOutcome)}
            >
              <Send size={13} /> Подтвердить решение ({confirmOutcome === 'success' ? labels.success : labels.failure})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function InteractiveEventCard({ event, activePlayers, bunker, packSettings, eventSelection, choiceVotes, myPlayerId, send }: Props) {
  if (event.choice_labels) {
    return <ChoiceEventCard event={event} activePlayers={activePlayers} choiceVotes={choiceVotes} myPlayerId={myPlayerId} send={send} />;
  }

  const selectedProfessions = eventSelection.selected_professions;
  const selectedItems = eventSelection.selected_items;
  const playerItems = getPlayerItemOptions(activePlayers);
  const bunkerItems = getBunkerItemOptions(bunker);

  const pushSelection = (nextProfessions: string[], nextItems: SelectedItem[]) => {
    send({ type: 'update_event_selection', selected_professions: nextProfessions, selected_items: nextItems });
  };

  const toggleProfession = (playerId: string) => {
    const nextProfessions = selectedProfessions.includes(playerId)
      ? selectedProfessions.filter(p => p !== playerId)
      : [...selectedProfessions, playerId];
    pushSelection(nextProfessions, selectedItems);
  };

  const toggleItem = (entry: SelectedItem) => {
    const key = getItemKey(entry);
    const exists = selectedItems.some(i => getItemKey(i) === key);
    const nextItems = exists ? selectedItems.filter(i => getItemKey(i) !== key) : [...selectedItems, entry];
    pushSelection(selectedProfessions, nextItems);
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
            <OutcomePreview label="При успехе" effects={event.success_effects ?? (event.success_effect ? [event.success_effect] : [])} tone="good" />
            <OutcomePreview label="При провале" effects={event.failure_effects ?? (event.failure_effect ? [event.failure_effect] : [])} tone="bad" />
          </div>

          <div>
            <p className="text-zinc-500 text-xs uppercase tracking-widest mb-2">Профессии выживших</p>
            <div className="flex flex-col gap-1">
              {activePlayers.map(p => {
                if (!p.attributes.profession) return null;
                const selected = selectedProfessions.includes(p.id);
                return (
                  <EventSelectableRow
                    key={p.id}
                    selected={selected}
                    onToggle={() => toggleProfession(p.id)}
                    primary={p.attributes.profession.display}
                    secondary={p.name}
                    ariaLabel={`Выбрать профессию ${p.attributes.profession.display}`}
                  />
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
