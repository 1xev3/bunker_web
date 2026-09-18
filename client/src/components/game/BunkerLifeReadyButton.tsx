import { Check, Shield } from 'lucide-react';
import type { ClientMessage, Player } from '../../types/game';
import Button from '../ui/Button';

interface Props {
  activePlayers: Player[];
  confirmedIds: string[];
  myPlayerId: string;
  send: (msg: ClientMessage) => void;
}

export default function BunkerLifeReadyButton({ activePlayers, confirmedIds, myPlayerId, send }: Props) {
  const confirmed = confirmedIds.includes(myPlayerId);

  return (
    <Button
      variant={confirmed ? 'secondary' : 'primary'}
      className={`h-10 shrink-0 px-3 text-xs ${confirmed ? 'phase-banner-voting' : 'animate-pulse'}`}
      disabled={confirmed}
      title={`${confirmedIds.length} из ${activePlayers.length} готовы продолжить`}
      onClick={() => send({ type: 'confirm_bunker_life' })}
    >
      {confirmed ? <Check size={14} /> : <Shield size={14} />}
      <span className="hidden sm:inline">{confirmed ? 'Готов, ждём остальных' : 'Готов к жизни в бункере'} ·</span> {confirmedIds.length}/{activePlayers.length}
    </Button>
  );
}
