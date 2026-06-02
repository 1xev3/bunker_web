import type { BunkerInfo, GameEvent, Player, ClientMessage, PackSettings, EventSelection } from '../types/game';
import PassiveEventCard from './event/PassiveEventCard';
import FoodReplenishCard from './event/FoodReplenishCard';
import InteractiveEventCard from './event/InteractiveEventCard';
import NarrativeEventCard from './event/NarrativeEventCard';

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

export default function EventModal({ event, activePlayers, bunker, packSettings, eventSelection, choiceVotes, myPlayerId, send }: Props) {
  if (event.event_type === 'narrative') {
    return <NarrativeEventCard event={event} send={send} />;
  }
  if (event.event_type === 'passive') {
    return <PassiveEventCard event={event} send={send} />;
  }
  if (event.event_type === 'food_replenish') {
    return <FoodReplenishCard event={event} activePlayers={activePlayers} bunker={bunker} packSettings={packSettings} eventSelection={eventSelection} send={send} />;
  }
  return <InteractiveEventCard event={event} activePlayers={activePlayers} bunker={bunker} packSettings={packSettings} eventSelection={eventSelection} choiceVotes={choiceVotes} myPlayerId={myPlayerId} send={send} />;
}
