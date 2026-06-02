export type GameStatus = 'waiting' | 'running' | 'bunker_life' | 'finished';

export type AttributeKey =
  | 'gender' | 'race' | 'body' | 'trait' | 'profession' | 'health'
  | 'hobby' | 'phobia' | 'inventory' | 'backpack' | 'additional';

export const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  gender: 'Пол',
  race: 'Раса',
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
  'gender', 'race', 'body', 'trait', 'profession', 'health',
  'hobby', 'phobia', 'inventory', 'backpack', 'additional',
];

export interface AttributeValue<T = unknown> {
  value: T;
  display: string;
}

export interface BackpackItemValue {
  id: string;
  label: string;
  quantity: number;
}

export interface IdValue {
  id: string;
  label?: string;
}

export interface ProfessionValue {
  id: string;
  levelId: string;
}

export type PlayerAttributes = Record<AttributeKey, AttributeValue | null> & {
  profession: AttributeValue<ProfessionValue> | null;
  inventory: AttributeValue<IdValue> | null;
  backpack: AttributeValue<BackpackItemValue[]> | null;
};

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

export interface ConfigEntity {
  id: string;
  label: string;
  description?: string;
}

export type BunkerCell = { items: ConfigEntity[]; isEntrance?: boolean } | null;

export interface BunkerInfo {
  theme: ConfigEntity;
  size: ConfigEntity;
  duration: ConfigEntity;
  food: ConfigEntity;
  items: ConfigEntity[];
  disaster_info: string;
  bunker_info: string;
  grid: BunkerCell[][];
}

export interface GameEvent {
  id: string;
  title: string;
  description: string;
  base_chance?: number;
  event_type?: 'passive' | 'interactive' | 'food_replenish';
  participants_template?: 'couple' | 'random_one' | 'random_group' | null;
  participants_min?: number;
  participants_max?: number;
  participants?: string[];
  success_effect?: { type: 'survival_change' | 'food_change' | string; value: number };
  failure_effect?: { type: 'survival_change' | 'food_change' | string; value: number };
}

export interface RoomState {
  room_code: string;
  admin_id: string;
  status: GameStatus;
  is_voting: boolean;
  round: number;
  bunker_capacity: number | null;
  survival_chance: number;
  current_month: number;
  total_months: number;
  food_months: number;
  food_months_display: number;
  active_event: GameEvent | null;
  month_start_time: number | null;
  month_duration: number;
  confirmed_bunker_life: string[];
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

export type SelectedItem =
  | {
      player_id: string;
      item_id: string;
      source: 'inventory' | 'backpack';
    }
  | {
      item_id: string;
      source: 'bunker';
    };

export type ServerMessage =
  | { type: 'room_state'; data: RoomState }
  | { type: 'joined'; token: string; player_id: string; room_code: string }
  | { type: 'error'; message: string }
  | { type: 'attribute_revealed'; player_id: string; attribute: AttributeKey; value: AttributeValue }
  | { type: 'vote_confirmed' }
  | { type: 'voting_result'; eliminated: Player | null; is_tie: boolean; votes: Record<string, number> }
  | { type: 'game_ended'; winner: Player | null; from_bunker_life?: boolean; survived?: boolean }
  | { type: 'player_disconnected'; player_id: string }
  | { type: 'player_reconnected'; player_id: string }
  | { type: 'admin_changed'; new_admin_id: string }
  | { type: 'profession_ability_used'; message: string }
  | { type: 'ready_for_bunker_life'; capacity: number; active_count: number }
  | { type: 'event_resolved'; event_id: string; outcome: 'success' | 'failure'; survival_change: number; survival_chance: number; food_change?: number };

export type ClientMessage =
  | { type: 'join'; nickname: string; room_code?: string; pack?: string }
  | { type: 'rejoin'; token: string }
  | { type: 'start_game' }
  | { type: 'reveal_attribute'; attribute: AttributeKey }
  | { type: 'reveal_all' }
  | { type: 'start_voting' }
  | { type: 'submit_vote'; target_id: string }
  | { type: 'end_game' }
  | { type: 'kick_player'; player_id: string }
  | { type: 'use_profession_ability'; target_id?: string; second_target_id?: string; variant?: string }
  | { type: 'confirm_bunker_life' }
  | { type: 'resolve_event'; selected_professions: string[]; selected_items: SelectedItem[] };
