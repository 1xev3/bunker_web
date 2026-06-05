import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye } from 'lucide-react';
import type { ServerMessage, ClientMessage, Player, EventOutcome, MonthlyNotice } from './types/game';
import { useGameState } from './hooks/useGameState';
import WelcomeScreen from './components/lobby/WelcomeScreen';
import GameLobby from './components/lobby/GameLobby';
import GameRoom from './components/game/GameRoom';
import BunkerIntroScreen from './components/bunker/BunkerIntroScreen';
import BunkerLifeScreen from './components/bunkerLife/BunkerLifeScreen';
import ReadyModal from './components/ui/ReadyModal';
import BunkerEndScreen from './components/bunker/BunkerEndScreen';

const HEARTBEAT_INTERVAL_MS = 10000;
const HEARTBEAT_TIMEOUT_MS = 15000;

const WS_DEBUG = true;
function wsLog(...args: unknown[]) {
  if (WS_DEBUG) console.log('[ws]', ...args);
}

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
  const connectRef = useRef<((authMsg: ClientMessage) => void) | undefined>(undefined);

  const { roomState, handleMessage, myPlayerIdRef, resetState } = useGameState();
  // Reactive mirror of myPlayerIdRef so render reads state (not a ref); the ref is
  // kept for synchronous access inside callbacks/effects. setPlayerId updates both.
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const setPlayerId = useCallback((id: string | null) => {
    myPlayerIdRef.current = id;
    setMyPlayerId(id);
  }, [myPlayerIdRef]);
  const [isConnectionLost, setIsConnectionLost] = useState(false);
  const [isSpectator, setIsSpectator] = useState(false);
  // Room code we're spectating, kept in a ref so the onclose reconnect timer can
  // re-spectate without a stale closure. Spectators hold no session token.
  const spectateRoomRef = useRef<string | null>(null);
  const [showBunkerIntro, setShowBunkerIntro] = useState(false);
  const [votingResult, setVotingResult] = useState<{ eliminated: Player | null; isTie: boolean } | null>(null);
  const [gameWinner, setGameWinner] = useState<Player | null | undefined>(undefined);
  const [hasVoted, setHasVoted] = useState(false);
  const [flashMessage, setFlashMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const [showReadyModal, setShowReadyModal] = useState(false);
  const [readyCapacity, setReadyCapacity] = useState<number>(2);
  const [eventOutcome, setEventOutcome] = useState<EventOutcome | null>(null);
  const [monthlyNotice, setMonthlyNotice] = useState<MonthlyNotice | null>(null);
  const monthlyNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      wsLog(`send type=${msg.type}`);
      wsRef.current.send(JSON.stringify(msg));
    } else {
      wsLog(`send DROPPED type=${msg.type} (socket not open, readyState=${wsRef.current?.readyState ?? 'null'})`);
    }
  }, []);

  const connect = useCallback((authMsg: ClientMessage) => {
    intentionalCloseRef.current = true;
    wsRef.current?.close();
    wsRef.current = null;
    clearTimeout(reconnectRef.current);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // In dev, connect straight to the Node server instead of routing through the
    // Vite proxy — its ws upgrade is flaky (half-open sockets where the client
    // reports OPEN but frames never reach the server). In prod we share the host.
    const host = import.meta.env.DEV ? `${window.location.hostname}:3001` : window.location.host;
    const url = `${protocol}//${host}/ws`;
    wsLog(`connect() opening ${url} auth=${authMsg.type}`);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      wsLog(`onopen — sending auth=${authMsg.type}`);
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
          // The room is gone (e.g. server restarted). Stop the reconnect loop,
          // drop the dead session, and fall back to the welcome screen with a
          // clear notice — otherwise the UI freezes behind the "reconnecting"
          // overlay because myPlayerIdRef is a ref and roomState is never reset.
          intentionalCloseRef.current = true;
          clearTimeout(reconnectRef.current);
          localStorage.removeItem('bunker_token');
          localStorage.removeItem('bunker_room');
          localStorage.removeItem('bunker_player_id');
          setPlayerId(null);
          setIsConnectionLost(false);
          resetState();
          showFlashMessage('error', 'Сессия истекла или комната больше не существует. Подключитесь заново.');
        } else {
          showFlashMessage('error', msg.message);
        }
        return;
      }

      if (msg.type === 'joined') {
        localStorage.setItem('bunker_token', msg.token);
        localStorage.setItem('bunker_room', msg.room_code);
        setPlayerId(msg.player_id);
        localStorage.setItem('bunker_player_id', msg.player_id);
        const url = new URL(window.location.href);
        url.searchParams.set('room', msg.room_code);
        window.history.pushState({}, '', url);
        return;
      }

      if (msg.type === 'spectating') {
        // The spectator id matches no player, so every screen renders read-only.
        setIsSpectator(true);
        setPlayerId(msg.spectator_id);
        spectateRoomRef.current = msg.room_code;
        localStorage.setItem('bunker_spectate_room', msg.room_code);
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
        setEventOutcome({ outcome: msg.outcome, message: msg.message, health_changes: msg.health_changes, sanity_changes: msg.sanity_changes, status_changes: msg.status_changes, food_change: msg.food_change, event_id: msg.event_id, players_killed: msg.players_killed, room_changed: msg.room_changed, players_added: msg.players_added, item_changes: msg.item_changes });
      }

      if (msg.type === 'monthly_report') {
        setMonthlyNotice({ health_changes: msg.health_changes, sanity_changes: msg.sanity_changes, status_changes: msg.status_changes, players_killed: msg.players_killed });
        if (monthlyNoticeTimerRef.current) clearTimeout(monthlyNoticeTimerRef.current);
        monthlyNoticeTimerRef.current = setTimeout(() => setMonthlyNotice(null), 7000);
      }

      if (msg.type === 'room_state' && msg.data.status === 'bunker_life') {
        setShowReadyModal(false);
        setShowBunkerIntro(false);
      }

      handleMessage(msg);
    };

    ws.onerror = (e) => {
      wsLog('onerror', e);
      setIsConnectionLost(true);
    };

    ws.onclose = (e) => {
      wsLog(`onclose code=${e.code} reason=${e.reason || '-'} clean=${e.wasClean} intentional=${intentionalCloseRef.current}`);
      clearHeartbeat();
      if (intentionalCloseRef.current) return;
      const token = localStorage.getItem('bunker_token');
      if (token) {
        wsLog('connection lost — scheduling rejoin in 2s');
        setIsConnectionLost(true);
        reconnectRef.current = setTimeout(() => connectRef.current?.({ type: 'rejoin', token }), 2000);
      } else if (spectateRoomRef.current) {
        wsLog('connection lost — scheduling re-spectate in 2s');
        setIsConnectionLost(true);
        const room = spectateRoomRef.current;
        reconnectRef.current = setTimeout(() => connectRef.current?.({ type: 'spectate', room_code: room }), 2000);
      } else {
        wsLog('closed with no token — not reconnecting');
      }
    };
  }, [clearHeartbeat, handleMessage, markHeartbeat, setPlayerId, resetState, showFlashMessage, startHeartbeat]);

  // Keep the latest `connect` reachable from the onclose reconnect timer without
  // referencing it before its own declaration.
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    if (roomState?.status === 'running' && roomState.bunker) {
      const key = `bunker_intro_seen_${roomState.room_code}`;
      if (!sessionStorage.getItem(key)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot reveal of the intro when the bunker first appears
        setShowBunkerIntro(true);
      }
    }
  }, [roomState?.status, roomState?.room_code, roomState?.bunker]);

  useEffect(() => {
    if (!roomState?.is_voting) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset local vote flag when a voting round ends
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

  // A new event must never stay hidden behind a stale outcome modal. The server
  // always nulls active_event before resolving (they're mutually exclusive), so
  // a fresh active_event means the previous outcome flow is done — drop it.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a fresh event supersedes any lingering outcome modal
    if (roomState?.active_event) setEventOutcome(null);
  }, [roomState?.active_event?.id]);

  useEffect(() => {
    const token = localStorage.getItem('bunker_token');
    const spectateRoom = localStorage.getItem('bunker_spectate_room');
    if (token) {
      const savedId = localStorage.getItem('bunker_player_id');
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the persisted player id on mount before reconnecting
      if (savedId) setPlayerId(savedId);
      connect({ type: 'rejoin', token });
    } else if (spectateRoom) {
      spectateRoomRef.current = spectateRoom;
      connect({ type: 'spectate', room_code: spectateRoom });
    }
    return () => {
      intentionalCloseRef.current = true;
      clearTimeout(reconnectRef.current);
      clearHeartbeat();
      wsRef.current?.close();
    };
  }, [clearHeartbeat, connect, setPlayerId]);

  const handleLeave = useCallback((opts?: { skipHistory?: boolean }) => {
    intentionalCloseRef.current = true;
    clearTimeout(reconnectRef.current);
    clearHeartbeat();
    wsRef.current?.close();
    wsRef.current = null;
    setIsConnectionLost(false);
    localStorage.removeItem('bunker_token');
    localStorage.removeItem('bunker_room');
    localStorage.removeItem('bunker_player_id');
    localStorage.removeItem('bunker_spectate_room');
    spectateRoomRef.current = null;
    setIsSpectator(false);
    setPlayerId(null);
    // When leaving was triggered by the browser Back button, the URL has already
    // been popped to `/` — pushing again would add a redundant history entry.
    if (opts?.skipHistory !== true) {
      const url = new URL(window.location.href);
      url.searchParams.delete('room');
      window.history.pushState({}, '', url);
    }
    window.location.reload();
  }, [clearHeartbeat, setPlayerId]);

  // Make the browser Back button leave the room. Entering a room pushes a
  // `?room=ABCD` history entry (see the `joined` handler), so pressing Back pops
  // it off and fires popstate with no `room` param — that's our cue to leave.
  useEffect(() => {
    const onPopState = () => {
      // Editor navigation is owned by App's router; don't treat it as a leave.
      if (window.location.pathname.startsWith('/packs/')) return;
      const stillInRoom = new URLSearchParams(window.location.search).has('room');
      if (!stillInRoom && myPlayerIdRef.current) {
        handleLeave({ skipHistory: true });
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [handleLeave, myPlayerIdRef]);

  const roomCode = roomState?.room_code;
  const handleIntroContinue = useCallback(() => {
    setShowBunkerIntro(false);
    if (roomCode) {
      sessionStorage.setItem(`bunker_intro_seen_${roomCode}`, '1');
    }
  }, [roomCode]);

  useEffect(() => {
    const color = roomState?.pack_meta?.color ?? '#f59e0b';
    document.documentElement.style.setProperty('--accent', color);
    document.documentElement.style.setProperty('--accent-rgb', hexToRgb(color));
  }, [roomState?.pack_meta?.color]);

  const spectatorBanner = isSpectator ? (
    <div className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-full border border-amber-700/50 bg-zinc-900/90 px-4 py-1.5 text-xs text-amber-300 shadow-lg backdrop-blur flex items-center gap-1.5 pointer-events-none">
      <Eye size={13} /> Режим зрителя — вы наблюдаете за игрой
    </div>
  ) : null;

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
        {spectatorBanner}
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
          monthlyNotice={monthlyNotice}
          isConnectionLost={isConnectionLost}
        />
        {spectatorBanner}
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
        {spectatorBanner}
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
        {spectatorBanner}
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
      {showReadyModal && !isSpectator && (
        <ReadyModal
          capacity={readyCapacity}
          activePlayers={roomState.players.filter((p) => p.is_active)}
          confirmedIds={roomState.confirmed_bunker_life}
          myPlayerId={myPlayerId}
          send={send}
        />
      )}
      {spectatorBanner}
      {connectionOverlay}
    </>
  );
}
