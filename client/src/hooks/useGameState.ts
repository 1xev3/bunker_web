import { useReducer, useRef, useCallback } from 'react';
import type { RoomState, ServerMessage, Player, AttributeKey, AttributeValue } from '../types/game';

type Action =
  | { type: 'SET_STATE'; payload: RoomState }
  | { type: 'ATTR_REVEALED'; player_id: string; attribute: AttributeKey; value: AttributeValue }
  | { type: 'PLAYER_DISCONNECTED'; player_id: string }
  | { type: 'PLAYER_RECONNECTED'; player_id: string }
  | { type: 'ADMIN_CHANGED'; new_admin_id: string }
  | { type: 'VOTING_RESULT'; eliminated: Player | null }
  | { type: 'GAME_ENDED' }
  | { type: 'RESET' };

function reducer(state: RoomState | null, action: Action): RoomState | null {
  if (action.type === 'RESET') return null;
  if (!state) {
    if (action.type === 'SET_STATE') return action.payload;
    return null;
  }
  switch (action.type) {
    case 'SET_STATE':
      return action.payload;
    case 'ATTR_REVEALED':
      return {
        ...state,
        players: state.players.map(p =>
          p.id === action.player_id
            ? {
                ...p,
                revealed_attributes: { ...p.revealed_attributes, [action.attribute]: true },
                attributes: { ...p.attributes, [action.attribute]: action.value },
              }
            : p
        ),
      };
    case 'PLAYER_DISCONNECTED':
    case 'PLAYER_RECONNECTED':
      return state;
    case 'ADMIN_CHANGED':
      return { ...state, admin_id: action.new_admin_id };
    case 'VOTING_RESULT':
      return {
        ...state,
        is_voting: false,
        players: action.eliminated
          ? state.players.map(p =>
              p.id === action.eliminated!.id ? { ...p, is_active: false } : p
            )
          : state.players,
      };
    case 'GAME_ENDED':
      return { ...state, status: 'finished' };
    default:
      return state;
  }
}

export function useGameState() {
  const [roomState, dispatch] = useReducer(reducer, null);
  const myPlayerIdRef = useRef<string | null>(null);

  const handleMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case 'room_state':
        dispatch({ type: 'SET_STATE', payload: msg.data });
        break;
      case 'attribute_revealed':
        dispatch({ type: 'ATTR_REVEALED', player_id: msg.player_id, attribute: msg.attribute, value: msg.value });
        break;
      case 'player_disconnected':
        dispatch({ type: 'PLAYER_DISCONNECTED', player_id: msg.player_id });
        break;
      case 'player_reconnected':
        dispatch({ type: 'PLAYER_RECONNECTED', player_id: msg.player_id });
        break;
      case 'admin_changed':
        dispatch({ type: 'ADMIN_CHANGED', new_admin_id: msg.new_admin_id });
        break;
      case 'voting_result':
        dispatch({ type: 'VOTING_RESULT', eliminated: msg.eliminated });
        break;
      case 'game_ended':
        dispatch({ type: 'GAME_ENDED' });
        break;
    }
  }, []);

  const resetState = useCallback(() => dispatch({ type: 'RESET' }), []);

  return { roomState, handleMessage, myPlayerIdRef, resetState };
}
