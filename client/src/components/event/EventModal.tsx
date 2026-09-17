import type { BunkerInfo, GameEvent, Player, ClientMessage, PackSettings, EventSelection } from '../../types/game';
import PassiveEventCard from './PassiveEventCard';
import FoodReplenishCard from './FoodReplenishCard';
import ChoiceEventCard from './ChoiceEventCard';

interface Props {
  event: GameEvent;
  activePlayers: Player[];
  bunker: BunkerInfo | null;
  packSettings: PackSettings;
  eventSelection: EventSelection;
  choiceVotes: Record<string, string>;
  choicePendingSelection: string | null;
  aiEnabled: boolean;
  aiResolving: boolean;
  resolveConfirmations: string[];
  myPlayerId: string;
  send: (msg: ClientMessage) => void;
  disabled?: boolean;
  readOnly?: boolean;
}

export default function EventModal({ event, activePlayers, bunker, packSettings, eventSelection, choiceVotes, choicePendingSelection, aiEnabled, aiResolving, resolveConfirmations, myPlayerId, send, disabled = false, readOnly = false }: Props) {
  if (event.event_type === 'food_replenish') {
    return <FoodReplenishCard event={event} activePlayers={activePlayers} bunker={bunker} packSettings={packSettings} eventSelection={eventSelection} resolveConfirmations={resolveConfirmations} aiEnabled={aiEnabled} aiResolving={aiResolving} myPlayerId={myPlayerId} send={send} disabled={disabled} readOnly={readOnly} />;
  }
  if (event.event_type === 'choice') {
    return <ChoiceEventCard event={event} activePlayers={activePlayers} bunker={bunker} eventSelection={eventSelection} choiceVotes={choiceVotes} choicePendingSelection={choicePendingSelection} aiEnabled={aiEnabled} aiResolving={aiResolving} myPlayerId={myPlayerId} send={send} disabled={disabled} readOnly={readOnly} />;
  }
  return <PassiveEventCard event={event} activePlayers={activePlayers} resolveConfirmations={resolveConfirmations} myPlayerId={myPlayerId} send={send} disabled={disabled} readOnly={readOnly} />;
}
