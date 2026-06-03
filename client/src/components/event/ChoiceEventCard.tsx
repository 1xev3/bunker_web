import { AlertTriangle, Users, UserRound } from 'lucide-react';
import type { BunkerInfo, GameEvent, Player, ClientMessage, SelectedItem, EventSelection } from '../../types/game';
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
  eventSelection: EventSelection;
  choiceVotes: Record<string, string>;
  myPlayerId: string;
  send: (msg: ClientMessage) => void;
  disabled?: boolean;
}

function VoterDots({ voters, activePlayers }: { voters: Player[]; activePlayers: Player[] }) {
  if (voters.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {voters.map(p => (
        <span
          key={p.id}
          title={p.name}
          className="flex h-4 w-4 items-center justify-center rounded-full border border-amber-600/40 bg-amber-900/60 text-[9px] font-bold text-amber-200"
        >
          {p.name.charAt(0).toUpperCase()}
        </span>
      ))}
      <span className="text-[10px] text-zinc-500">/ {activePlayers.length}</span>
    </div>
  );
}

export default function ChoiceEventCard({ event, activePlayers, bunker, eventSelection, choiceVotes, myPlayerId, send, disabled = false }: Props) {
  const options = event.options ?? [];
  const myVote = choiceVotes[myPlayerId] ?? null;
  const totalVoted = Object.keys(choiceVotes).length;

  const selectKind = event.select?.kind;
  const selectedPlayerId = eventSelection.selected_player_id;
  const selectedItems = eventSelection.selected_items;

  const pushSelection = (nextPlayerId: string | null, nextItems: SelectedItem[]) => {
    send({ type: 'update_event_selection', selected_player_id: nextPlayerId, selected_professions: [], selected_items: nextItems });
  };

  const selectPlayer = (playerId: string) => {
    pushSelection(selectedPlayerId === playerId ? null : playerId, selectedItems);
  };

  const toggleItem = (entry: SelectedItem) => {
    const key = getItemKey(entry);
    const exists = selectedItems.some(i => getItemKey(i) === key);
    const nextItems = exists ? selectedItems.filter(i => getItemKey(i) !== key) : [...selectedItems, entry];
    pushSelection(selectedPlayerId, nextItems);
  };
  const isItemSelected = (entry: SelectedItem) => selectedItems.some(i => getItemKey(i) === getItemKey(entry));

  const castVote = (optionId: string) => send({ type: 'cast_choice_vote', option_id: optionId });

  const needsPlayer = selectKind === 'player' && !selectedPlayerId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 py-6 backdrop-blur-sm animate-fade-in-up">
      <div className="mx-4 flex w-full max-w-lg flex-col rounded-2xl border border-amber-900/40 bg-zinc-900 shadow-2xl">
        <div className="border-b border-zinc-800 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={22} className="mt-0.5 shrink-0 text-amber-400" />
            <div className="flex-1">
              <h2 className="text-lg font-bold text-zinc-100">{renderEventText(event.title)}</h2>
              <p className="mt-1 text-sm leading-relaxed text-zinc-400">{renderEventText(event.description)}</p>
            </div>
          </div>
          {event.participants && event.participants.length > 0 && (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-zinc-800/60 px-3 py-2">
              <Users size={13} className="shrink-0 text-zinc-500" />
              <span className="text-sm text-zinc-400">{event.participants.join(', ')}</span>
            </div>
          )}
        </div>

        <div className="flex max-h-[55vh] flex-col gap-4 overflow-y-auto p-5">
          {selectKind === 'player' && (
            <div>
              <p className="mb-2 text-xs uppercase tracking-widest text-zinc-500">{event.select?.prompt || 'Выберите человека'}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {activePlayers.map(p => {
                  const selected = selectedPlayerId === p.id;
                  const health = p.vital_status?.health ?? 100;
                  const sanity = p.vital_status?.sanity ?? 100;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => selectPlayer(p.id)}
                      disabled={disabled}
                      className={`rounded-xl border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                        selected ? 'border-amber-500/70 bg-amber-950/30 text-amber-100' : 'border-zinc-800 bg-zinc-950/70 text-zinc-300 hover:border-zinc-700'
                      }`}
                    >
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        <UserRound size={14} className={selected ? 'text-amber-300' : 'text-zinc-500'} />
                        {p.name}
                      </span>
                      <span className="mt-1 block text-xs text-zinc-500">здоровье {health} · рассудок {sanity}</span>
                    </button>
                  );
                })}
              </div>
              {needsPlayer && <p className="mt-2 text-xs text-orange-400">Сначала выберите человека.</p>}
            </div>
          )}

          {selectKind === 'item' && (
            <div>
              <p className="mb-2 text-xs uppercase tracking-widest text-zinc-500">{event.select?.prompt || 'Выберите предмет'}</p>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs text-zinc-600">Выжившие</p>
                  <SelectableItemList items={getPlayerItemOptions(activePlayers)} isItemSelected={isItemSelected} toggleItem={toggleItem} disabled={disabled} />
                </div>
                <div>
                  <p className="mb-2 text-xs text-zinc-600">Бункер</p>
                  <SelectableItemList items={getBunkerItemOptions(bunker)} isItemSelected={isItemSelected} toggleItem={toggleItem} disabled={disabled} />
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-widest text-zinc-500">Решение совета</p>
            {options.map(option => {
              const voters = Object.entries(choiceVotes).filter(([, o]) => o === option.id).map(([id]) => activePlayers.find(p => p.id === id)).filter((p): p is Player => Boolean(p));
              const mine = myVote === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => castVote(option.id)}
                  disabled={disabled}
                  className={`rounded-xl border px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    mine ? 'border-amber-500/70 bg-amber-950/30' : 'border-zinc-800 bg-zinc-950/70 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className={`text-sm font-semibold ${mine ? 'text-amber-200' : 'text-zinc-200'}`}>{option.label}</span>
                    <VoterDots voters={voters} activePlayers={activePlayers} />
                  </div>
                  {option.description && <p className="mt-1 text-xs leading-relaxed text-zinc-500">{option.description}</p>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-t border-zinc-800 p-5">
          <p className="text-center text-xs text-zinc-500">
            {disabled
              ? 'Соединение восстанавливается. Голосование временно заблокировано.'
              : `Проголосовало ${totalVoted} из ${activePlayers.length}. Решение примут, когда выскажутся все.`}
          </p>
        </div>
      </div>
    </div>
  );
}
