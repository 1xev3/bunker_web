export type GameStatus = 'waiting' | 'running' | 'bunker_life' | 'finished';

export type AttributeKey =
  | 'gender' | 'race' | 'body' | 'trait' | 'profession' | 'health'
  | 'hobby' | 'phobia' | 'inventory' | 'backpack' | 'additional';

export const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  gender: 'Пол',
  race: 'Раса',
  body: 'Телослож.',
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
  /** Event success multiplier of the skill level (from SKILL_LEVELS). */
  skill_multiplier?: number;
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
  vital_status: VitalStatus;
}

export interface VitalStatus {
  health: number;
  sanity: number;
  statuses: VitalStatusEffect[];
}

export interface VitalStatusEffect {
  id: string;
  label: string;
  type: 'buff' | 'debuff';
  stat: 'health' | 'sanity';
  delta: number;
  months: number;
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
  lockedVariant?: { key: string; label: string };
}

export interface ConfigEntity {
  id: string;
  label: string;
  description?: string;
}

export interface BunkerDurationEntity extends ConfigEntity {
  months: number;
}

export interface FoodSupplyEntity extends ConfigEntity {
  amount: number;
}

export interface BunkerRoom {
  id: string;
  x: number;
  y: number;
  isEntrance?: boolean;
  items: ConfigEntity[];
}

export interface BunkerCorridor {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

export interface BunkerLayout {
  cols: number;
  rows: number;
  rooms: BunkerRoom[];
  corridors: BunkerCorridor[];
}

export interface BunkerInfo {
  theme: ConfigEntity;
  size: ConfigEntity;
  duration: BunkerDurationEntity;
  food: FoodSupplyEntity;
  items: ConfigEntity[];
  disaster_info: string;
  bunker_info: string;
  layout: BunkerLayout;
}

export interface ScheduledEvent {
  event_id: string;
  trigger_month: number;
  context: Record<string, unknown>;
}

export interface OutcomeEffectChip {
  text: string;
  tone: 'good' | 'bad' | 'neutral';
}

export interface OutcomeOdds {
  chance: number;
  tone: 'good' | 'bad' | 'neutral';
  effects?: OutcomeEffectChip[];
  guaranteed?: boolean;
}

export interface EventOption {
  id: string;
  label: string;
  description?: string | null;
  requires?: ('player' | 'item' | 'profession')[];
  odds?: OutcomeOdds[];
  odds_scaled?: {
    good_tone: OutcomeOdds['tone'];
    bad_tone: OutcomeOdds['tone'];
    success_effects?: OutcomeEffectChip[];
    fail_effects?: OutcomeEffectChip[];
  };
}

export interface GameEvent {
  id: string;
  title: string;
  description: string;
  event_type?: 'flavor' | 'choice' | 'food_replenish';
  participants?: string[];
  participant_ids?: string[];
  options?: EventOption[];
  select?: {
    kind: 'player' | 'item' | 'profession' | null;
    kinds?: ('player' | 'item' | 'profession')[];
    prompt?: string | null;
    prompt_item?: string | null;
    prompt_profession?: string | null;
  };
}

export interface PackMeta {
  name: string;
  author: string;
  color: string;
}

export interface PackSettings {
  bunker_life: {
    month_duration_ms: number;
    food_consumption_per_player: number;
  };
  events: {
    bunker_event_chance: number;
    success_chances: {
      one_resource: number;
      two_resources: number;
      three_plus_resources: number;
    };
    food_replenish: {
      food_per_resource: number;
    };
  };
  characters: {
    height: {
      min: number;
      max: number;
      female_height_offset: number;
      age_curves: Array<{
        max_age: number | null;
        mean: number;
        std: number;
      }>;
    };
    health_randomize_worse_chance: number;
  };
  bunker_generation: {
    max_empty_fraction: number;
    max_extra_items: number;
  };
}

export interface PackListing {
  id: string;
  meta: PackMeta;
}

export interface PackStatsSection {
  id: string;
  label: string;
  count: number;
  group: string;
}

export interface PackStats {
  id: string;
  meta: PackMeta;
  summary: {
    total_entries: number;
    config_files: number;
    section_groups: number;
  };
  sections: PackStatsSection[];
}

export interface RoomState {
  room_code: string;
  admin_id: string;
  pack: string;
  pack_meta: PackMeta;
  pack_settings: PackSettings;
  status: GameStatus;
  spectator_count?: number;
  is_voting: boolean;
  round: number;
  bunker_capacity: number | null;
  current_month: number;
  total_months: number;
  food: number;
  food_max: number;
  active_event: GameEvent | null;
  choice_votes: Record<string, string>;
  choice_pending_selection: string | null;
  active_event_selection: EventSelection;
  scheduled_events: ScheduledEvent[];
  month_start_time: number | null;
  month_duration: number;
  confirmed_bunker_life: string[];
  resolve_confirmations: string[];
  outcome_confirmations: string[] | null;
  players: Player[];
  bunker: BunkerInfo | null;
  votes: Record<string, string>;
  voted_players: string[];
}

export interface RoomListing {
  room_code: string;
  player_count: number;
  status: GameStatus;
  spectator_count?: number;
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

export interface EventSelection {
  selected_player_id: string | null;
  selected_professions: string[];
  selected_items: SelectedItem[];
}

export type ServerMessage =
  | { type: 'room_state'; data: RoomState }
  | { type: 'joined'; token: string; player_id: string; room_code: string }
  | { type: 'spectating'; spectator_id: string; room_code: string }
  | { type: 'error'; message: string }
  | { type: 'pong' }
  | { type: 'attribute_revealed'; player_id: string; attribute: AttributeKey; value: AttributeValue }
  | { type: 'vote_confirmed' }
  | { type: 'voting_result'; eliminated: Player | null; is_tie: boolean; votes: Record<string, number> }
  | { type: 'game_ended'; winner: Player | null; from_bunker_life?: boolean; survived?: boolean }
  | { type: 'player_disconnected'; player_id: string }
  | { type: 'player_reconnected'; player_id: string }
  | { type: 'admin_changed'; new_admin_id: string }
  | { type: 'profession_ability_used'; message: string }
  | { type: 'ready_for_bunker_life'; capacity: number; active_count: number }
  | { type: 'event_resolved'; event_id: string; outcome: string; message?: string | null; health_changes?: VitalChange[]; sanity_changes?: VitalChange[]; status_changes?: StatusChange[]; food_change?: number; players_killed?: PlayerRef[]; room_changed?: boolean; players_added?: Player[]; item_changes?: ItemChange[] }
  | { type: 'monthly_report'; health_changes?: VitalChange[]; sanity_changes?: VitalChange[]; status_changes?: StatusChange[]; players_killed?: PlayerRef[] };

/** Minimal player reference used in event/report payloads ({ id, name }). */
export interface PlayerRef {
  id: string;
  name: string;
}

export interface VitalChange {
  id: string;
  name: string;
  delta: number;
}

export interface StatusChange {
  id: string;
  name: string;
  status?: VitalStatusEffect;
  status_id?: string;
  action: 'added' | 'cleared';
}

export interface ItemChange {
  id?: string;
  name?: string;
  item: string;
  quantity?: number;
  action: 'given' | 'removed' | 'bunker_added' | 'bunker_removed';
}

/** A resolved event's result, surfaced by the outcome modal (mirrors the
 *  `event_resolved` server message, without the discriminant). */
export interface EventOutcome {
  outcome: string;
  message?: string | null;
  health_changes?: VitalChange[];
  sanity_changes?: VitalChange[];
  status_changes?: StatusChange[];
  food_change?: number;
  event_id?: string;
  players_killed?: PlayerRef[];
  room_changed?: boolean;
  players_added?: PlayerRef[];
  item_changes?: ItemChange[];
}

/** A passive monthly tick summary, shown as a transient snackbar. */
export interface MonthlyNotice {
  health_changes?: VitalChange[];
  sanity_changes?: VitalChange[];
  status_changes?: StatusChange[];
  players_killed?: PlayerRef[];
}

export type ClientMessage =
  | { type: 'join'; nickname: string; room_code?: string; pack?: string }
  | { type: 'rejoin'; token: string }
  | { type: 'spectate'; room_code: string }
  | { type: 'ping' }
  | { type: 'start_game' }
  | { type: 'reveal_attribute'; attribute: AttributeKey }
  | { type: 'reveal_all' }
  | { type: 'start_voting' }
  | { type: 'cancel_voting' }
  | { type: 'submit_vote'; target_id: string }
  | { type: 'end_game' }
  | { type: 'kick_player'; player_id: string }
  | { type: 'admin_reveal_player_attribute'; player_id: string; attribute: AttributeKey }
  | { type: 'admin_reveal_player_attributes'; player_id: string; attributes: AttributeKey[] }
  | { type: 'admin_reveal_player_all'; player_id: string }
  | { type: 'admin_reveal_all_players' }
  | { type: 'force_start_bunker_life' }
  | { type: 'use_profession_ability'; target_id?: string; second_target_id?: string }
  | { type: 'confirm_bunker_life' }
  | { type: 'update_event_selection'; selected_player_id?: string | null; selected_professions: string[]; selected_items: SelectedItem[] }
  | { type: 'cast_choice_vote'; option_id: string }
  | { type: 'confirm_choice_selection' }
  | { type: 'cancel_choice_selection' }
  | { type: 'resolve_event'; selected_player_id?: string | null; selected_professions: string[]; selected_items: SelectedItem[] }
  | { type: 'confirm_outcome' };
