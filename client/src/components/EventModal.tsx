import type { BunkerInfo, GameEvent, Player, ClientMessage, PackSettings, EventSelection } from '../types/game';
import PassiveEventCard from './event/PassiveEventCard';
import FoodReplenishCard from './event/FoodReplenishCard';
import ChoiceEventCard from './event/ChoiceEventCard';

interface Props {
  event: GameEvent;
  activePlayers: Player[];
  bunker: BunkerInfo | null;
  packSettings: PackSettings;
  eventSelection: EventSelection;
  choiceVotes: Record<string, string>;
  resolveConfirmations: string[];
  myPlayerId: string;
  send: (msg: ClientMessage) => void;
  disabled?: boolean;
}

export default function EventModal({ event, activePlayers, bunker, packSettings, eventSelection, choiceVotes, resolveConfirmations, myPlayerId, send, disabled = false }: Props) {
  if (event.event_type === 'food_replenish') {
    return <FoodReplenishCard event={event} activePlayers={activePlayers} bunker={bunker} packSettings={packSettings} eventSelection={eventSelection} resolveConfirmations={resolveConfirmations} myPlayerId={myPlayerId} send={send} disabled={disabled} />;
  }
  if (event.event_type === 'choice') {
    return <ChoiceEventCard event={event} activePlayers={activePlayers} bunker={bunker} eventSelection={eventSelection} choiceVotes={choiceVotes} myPlayerId={myPlayerId} send={send} disabled={disabled} />;
  }
  return <PassiveEventCard event={event} activePlayers={activePlayers} resolveConfirmations={resolveConfirmations} myPlayerId={myPlayerId} send={send} disabled={disabled} />;
}
