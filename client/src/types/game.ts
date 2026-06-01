export type GameStatus = 'waiting' | 'running' | 'finished';

export type AttributeKey =
  | 'gender' | 'body' | 'trait' | 'profession' | 'health'
  | 'hobby' | 'phobia' | 'inventory' | 'backpack' | 'additional';

export const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  gender: 'Пол',
  body: 'Телосложение',
  trait: 'Черта',
  profession: 'Профессия',
  health: 'Здоровье',
  hobby: 'Хобби',
  phobia: 'Фобия',
  inventory: 'Инвентарь',
  backpack: 'Рюкзак',
  additional: 'Доп.',
};

export const ATTRIBUTE_KEYS: AttributeKey[] = [
  'gender', 'body', 'trait', 'profession', 'health',
  'hobby', 'phobia', 'inventory', 'backpack', 'additional',
];

export interface PlayerAttributes {
  gender: string | null;
  body: string | null;
  trait: string | null;
  profession: string | null;
  health: string | null;
  hobby: string | null;
  phobia: string | null;
  inventory: string | null;
  backpack: string | null;
  additional: string | null;
}

export interface Player {
  id: string;
  name: string;
  is_active: boolean;
  revealed_attributes: Record<AttributeKey, boolean>;
  attributes: PlayerAttributes;
  description: string;
  profession_ability: ProfessionAbilityInfo | null;
}

export type ProfessionAbilityTargetType = 'none' | 'self' | 'other' | 'pair';

export interface ProfessionAbilityInfo {
  key: string;
  title: string;
  description: string;
  targetType: ProfessionAbilityTargetType;
  allowSelf: boolean;
  hasAbility: boolean;
  used: boolean;
  variants?: { key: string; label: string }[];
}

export type BunkerCell = { items: string[]; isEntrance?: boolean } | null;

export interface BunkerInfo {
  theme: string;
  size: string;
  duration: string;
  food: string;
  items: string[];
  disaster_info: string;
  bunker_info: string;
  grid: BunkerCell[][];
}

export interface RoomState {
  room_code: string;
  admin_id: string;
  status: GameStatus;
  is_voting: boolean;
  players: Player[];
  bunker: BunkerInfo | null;
  votes: Record<string, string>;
  voted_players: string[];
}

export interface RoomListing {
  room_code: string;
  player_count: number;
  status: GameStatus;
}

export type ServerMessage =
  | { type: 'room_state'; data: RoomState }
  | { type: 'joined'; token: string; player_id: string; room_code: string }
  | { type: 'error'; message: string }
  | { type: 'attribute_revealed'; player_id: string; attribute: AttributeKey; value: string }
  | { type: 'vote_confirmed' }
  | { type: 'voting_result'; eliminated: Player | null; is_tie: boolean; votes: Record<string, number> }
  | { type: 'game_ended'; winner: Player | null }
  | { type: 'player_disconnected'; player_id: string }
  | { type: 'player_reconnected'; player_id: string }
  | { type: 'admin_changed'; new_admin_id: string }
  | { type: 'profession_ability_used'; message: string };

export type ClientMessage =
  | { type: 'join'; nickname: string; room_code?: string }
  | { type: 'rejoin'; token: string }
  | { type: 'start_game' }
  | { type: 'reveal_attribute'; attribute: AttributeKey }
  | { type: 'reveal_all' }
  | { type: 'start_voting' }
  | { type: 'submit_vote'; target_id: string }
  | { type: 'end_game' }
  | { type: 'kick_player'; player_id: string }
  | { type: 'use_profession_ability'; target_id?: string; second_target_id?: string; variant?: string };
