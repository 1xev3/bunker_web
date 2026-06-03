const { randomUUID } = require('crypto');
const { Player, ATTRIBUTE_KEYS } = require('./player');
const Bunker = require('./bunker');
const { loadPack, getDefaultPackName } = require('../gameConfig');

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

class GameRoom {
  constructor(adminId, packName = getDefaultPackName()) {
    this.roomCode = generateRoomCode();
    this.adminId = adminId;
    this.packName = packName;
    this.config = loadPack(packName);
    this.status = 'waiting'; // waiting | running | bunker_life | finished
    this.players = [];
    this.bunker = new Bunker();
    this.votes = {};        // { voterId: targetId }
    this.votedPlayers = new Set();
    this.isVoting = false;
    this.round = 0;
    this.bunkerCapacity = null;
    this.currentMonth = 0;
    this.totalMonths = 0;
    this.food = 0;
    this.foodMax = 0;
    this.activeEvent = null;
    this.activeEventSelection = { selected_player_id: null, selected_professions: [], selected_items: [] };
    this.choiceVotes = {};
    this.choicePendingSelection = null; // option id awaiting the council's picker choice, or null
    this.monthStartTime = null;
    this.monthDuration = this.config.packSettings.bunker_life.month_duration_ms;
    this.confirmedBunkerLife = new Set(); // player IDs who confirmed start of bunker_life
    this.scheduledEvents = []; // [{ event_id, trigger_month, context }]
    this.resolveConfirmations = new Set(); // players who confirmed current event resolve
    this.outcomeConfirmations = null; // null | Set — players who confirmed outcome
    this.pendingOutcomeAction = null; // 'next_month' | 'month_tick_continue'
    this.flags = {};
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
  }

  touch() {
    this.lastActivity = Date.now();
  }

  addPlayer(player) {
    this.players.push(player);
    this.touch();
  }

  getPlayer(playerId) {
    return this.players.find(p => p.id === playerId) || null;
  }

  getActivePlayers() {
    return this.players.filter(p => p.is_active);
  }

  removePlayer(playerId) {
    const p = this.getPlayer(playerId);
    if (p) { p.is_active = false; return true; }
    return false;
  }

  addVote(voterId, targetId) {
    if (this.votedPlayers.has(voterId)) return false;
    this.votes[voterId] = targetId;
    this.votedPlayers.add(voterId);
    return true;
  }

  countVotes() {
    const result = {};
    for (const targetId of Object.values(this.votes)) {
      result[targetId] = (result[targetId] || 0) + 1;
    }
    return result;
  }

  resetVotes() {
    this.votes = {};
    this.votedPlayers = new Set();
  }

  revealAllPlayers() {
    for (const player of this.players) {
      player.revealAll();
    }
  }

  toDict(viewerId = null) {
    const publicEvent = this.activeEvent
      ? Object.fromEntries(Object.entries(this.activeEvent).filter(([key]) => !key.startsWith('__')))
      : null;
    return {
      room_code: this.roomCode,
      admin_id: this.adminId,
      pack: this.packName,
      pack_meta: this.config.packMeta ?? { name: this.packName, author: '', color: '#f59e0b' },
      pack_settings: this.config.packSettings,
      status: this.status,
      is_voting: this.isVoting,
      round: this.round,
      bunker_capacity: this.bunkerCapacity,
      current_month: this.currentMonth,
      total_months: this.totalMonths,
      food: this.food,
      food_max: this.foodMax,
      active_event: publicEvent,
      choice_votes: { ...this.choiceVotes },
      choice_pending_selection: this.choicePendingSelection ?? null,
      active_event_selection: {
        selected_player_id: this.activeEventSelection.selected_player_id ?? null,
        selected_professions: [...this.activeEventSelection.selected_professions],
        selected_items: this.activeEventSelection.selected_items.map(item => ({ ...item })),
      },
      month_start_time: this.monthStartTime,
      month_duration: this.monthDuration,
      confirmed_bunker_life: [...this.confirmedBunkerLife],
      resolve_confirmations: [...this.resolveConfirmations],
      outcome_confirmations: this.outcomeConfirmations ? [...this.outcomeConfirmations] : null,
      scheduled_events: this.scheduledEvents,
      players: this.players.map(p => p.toDict(viewerId)),
      bunker: this.status !== 'waiting' ? this.bunker.toDict() : null,
      votes: this.isVoting ? { ...this.votes } : {},
      voted_players: [...this.votedPlayers],
    };
  }
}

module.exports = GameRoom;
