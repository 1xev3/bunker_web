const { randomUUID } = require('crypto');
const { Player, ATTRIBUTE_KEYS } = require('./player');
const Bunker = require('./bunker');
const { loadPack, getDefaultPackName } = require('../gameConfig');
const { serializeRoom } = require('./roomSerializer');

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

  // Hands out secret role-play goals to a random subset of players, per the
  // pack's SecretGoals config. Goals are cosmetic and never repeat within a game.
  assignSecretGoals() {
    const cfg = this.config.secretGoals;
    if (!cfg || cfg.goals.length === 0) return;

    const players = [...this.players];
    const byPercent = cfg.percent != null ? Math.round(cfg.percent * players.length) : 0;
    const target = Math.min(
      players.length,
      cfg.goals.length,
      cfg.percent != null ? byPercent : cfg.count
    );
    if (target <= 0) return;

    // Shuffle players and goals, then pair the first `target` of each.
    for (const pool of [players]) {
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
    }
    const goals = [...cfg.goals];
    for (let i = goals.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [goals[i], goals[j]] = [goals[j], goals[i]];
    }

    for (let i = 0; i < target; i++) {
      players[i].secret_goal = goals[i];
    }
  }

  revealAllPlayers() {
    for (const player of this.players) {
      player.revealAll();
    }
  }

  toDict(viewerId = null) {
    return serializeRoom(this, viewerId);
  }
}

module.exports = GameRoom;
