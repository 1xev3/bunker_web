const { rooms, wsManager, pendingAdminTransfers } = require('../state');
const {
  handleJoin,
  handleRejoin,
  handleStartGame,
  handleRevealAttr,
  handleRevealAll,
  handleStartVoting,
  handleCancelVoting,
  handleVote,
  handleEndGame,
  handleKick,
  handleAdminRevealPlayerAttribute,
  handleAdminRevealPlayerAttributes,
  handleAdminRevealPlayerAll,
  handleAdminRevealAllPlayers,
  handleUseProfessionAbility,
  transferAdmin,
} = require('./gameHandlers');
const { handleConfirmBunkerLife, handleForceStartBunkerLife, handleUpdateEventSelection, handleResolveEvent, handleConfirmOutcome, handleCastChoiceVote, handleConfirmChoiceSelection, handleCancelChoiceSelection, handlePlayerMaybeUnblock } = require('./bunkerLifeHandlers');

const DEBUG_WS = process.env.DEBUG_WS !== '0';
function wsLog(...args) {
  if (DEBUG_WS) console.log('[ws]', ...args);
}

function setupWebSocket(wss) {
  wss.on('connection', (ws) => {
    let roomCode = null;
    let playerId = null;
    wsLog('connection opened (awaiting join/rejoin)');

    ws.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { wsLog('dropped non-JSON message'); return; }

      if (msg.type !== 'ping') wsLog(`recv type=${msg.type} room=${roomCode ?? '-'} player=${playerId ?? '-'}`);

      if (!playerId) {
        if (msg.type === 'join') {
          let result = null;
          try {
            result = handleJoin(ws, msg);
          } catch (error) {
            wsLog('join error:', error.message);
            ws.send(JSON.stringify({ type: 'error', message: error.message || 'Failed to join room' }));
            return;
          }
          if (!result) {
            wsLog('join rejected: room not found or already started');
            return ws.send(JSON.stringify({ type: 'error', message: 'Room not found or game already started' }));
          }
          ({ roomCode, playerId } = result);
          wsLog(`joined room=${roomCode} player=${playerId}`);
        } else if (msg.type === 'rejoin') {
          const result = handleRejoin(ws, msg);
          if (!result) {
            wsLog('rejoin rejected: invalid or expired token — closing socket');
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid or expired token' }));
            ws.close();
            return;
          }
          ({ roomCode, playerId } = result);
          wsLog(`rejoined room=${roomCode} player=${playerId}`);
        } else {
          wsLog(`rejected: first message was '${msg.type}', expected join/rejoin`);
          ws.send(JSON.stringify({ type: 'error', message: 'Send join or rejoin first' }));
        }
        return;
      }

      const room = rooms.get(roomCode);
      if (!room) { wsLog(`no room ${roomCode} for ${msg.type}`); return; }
      room.touch();

      switch (msg.type) {
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
        case 'start_game':            handleStartGame(roomCode, playerId); break;
        case 'reveal_attribute':      handleRevealAttr(roomCode, playerId, msg); break;
        case 'reveal_all':            handleRevealAll(roomCode, playerId); break;
        case 'start_voting':          handleStartVoting(roomCode, playerId); break;
        case 'cancel_voting':         handleCancelVoting(roomCode, playerId); break;
        case 'submit_vote':           handleVote(roomCode, playerId, msg); break;
        case 'end_game':              handleEndGame(roomCode, playerId); break;
        case 'kick_player':           handleKick(roomCode, playerId, msg); break;
        case 'admin_reveal_player_attribute': handleAdminRevealPlayerAttribute(roomCode, playerId, msg); break;
        case 'admin_reveal_player_attributes': handleAdminRevealPlayerAttributes(roomCode, playerId, msg); break;
        case 'admin_reveal_player_all': handleAdminRevealPlayerAll(roomCode, playerId, msg); break;
        case 'admin_reveal_all_players': handleAdminRevealAllPlayers(roomCode, playerId); break;
        case 'use_profession_ability': handleUseProfessionAbility(roomCode, playerId, msg); break;
        case 'confirm_bunker_life':   handleConfirmBunkerLife(roomCode, playerId); break;
        case 'force_start_bunker_life': handleForceStartBunkerLife(roomCode, playerId); break;
        case 'update_event_selection': handleUpdateEventSelection(roomCode, playerId, msg); break;
        case 'cast_choice_vote':      handleCastChoiceVote(roomCode, playerId, msg); break;
        case 'confirm_choice_selection': handleConfirmChoiceSelection(roomCode, playerId); break;
        case 'cancel_choice_selection': handleCancelChoiceSelection(roomCode, playerId); break;
        case 'resolve_event':         handleResolveEvent(roomCode, playerId, msg); break;
        case 'confirm_outcome':       handleConfirmOutcome(roomCode, playerId); break;
      }
    });

    ws.on('error', (err) => {
      wsLog(`socket error room=${roomCode ?? '-'} player=${playerId ?? '-'}:`, err.message);
    });

    ws.on('close', (code, reason) => {
      wsLog(`close room=${roomCode ?? '-'} player=${playerId ?? '-'} code=${code} reason=${reason || '-'}`);
      if (!roomCode || !playerId) return;
      wsManager.disconnect(roomCode, playerId);
      const room = rooms.get(roomCode);
      if (!room) return;

      if (wsManager.getConnected(roomCode).size === 0) {
        wsLog(`room ${roomCode} empty — deleting`);
        rooms.delete(roomCode);
        return;
      }

      wsManager.broadcast(roomCode, { type: 'player_disconnected', player_id: playerId });
      handlePlayerMaybeUnblock(roomCode, playerId);

      if (playerId === room.adminId) {
        const key = `${roomCode}:${playerId}`;
        const t = setTimeout(() => {
          pendingAdminTransfers.delete(key);
          transferAdmin(roomCode);
        }, 8000);
        pendingAdminTransfers.set(key, t);
      }
    });
  });
}

module.exports = setupWebSocket;
