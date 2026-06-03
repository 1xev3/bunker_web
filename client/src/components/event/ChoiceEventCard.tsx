import { AlertTriangle, Users, UserRound } from 'lucide-react';
import type { BunkerInfo, GameEvent, Player, ClientMessage, SelectedItem, EventSelection, EventOption, OutcomeOdds } from '../../types/game';
import {
  renderEventText,
  getItemKey,
  getPlayerItemOptions,
  getBunkerItemOptions,
  SelectableItemList,
} from './eventUtils';
import EventSelectableRow from './EventSelectableRow';

interface Props {
  event: GameEvent;
  activePlayers: Player[];
  bunker: BunkerInfo | null;
  eventSelection: EventSelection;
  choiceVotes: Record<string, string>;
  choicePendingSelection: string | null;
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

const TONE_BAR: Record<OutcomeOdds['tone'], string> = {
  good: 'bg-emerald-500',
  bad: 'bg-red-500',
  neutral: 'bg-zinc-500',
};
const TONE_TEXT: Record<OutcomeOdds['tone'], string> = {
  good: 'text-emerald-300',
  bad: 'text-red-300',
  neutral: 'text-zinc-400',
};
const TONE_LABEL: Record<OutcomeOdds['tone'], string> = {
  good: 'удача',
  bad: 'риск',
  neutral: 'нейтрально',
};

// Collapses outcomes that share a tone into one segment, so the indicator reads
// as "good vs bad" odds rather than repeating the same label per outcome.
function aggregateByTone(odds: OutcomeOdds[]): OutcomeOdds[] {
  const order: OutcomeOdds['tone'][] = ['good', 'neutral', 'bad'];
  return order
    .map(tone => ({ tone, chance: odds.filter(o => o.tone === tone).reduce((s, o) => s + o.chance, 0) }))
    .filter(o => o.chance > 0);
}

function OddsBar({ odds }: { odds: OutcomeOdds[] }) {
  const merged = aggregateByTone(odds);
  const total = merged.reduce((s, o) => s + o.chance, 0) || 1;
  return (
    <div className="mt-2">
      <div className="flex h-1.5 overflow-hidden rounded-full bg-zinc-800">
        {merged.map((o, i) => (
          <div key={i} className={TONE_BAR[o.tone]} style={{ width: `${(o.chance / total) * 100}%` }} />
        ))}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
        {merged.map((o, i) => (
          <span key={i} className={`text-[10px] font-medium ${TONE_TEXT[o.tone]}`}>
            {TONE_LABEL[o.tone]} {o.chance}%
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ChoiceEventCard({ event, activePlayers, bunker, eventSelection, choiceVotes, choicePendingSelection, myPlayerId, send, disabled = false }: Props) {
  const options = event.options ?? [];
  const myVote = choiceVotes[myPlayerId] ?? null;
  const totalVoted = Object.keys(choiceVotes).length;

  // While voting, pickers are revealed only after the player has voted for an
  // option, and only for the kinds that option declares in `requires`. Once the
  // council has chosen (choicePendingSelection set), the winning option drives
  // the pickers for everyone, and a confirm step finalizes the resolution.
  const pending = choicePendingSelection != null;
  const activeOption = pending
    ? options.find(o => o.id === choicePendingSelection) ?? null
    : options.find(o => o.id === myVote) ?? null;
  const revealKinds = activeOption?.requires ?? [];
  const showPlayer = revealKinds.includes('player');
  const showItem = revealKinds.includes('item');
  const showProfession = revealKinds.includes('profession');
  const selectedPlayerId = eventSelection.selected_player_id;
  const selectedItems = eventSelection.selected_items;
  const selectedProfessions = eventSelection.selected_professions;

  const pushSelection = (nextPlayerId: string | null, nextItems: SelectedItem[], nextProfessions: string[]) => {
    send({ type: 'update_event_selection', selected_player_id: nextPlayerId, selected_professions: nextProfessions, selected_items: nextItems });
  };

  const selectPlayer = (playerId: string) => {
    pushSelection(selectedPlayerId === playerId ? null : playerId, selectedItems, selectedProfessions);
  };

  const toggleItem = (entry: SelectedItem) => {
    const key = getItemKey(entry);
    const exists = selectedItems.some(i => getItemKey(i) === key);
    const nextItems = exists ? selectedItems.filter(i => getItemKey(i) !== key) : [...selectedItems, entry];
    pushSelection(selectedPlayerId, nextItems, selectedProfessions);
  };
  const isItemSelected = (entry: SelectedItem) => selectedItems.some(i => getItemKey(i) === getItemKey(entry));

  const toggleProfession = (playerId: string) => {
    const next = selectedProfessions.includes(playerId)
      ? selectedProfessions.filter(p => p !== playerId)
      : [...selectedProfessions, playerId];
    pushSelection(selectedPlayerId, selectedItems, next);
  };

  const castVote = (optionId: string) => send({ type: 'cast_choice_vote', option_id: optionId });

  // Live success chance for selection-scaled options, mirroring the server
  // (selectionSuccessChance in yamlEvents.js): items count as 1, professions by
  // their skill level's `multiplier` (configured in the pack's SKILL_LEVELS),
  // capped at 90% unless one of every declared kind is present (→ 100%).
  const SELECTION_PER_RESOURCE = 40;
  const SELECTION_MAX_PARTIAL = 90;
  const professionStrength = selectedProfessions.reduce((sum, pid) => {
    const prof = activePlayers.find(p => p.id === pid)?.attributes.profession?.value;
    return sum + (typeof prof?.skill_multiplier === 'number' ? prof.skill_multiplier : 1);
  }, 0);
  const selectKinds = event.select?.kinds ?? (event.select?.kind ? [event.select.kind] : []);
  const resourceKinds = selectKinds.filter(k => k === 'item' || k === 'profession');
  const selectionStrength =
    (resourceKinds.includes('item') ? selectedItems.length : 0) +
    (resourceKinds.includes('profession') ? professionStrength : 0);
  const diverse = resourceKinds.length > 0 && resourceKinds.every(k => (k === 'item' ? selectedItems.length > 0 : selectedProfessions.length > 0));
  const successChance = selectionStrength <= 0 ? 0 : Math.min(diverse ? 100 : SELECTION_MAX_PARTIAL, Math.round(selectionStrength * SELECTION_PER_RESOURCE));

  // The scaled bar is meaningful only while this option's pickers are open;
  // elsewhere the odds aren't decided yet, so we show a hint instead.
  const scaledOddsFor = (option: EventOption): OutcomeOdds[] | undefined => {
    if (!option.odds_scaled) return undefined;
    return [
      { chance: successChance, tone: option.odds_scaled.good_tone },
      { chance: 100 - successChance, tone: option.odds_scaled.bad_tone },
    ].filter(o => o.chance > 0);
  };

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
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-widest text-zinc-500">Решение совета</p>
            {options.map(option => {
              const voters = Object.entries(choiceVotes).filter(([, o]) => o === option.id).map(([id]) => activePlayers.find(p => p.id === id)).filter((p): p is Player => Boolean(p));
              const mine = myVote === option.id;
              const won = pending && choicePendingSelection === option.id;
              const isActive = activeOption?.id === option.id;
              const scaledOdds = scaledOddsFor(option);
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => castVote(option.id)}
                  disabled={disabled || pending}
                  className={`rounded-xl border px-4 py-3 text-left transition-colors disabled:cursor-not-allowed ${
                    pending && !won ? 'opacity-40' : 'disabled:opacity-60'
                  } ${
                    mine || won ? 'border-amber-500/70 bg-amber-950/30' : 'border-zinc-800 bg-zinc-950/70 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className={`text-sm font-semibold ${mine ? 'text-amber-200' : 'text-zinc-200'}`}>{option.label}</span>
                    <VoterDots voters={voters} activePlayers={activePlayers} />
                  </div>
                  {option.description && <p className="mt-1 text-xs leading-relaxed text-zinc-500">{option.description}</p>}
                  {option.odds && option.odds.length >= 1 && <OddsBar odds={option.odds} />}
                  {option.odds_scaled && (
                    isActive && selectionStrength > 0 && scaledOdds
                      ? <OddsBar odds={scaledOdds} />
                      : <p className="mt-2 text-[10px] text-zinc-500">Шанс зависит от выбранных предметов и профессий.</p>
                  )}
                </button>
              );
            })}
          </div>

          {/* Pickers appear only once the council member has voted for an option
              that calls for a choice (its `requires`). */}
          {showPlayer && (
            <div className="border-t border-zinc-800 pt-4">
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
            </div>
          )}

          {showProfession && (
            <div className="border-t border-zinc-800 pt-4">
              <p className="mb-2 text-xs uppercase tracking-widest text-zinc-500">{event.select?.prompt_profession || 'Выберите профессию'}</p>
              <div className="flex flex-col gap-1">
                {activePlayers.map(p => {
                  if (!p.attributes.profession) return null;
                  return (
                    <EventSelectableRow
                      key={p.id}
                      selected={selectedProfessions.includes(p.id)}
                      onToggle={() => toggleProfession(p.id)}
                      primary={p.attributes.profession.display}
                      secondary={p.name}
                      ariaLabel={`Выбрать профессию ${p.attributes.profession.display}`}
                      disabled={disabled}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {showItem && (
            <div className="border-t border-zinc-800 pt-4">
              <p className="mb-2 text-xs uppercase tracking-widest text-zinc-500">{event.select?.prompt_item || event.select?.prompt || 'Посмотрите, что есть на складе'}</p>
              <SelectableItemList items={[...getPlayerItemOptions(activePlayers), ...getBunkerItemOptions(bunker)]} isItemSelected={isItemSelected} toggleItem={toggleItem} disabled={disabled} />
            </div>
          )}
        </div>

        <div className="border-t border-zinc-800 p-5">
          {pending ? (
            <div className="flex flex-col items-center gap-3">
              <p className="text-center text-xs text-zinc-500">
                Совет выбрал. Сделайте выбор и подтвердите — иначе он останется пустым.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => send({ type: 'cancel_choice_selection' })}
                  disabled={disabled}
                  className="rounded-xl border border-zinc-700 px-5 py-2 text-sm font-semibold text-zinc-300 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Отменить решение
                </button>
                <button
                  type="button"
                  onClick={() => send({ type: 'confirm_choice_selection' })}
                  disabled={disabled}
                  className="rounded-xl px-5 py-2 text-sm font-semibold text-white btn-primary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Подтвердить
                </button>
              </div>
            </div>
          ) : (
            <p className="text-center text-xs text-zinc-500">
              {disabled
                ? 'Соединение восстанавливается. Голосование временно заблокировано.'
                : `Проголосовало ${totalVoted} из ${activePlayers.length}. Решение примут, когда выскажутся все.`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
