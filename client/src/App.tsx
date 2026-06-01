import { useEffect, useRef, useState, useCallback } from 'react';
import type { ServerMessage, ClientMessage, Player } from './types/game';
import { useGameState } from './hooks/useGameState';
import WelcomeScreen from './components/WelcomeScreen';
import GameLobby from './components/GameLobby';
import GameRoom from './components/GameRoom';
import './index.css';

export default function App() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const intentionalCloseRef = useRef(false);

  const { roomState, handleMessage, myPlayerIdRef } = useGameState();
  const [votingResult, setVotingResult] = useState<{ eliminated: Player | null; isTie: boolean } | null>(null);
  const [gameWinner, setGameWinner] = useState<Player | null | undefined>(undefined);
  const [hasVoted, setHasVoted] = useState(false);
  const [flashMessage, setFlashMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);

  const showFlashMessage = useCallback((kind: 'info' | 'error', text: string) => {
    setFlashMessage({ kind, text });
    setTimeout(() => setFlashMessage(null), 5000);
  }, []);

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
      ws.send(JSON.stringify(authMsg));
    };

    ws.onmessage = (e) => {
      const msg: ServerMessage = JSON.parse(e.data);

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
      if (msg.type === 'game_ended') setGameWinner(msg.winner);
      if (msg.type === 'vote_confirmed') setHasVoted(true);
      if (msg.type === 'profession_ability_used') showFlashMessage('info', msg.message);

      handleMessage(msg);
    };

    ws.onclose = () => {
      if (intentionalCloseRef.current) return;
      const token = localStorage.getItem('bunker_token');
      if (token) {
        reconnectRef.current = setTimeout(() => connect({ type: 'rejoin', token }), 2000);
      }
    };
  }, [handleMessage, myPlayerIdRef, showFlashMessage]);

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
      wsRef.current?.close();
    };
  }, []);

  const handleLeave = useCallback(() => {
    intentionalCloseRef.current = true;
    clearTimeout(reconnectRef.current);
    wsRef.current?.close();
    wsRef.current = null;
    localStorage.removeItem('bunker_token');
    localStorage.removeItem('bunker_room');
    localStorage.removeItem('bunker_player_id');
    myPlayerIdRef.current = null;
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.pushState({}, '', url);
    window.location.reload();
  }, [myPlayerIdRef]);

  const myPlayerId = myPlayerIdRef.current;

  if (!roomState || !myPlayerId) {
    return <WelcomeScreen onConnect={connect} />;
  }

  if (roomState.status === 'waiting') {
    return (
      <GameLobby
        roomState={roomState}
        myPlayerId={myPlayerId}
        send={send}
        onLeave={handleLeave}
      />
    );
  }

  return (
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
  );
}
