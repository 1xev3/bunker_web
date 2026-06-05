// Wire-format serialization for a GameRoom. Kept separate from the entity so the
// room owns only its state and behavior, while the shape sent to clients (the
// per-viewer snapshot consumed by the client reducer) lives in one place.
const { wsManager } = require('../../state');

// Builds the per-viewer room snapshot. `viewerId` controls what each player is
// allowed to see (delegated to Player.toDict); pass null for a full view.
function serializeRoom(room, viewerId = null) {
  const publicEvent = room.activeEvent
    ? Object.fromEntries(Object.entries(room.activeEvent).filter(([key]) => !key.startsWith('__')))
    : null;
  return {
    room_code: room.roomCode,
    admin_id: room.adminId,
    pack: room.packName,
    pack_meta: room.config.packMeta ?? { name: room.packName, author: '', color: '#f59e0b' },
    pack_settings: room.config.packSettings,
    status: room.status,
    spectator_count: wsManager.spectatorCount(room.roomCode),
    is_voting: room.isVoting,
    round: room.round,
    bunker_capacity: room.bunkerCapacity,
    current_month: room.currentMonth,
    total_months: room.totalMonths,
    food: room.food,
    food_max: room.foodMax,
    active_event: publicEvent,
    choice_votes: { ...room.choiceVotes },
    choice_pending_selection: room.choicePendingSelection ?? null,
    active_event_selection: {
      selected_player_id: room.activeEventSelection.selected_player_id ?? null,
      selected_professions: [...room.activeEventSelection.selected_professions],
      selected_items: room.activeEventSelection.selected_items.map(item => ({ ...item })),
    },
    month_start_time: room.monthStartTime,
    month_duration: room.monthDuration,
    confirmed_bunker_life: [...room.confirmedBunkerLife],
    resolve_confirmations: [...room.resolveConfirmations],
    outcome_confirmations: room.outcomeConfirmations ? [...room.outcomeConfirmations] : null,
    scheduled_events: room.scheduledEvents,
    players: room.players.map(p => p.toDict(viewerId)),
    bunker: room.status !== 'waiting' ? room.bunker.toDict() : null,
    votes: room.isVoting ? { ...room.votes } : {},
    voted_players: [...room.votedPlayers],
  };
}

module.exports = { serializeRoom };
