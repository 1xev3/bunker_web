import { useCallback, useEffect, useRef, useState } from 'react';
import type { ServerMessage, ClientMessage, Player, VitalChange, StatusChange } from './types/game';
import { useGameState } from './hooks/useGameState';
import WelcomeScreen from './components/WelcomeScreen';
import GameLobby from './components/GameLobby';
import GameRoom from './components/GameRoom';
import BunkerIntroScreen from './components/BunkerIntroScreen';
import BunkerLifeScreen from './components/BunkerLifeScreen';
import ReadyModal from './components/ReadyModal';
import BunkerEndScreen from './components/BunkerEndScreen';

const HEARTBEAT_INTERVAL_MS = 10000;
const HEARTBEAT_TIMEOUT_MS = 15000;

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

interface Props {
  onOpenPackEditor: (packId: string) => void;
}

export default function GameApp({ onOpenPackEditor }: Props) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const heartbeatTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const intentionalCloseRef = useRef(false);

  const { roomState, handleMessage, myPlayerIdRef } = useGameState();
  const [isConnectionLost, setIsConnectionLost] = useState(false);
  const [showBunkerIntro, setShowBunkerIntro] = useState(false);
  const [votingResult, setVotingResult] = useState<{ eliminated: Player | null; isTie: boolean } | null>(null);
  const [gameWinner, setGameWinner] = useState<Player | null | undefined>(undefined);
  const [hasVoted, setHasVoted] = useState(false);
  const [flashMessage, setFlashMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const [showReadyModal, setShowReadyModal] = useState(false);
  const [readyCapacity, setReadyCapacity] = useState<number>(2);
  const [eventOutcome, setEventOutcome] = useState<{ outcome: string; message?: string | null; health_changes?: VitalChange[]; sanity_changes?: VitalChange[]; status_changes?: StatusChange[]; food_change?: number; event_id?: string; players_killed?: Array<{ id: string; name: string }>; room_changed?: boolean; players_added?: Array<{ id: string; name: string }> } | null>(null);
  const [bunkerLifeResult, setBunkerLifeResult] = useState<{ survived: boolean } | null>(null);
  const prevOutcomeConfirmationsRef = useRef<string[] | null | undefined>(undefined);

  const showFlashMessage = useCallback((kind: 'info' | 'error', text: string) => {
    setFlashMessage({ kind, text });
    setTimeout(() => setFlashMessage(null), 5000);
  }, []);

  const clearHeartbeat = useCallback(() => {
    clearInterval(heartbeatIntervalRef.current);
    clearTimeout(heartbeatTimeoutRef.current);
  }, []);

  const markHeartbeat = useCallback(() => {
    clearTimeout(heartbeatTimeoutRef.current);
    heartbeatTimeoutRef.current = setTimeout(() => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    }, HEARTBEAT_TIMEOUT_MS);
  }, []);

  const startHeartbeat = useCallback(() => {
    clearHeartbeat();
    markHeartbeat();
    heartbeatIntervalRef.current = setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: 'ping' }));
    }, HEARTBEAT_INTERVAL_MS);
  }, [clearHeartbeat, markHeartbeat]);

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const connect = useCallback((authMsg: ClientMessage) => {
    intentionalCloseRef.current = true;
    wsRef.current?.close();
    wsRef.current = null;
    clearTimeout(reconnectRef.current);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      intentionalCloseRef.current = false;
      setIsConnectionLost(false);
      startHeartbeat();
      ws.send(JSON.stringify(authMsg));
    };

    ws.onmessage = (e) => {
      const msg: ServerMessage = JSON.parse(e.data);
      markHeartbeat();

      if (msg.type === 'pong') {
        return;
      }

      if (msg.type === 'error') {
        if (msg.message === 'Invalid or expired token') {
          localStorage.removeItem('bunker_token');
          localStorage.removeItem('bunker_room');
          localStorage.removeItem('bunker_player_id');
          myPlayerIdRef.current = null;
        } else {
          showFlashMessage('error', msg.message);
        }
        return;
      }

      if (msg.type === 'joined') {
        localStorage.setItem('bunker_token', msg.token);
        localStorage.setItem('bunker_room', msg.room_code);
        myPlayerIdRef.current = msg.player_id;
        localStorage.setItem('bunker_player_id', msg.player_id);
        const url = new URL(window.location.href);
        url.searchParams.set('room', msg.room_code);
        window.history.pushState({}, '', url);
        return;
      }

      if (msg.type === 'voting_result') {
        setVotingResult({ eliminated: msg.eliminated, isTie: msg.is_tie });
        setHasVoted(false);
        setTimeout(() => setVotingResult(null), 5000);
      }
      if (msg.type === 'game_ended') {
        setGameWinner(msg.winner);
        if (msg.from_bunker_life) {
          setBunkerLifeResult({ survived: msg.survived ?? false });
        }
      }
      if (msg.type === 'vote_confirmed') setHasVoted(true);
      if (msg.type === 'profession_ability_used') showFlashMessage('info', msg.message);

      if (msg.type === 'ready_for_bunker_life') {
        setReadyCapacity(msg.capacity);
        setShowReadyModal(true);
      }

      if (msg.type === 'event_resolved') {
        setEventOutcome({ outcome: msg.outcome, message: msg.message, health_changes: msg.health_changes, sanity_changes: msg.sanity_changes, status_changes: msg.status_changes, food_change: msg.food_change, event_id: msg.event_id, players_killed: msg.players_killed, room_changed: msg.room_changed, players_added: msg.players_added });
      }

      if (msg.type === 'room_state' && msg.data.status === 'bunker_life') {
        setShowReadyModal(false);
        setShowBunkerIntro(false);
      }

      handleMessage(msg);
    };

    ws.onerror = () => {
      setIsConnectionLost(true);
    };

    ws.onclose = () => {
      clearHeartbeat();
      if (intentionalCloseRef.current) return;
      const token = localStorage.getItem('bunker_token');
      if (token) {
        setIsConnectionLost(true);
        reconnectRef.current = setTimeout(() => connect({ type: 'rejoin', token }), 2000);
      }
    };
  }, [clearHeartbeat, handleMessage, markHeartbeat, myPlayerIdRef, showFlashMessage, startHeartbeat]);

  useEffect(() => {
    if (roomState?.status === 'running' && roomState.bunker) {
      const key = `bunker_intro_seen_${roomState.room_code}`;
      if (!sessionStorage.getItem(key)) {
        setShowBunkerIntro(true);
      }
    }
  }, [roomState?.status, roomState?.room_code, roomState?.bunker]);

  useEffect(() => {
    if (!roomState?.is_voting) {
      setHasVoted(false);
    }
  }, [roomState?.is_voting]);

  useEffect(() => {
    const oc = roomState?.outcome_confirmations ?? null;
    if (Array.isArray(prevOutcomeConfirmationsRef.current) && oc === null) {
      setEventOutcome(null);
    }
    prevOutcomeConfirmationsRef.current = oc;
  }, [roomState?.outcome_confirmations]);

  useEffect(() => {
    const token = localStorage.getItem('bunker_token');
    if (token) {
      const savedId = localStorage.getItem('bunker_player_id');
      if (savedId) myPlayerIdRef.current = savedId;
      connect({ type: 'rejoin', token });
    }
    return () => {
      intentionalCloseRef.current = true;
      clearTimeout(reconnectRef.current);
      clearHeartbeat();
      wsRef.current?.close();
    };
  }, [clearHeartbeat, connect, myPlayerIdRef]);

  const handleLeave = useCallback(() => {
    intentionalCloseRef.current = true;
    clearTimeout(reconnectRef.current);
    clearHeartbeat();
    wsRef.current?.close();
    wsRef.current = null;
    setIsConnectionLost(false);
    localStorage.removeItem('bunker_token');
    localStorage.removeItem('bunker_room');
    localStorage.removeItem('bunker_player_id');
    myPlayerIdRef.current = null;
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.pushState({}, '', url);
    window.location.reload();
  }, [clearHeartbeat, myPlayerIdRef]);

  const handleIntroContinue = useCallback(() => {
    setShowBunkerIntro(false);
    if (roomState?.room_code) {
      sessionStorage.setItem(`bunker_intro_seen_${roomState.room_code}`, '1');
    }
  }, [roomState?.room_code]);

  useEffect(() => {
    const color = roomState?.pack_meta?.color ?? '#f59e0b';
    document.documentElement.style.setProperty('--accent', color);
    document.documentElement.style.setProperty('--accent-rgb', hexToRgb(color));
  }, [roomState?.pack_meta?.color]);

  const myPlayerId = myPlayerIdRef.current;
  const connectionOverlay = isConnectionLost && roomState && myPlayerId ? (
    <div className="connection-overlay" role="alert" aria-live="assertive">
      <div className="connection-overlay__panel">
        <div className="connection-overlay__badge">Связь потеряна</div>
        <h2>Соединение с сервером прервано</h2>
        <p>Пытаемся переподключиться. Не закрывайте вкладку.</p>
      </div>
    </div>
  ) : null;

  if (!roomState || !myPlayerId) {
    return (
      <WelcomeScreen
        onConnect={connect}
        onOpenPackEditor={onOpenPackEditor}
        serverError={flashMessage?.kind === 'error' ? flashMessage.text : undefined}
      />
    );
  }

  if (roomState.status === 'waiting') {
    return (
      <>
        <GameLobby
          roomState={roomState}
          myPlayerId={myPlayerId}
          send={send}
          onLeave={handleLeave}
        />
        {connectionOverlay}
      </>
    );
  }

  if (roomState.status === 'bunker_life') {
    return (
      <>
        <BunkerLifeScreen
          roomState={roomState}
          myPlayerId={myPlayerId}
          send={send}
          onLeave={handleLeave}
          eventOutcome={eventOutcome}
          outcomeConfirmations={roomState.outcome_confirmations}
          onDismissEventOutcome={() => setEventOutcome(null)}
          isConnectionLost={isConnectionLost}
        />
        {connectionOverlay}
      </>
    );
  }

  if (showBunkerIntro && roomState.bunker) {
    return (
      <>
        <BunkerIntroScreen
          bunker={roomState.bunker}
          players={roomState.players}
          bunkerCapacity={roomState.bunker_capacity}
          onContinue={handleIntroContinue}
          onLeave={handleLeave}
        />
        {connectionOverlay}
      </>
    );
  }

  if (roomState.status === 'finished' && bunkerLifeResult !== null) {
    return (
      <>
        <BunkerEndScreen
          survived={bunkerLifeResult.survived}
          roomState={roomState}
          onLeave={handleLeave}
        />
        {connectionOverlay}
      </>
    );
  }

  return (
    <>
      <GameRoom
        roomState={roomState}
        myPlayerId={myPlayerId}
        send={send}
        votingResult={votingResult}
        gameWinner={gameWinner}
        hasVoted={hasVoted}
        flashMessage={flashMessage}
        onLeave={handleLeave}
      />
      {showReadyModal && (
        <ReadyModal
          capacity={readyCapacity}
          activePlayers={roomState.players.filter((p) => p.is_active)}
          confirmedIds={roomState.confirmed_bunker_life}
          myPlayerId={myPlayerId}
          send={send}
        />
      )}
      {connectionOverlay}
    </>
  );
}
