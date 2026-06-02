import type { BunkerInfo, GameEvent, Player, ClientMessage, PackSettings, EventSelection } from '../types/game';
import PassiveEventCard from './event/PassiveEventCard';
import FoodReplenishCard from './event/FoodReplenishCard';
import InteractiveEventCard from './event/InteractiveEventCard';

interface Props {
  event: GameEvent;
  activePlayers: Player[];
  bunker: BunkerInfo | null;
  packSettings: PackSettings;
  eventSelection: EventSelection;
  send: (msg: ClientMessage) => void;
}

export default function EventModal({ event, activePlayers, bunker, packSettings, eventSelection, send }: Props) {
  if (event.event_type === 'passive') {
    return <PassiveEventCard event={event} send={send} />;
  }
  if (event.event_type === 'food_replenish') {
    return <FoodReplenishCard event={event} activePlayers={activePlayers} bunker={bunker} packSettings={packSettings} eventSelection={eventSelection} send={send} />;
  }
  return <InteractiveEventCard event={event} activePlayers={activePlayers} bunker={bunker} packSettings={packSettings} eventSelection={eventSelection} send={send} />;
}
