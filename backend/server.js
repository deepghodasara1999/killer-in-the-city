const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.get('/health', (_, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ─── State ────────────────────────────────────────────────────────────────────
let rooms = {};          // roomId → room
let socketToRoom = {};   // socketId → { roomId, playerId }

// ─── Phrase banks ─────────────────────────────────────────────────────────────
const PHRASES = {
  KILLER: [
    "Who disappears tonight?","Choose a target.","Eliminate someone.",
    "Select a victim.","Who is next?","The city needs a sacrifice.",
    "Silence someone.","Make your move.","Pick a player to remove.",
    "Who survives no longer?","End someone's story.","Tonight's hit is…",
    "The killer chooses…","Who goes away?","Remove a citizen."
  ],
  ANGEL: [
    "Who needs protection?","Save someone tonight.","Shield a player.",
    "Guardian's choice.","Who stays alive?","Protect a life.",
    "Cast your shield.","Defend a citizen.","Who will you save?",
    "Prevent a tragedy.","Safety for whom?","Keep someone safe.",
    "The angel watches…","Shield target…","Save a soul."
  ],
  DETECTIVE: [
    "Who do you suspect?","Identify the killer.","Search for the truth.",
    "Who is guilty?","Investigate a player.","Find the murderer.",
    "Check a suspect.","Reveal the identity.","The detective looks at…",
    "Whose role to see?","Expose the killer.","Point the finger.",
    "The search begins with…","Inspect someone.","Are they the one?"
  ],
};

const CITIZEN_QS = [
  { q: "7 × 8 = ?",                opts: ["54","56","58","64"] },
  { q: "Capital of France?",        opts: ["Berlin","Madrid","Paris","Rome"] },
  { q: "Which planet is the Red Planet?", opts: ["Venus","Mars","Jupiter","Saturn"] },
  { q: "Chemical symbol for water?", opts: ["H2O","CO2","O2","H2"] },
  { q: "12 + 15 = ?",               opts: ["25","27","28","30"] },
  { q: "Largest ocean on Earth?",   opts: ["Atlantic","Indian","Arctic","Pacific"] },
  { q: "How many sides does a hexagon have?", opts: ["5","6","7","8"] },
  { q: "Capital of Japan?",         opts: ["Beijing","Seoul","Tokyo","Bangkok"] },
  { q: "Who wrote Romeo & Juliet?", opts: ["Dickens","Shakespeare","Austen","Twain"] },
  { q: "3 × 3 × 3 = ?",            opts: ["9","18","27","81"] },
  { q: "Fastest land animal?",      opts: ["Lion","Cheetah","Horse","Ostrich"] },
  { q: "How many continents?",      opts: ["5","6","7","8"] },
  { q: "Boiling point of water (°C)?", opts: ["90","95","100","110"] },
  { q: "Capital of Australia?",     opts: ["Sydney","Melbourne","Brisbane","Canberra"] },
  { q: "Square root of 144?",       opts: ["10","11","12","14"] },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Send each player only what they're allowed to see.
 * Roles are NEVER sent to other players during active play.
 */
function broadcastRoom(roomId) {
  const r = rooms[roomId];
  if (!r) return;

  r.players.forEach(player => {
    const s = io.sockets.sockets.get(player.socketId);
    if (!s) return;

    // Build a sanitised player list: hide other players' roles during play
    const sanitisedPlayers = r.players.map(p => {
      const safe = {
        id: p.id,
        socketId: p.socketId,
        name: p.name,
        avatar: p.avatar,
        alive: p.alive,
        seat: p.seat,
        score: p.score,
        connected: p.connected,
      };
      // Only reveal roles when game is over (WINNER) or it's the player themselves
      if (p.id === player.id || r.status === 'WINNER') {
        safe.role = p.role;
      } else {
        safe.role = null;
      }
      return safe;
    });

    // Build night action state visible to this player
    const myActions = {};
    if (r.nightActions) {
      // Only tell player if THEY submitted
      const me = r.players.find(p => p.id === player.id);
      if (me && r.nightActions[me.role] !== undefined) {
        myActions.submitted = true;
      }
    }

    s.emit('roomUpdate', {
      id: r.id,
      hostId: r.hostId,
      status: r.status,
      players: sanitisedPlayers,
      config: r.config,
      logs: r.logs,
      timer: r.timer,
      round: r.round,
      sessionNumber: r.sessionNumber,
      votingResults: r.status === 'VOTING_RESULT' || r.status === 'WINNER' ? r.votingResults : null,
      myActions,
      // Night question phrase — only relevant role sees the right phrase
      phrase: (() => {
        const me = r.players.find(p => p.id === player.id);
        if (!me || !me.alive) return null;
        if (r.status !== 'NIGHT') return null;
        if (me.role === 'KILLER') return { text: r.phrases?.KILLER, type: 'action' };
        if (me.role === 'ANGEL') return { text: r.phrases?.ANGEL, type: 'action' };
        if (me.role === 'DETECTIVE') return { text: r.phrases?.DETECTIVE, type: 'action' };
        return { text: r.citQ?.q, opts: r.citQ?.opts, type: 'citizen' };
      })(),
    });
  });
}

function clearRoomTimer(roomId) {
  const r = rooms[roomId];
  if (r && r._interval) {
    clearInterval(r._interval);
    r._interval = null;
  }
}

function runTimer(roomId, seconds, onExpire) {
  clearRoomTimer(roomId);
  const r = rooms[roomId];
  if (!r) return;
  r.timer = seconds;
  broadcastRoom(roomId);

  r._interval = setInterval(() => {
    const room = rooms[roomId];
    if (!room) { clearInterval(r._interval); return; }
    room.timer = Math.max(0, room.timer - 1);
    broadcastRoom(roomId);
    if (room.timer <= 0) {
      clearRoomTimer(roomId);
      onExpire(roomId);
    }
  }, 1000);
}

// ─── Night resolution ─────────────────────────────────────────────────────────
function resolveNight(roomId) {
  const r = rooms[roomId];
  const acts = r.nightActions || {};
  let deaths = [];

  // Step 1: Detective
  const detective = r.players.find(p => p.role === 'DETECTIVE' && p.alive);
  if (detective && acts['DETECTIVE'] && acts['DETECTIVE'] !== 'NOT_SURE') {
    const guessed = r.players.find(p => p.id === acts['DETECTIVE']);
    if (guessed && guessed.role === 'KILLER') {
      return finish(roomId, 'CITY_WIN_DET', 'Detective identified the Killer! City wins!');
    } else {
      // Wrong guess — detective dies, cannot be saved
      detective.alive = false;
      deaths.push(detective.name);
    }
  }

  // Step 2: Killer attack + Angel save
  const killerTarget = acts['KILLER'];
  const angelTarget = acts['ANGEL'];
  if (killerTarget && killerTarget !== angelTarget) {
    const target = r.players.find(p => p.id === killerTarget && p.alive);
    if (target) {
      target.alive = false;
      deaths.push(target.name);
    }
  }

  // Build result message
  if (deaths.length === 0) {
    r.logs = 'No one was killed tonight. Find the killer!';
  } else {
    r.logs = `${deaths.join(' and ')} died. Find the killer!`;
  }

  // Check win after night
  if (!checkWin(roomId)) {
    startDiscussion(roomId);
  }
}

function checkWin(roomId) {
  const r = rooms[roomId];
  const killerAlive = r.players.find(p => p.role === 'KILLER' && p.alive);
  const othersAlive = r.players.filter(p => p.role !== 'KILLER' && p.alive).length;

  if (!killerAlive) {
    finish(roomId, 'CITY_WIN_VOTE', 'Killer eliminated! City wins!');
    return true;
  }
  if (othersAlive <= 1) {
    finish(roomId, 'KILLER_WIN', 'Killer took control of the city!');
    return true;
  }
  return false;
}

function startNight(roomId) {
  const r = rooms[roomId];
  if (!r) return;
  r.status = 'NIGHT';
  r.nightActions = {};
  r.votes = {};
  r.votingResults = null;
  r.round = (r.round || 0) + 1;
  r.phrases = {
    KILLER: pick(PHRASES.KILLER),
    ANGEL: pick(PHRASES.ANGEL),
    DETECTIVE: pick(PHRASES.DETECTIVE),
  };
  r.citQ = pick(CITIZEN_QS);
  r.logs = `Round ${r.round} — Night falls on the city…`;

  broadcastRoom(roomId);

  // Auto-submit after question time expires
  runTimer(roomId, r.config.questionTime, (rid) => {
    const room = rooms[rid];
    if (!room) return;
    // Auto-fill missing submissions
    const alivePlayers = room.players.filter(p => p.alive);
    const killer = alivePlayers.find(p => p.role === 'KILLER');
    const angel = alivePlayers.find(p => p.role === 'ANGEL');
    const detective = alivePlayers.find(p => p.role === 'DETECTIVE');
    const validTargets = alivePlayers.filter(p => p.role !== 'KILLER').map(p => p.id);

    if (killer && !room.nightActions['KILLER'] && validTargets.length > 0) {
      room.nightActions['KILLER'] = pick(validTargets);
    }
    if (angel && !room.nightActions['ANGEL']) {
      room.nightActions['ANGEL'] = pick(alivePlayers.map(p => p.id));
    }
    if (detective && !room.nightActions['DETECTIVE']) {
      room.nightActions['DETECTIVE'] = 'NOT_SURE';
    }
    resolveNight(rid);
  });
}

function startDiscussion(roomId) {
  const r = rooms[roomId];
  if (!r) return;
  r.status = 'DISCUSSION';
  broadcastRoom(roomId);
  runTimer(roomId, r.config.discussionTime, startVoting);
}

function startVoting(roomId) {
  const r = rooms[roomId];
  if (!r) return;
  r.status = 'VOTING';
  r.votes = {};
  broadcastRoom(roomId);
  runTimer(roomId, r.config.votingTime, resolveVoting);
}

function resolveVoting(roomId) {
  const r = rooms[roomId];
  if (!r) return;
  clearRoomTimer(roomId);

  const counts = {};
  Object.values(r.votes).forEach(id => { counts[id] = (counts[id] || 0) + 1; });

  // Build voting results for display
  r.votingResults = r.players.map(p => ({
    id: p.id,
    name: p.name,
    votes: counts[p.id] || 0,
    voters: Object.entries(r.votes)
      .filter(([, tid]) => tid === p.id)
      .map(([vid]) => { const voter = r.players.find(pl => pl.id === vid); return voter?.name || '?'; }),
  })).filter(p => p.votes > 0);

  let max = 0, topId = null, tie = false;
  for (const [id, cnt] of Object.entries(counts)) {
    if (cnt > max) { max = cnt; topId = id; tie = false; }
    else if (cnt === max) { tie = true; }
  }

  r.status = 'VOTING_RESULT';

  if (tie || !topId) {
    r.logs = "City couldn't reach a consensus. No one was eliminated.";
    broadcastRoom(roomId);
    runTimer(roomId, r.config.resultDuration, startNight);
    return;
  }

  const eliminated = r.players.find(p => p.id === topId);
  if (eliminated) {
    eliminated.alive = false;
    if (eliminated.role === 'KILLER') {
      r.logs = `City eliminated ${eliminated.name}. City wins!`;
      broadcastRoom(roomId);
      setTimeout(() => finish(roomId, 'CITY_WIN_VOTE', `City identified the Killer!`), 1500);
      return;
    } else {
      r.logs = `City eliminated ${eliminated.name}.`;
    }
  }

  broadcastRoom(roomId);

  if (!checkWin(roomId)) {
    runTimer(roomId, r.config.resultDuration, startNight);
  }
}

function finish(roomId, outcome, reason) {
  const r = rooms[roomId];
  if (!r) return;
  clearRoomTimer(roomId);
  r.status = 'WINNER';
  r.logs = reason;
  r.outcome = outcome;

  // Award scores
  r.players.forEach(p => {
    if (outcome === 'KILLER_WIN' && p.role === 'KILLER') p.score += 2;
    if (outcome === 'CITY_WIN_DET' && p.role === 'DETECTIVE') p.score += 2;
    if ((outcome === 'CITY_WIN_VOTE' || outcome === 'CITY_WIN_DET') && p.role !== 'KILLER' && p.alive) p.score += 1;
  });

  broadcastRoom(roomId);
}

// ─── Socket handlers ──────────────────────────────────────────────────────────
io.on('connection', (socket) => {

  // ── Create room ──
  socket.on('createRoom', ({ name }) => {
    if (!name || !name.trim()) return socket.emit('joinError', 'Please enter your name.');
    const roomId = generateCode();
    const playerId = `p_${socket.id}`;

    rooms[roomId] = {
      id: roomId,
      hostId: playerId,
      status: 'LOBBY',
      players: [{
        id: playerId,
        socketId: socket.id,
        name: name.trim(),
        avatar: 1,
        score: 0,
        alive: true,
        role: null,
        seat: null,
        connected: true,
      }],
      config: {
        discussionTime: 150,
        votingTime: 30,
        questionTime: 20,
        resultDuration: 10,
        detectiveMode: 'ALWAYS',
      },
      nightActions: {},
      votes: {},
      votingResults: null,
      logs: 'Waiting for players to join…',
      timer: 0,
      round: 0,
      sessionNumber: 0,
      _interval: null,
    };

    socketToRoom[socket.id] = { roomId, playerId };
    socket.join(roomId);
    broadcastRoom(roomId);
    socket.emit('joined', { roomId, playerId });
  });

  // ── Join room ──
  socket.on('joinRoom', ({ roomId, name }) => {
    if (!name || !name.trim()) return socket.emit('joinError', 'Please enter your name.');
    if (!roomId || !roomId.trim()) return socket.emit('joinError', 'Please enter the game code.');

    const r = rooms[roomId];
    if (!r) return socket.emit('joinError', 'Game not found. Check the code and try again.');
    if (r.status !== 'LOBBY') return socket.emit('joinError', 'Game already started.');
    if (r.players.length >= 25) return socket.emit('joinError', 'Room is full (max 25 players).');

    const playerId = `p_${socket.id}`;
    const avatar = r.players.length + 1;

    r.players.push({
      id: playerId,
      socketId: socket.id,
      name: name.trim(),
      avatar,
      score: 0,
      alive: true,
      role: null,
      seat: null,
      connected: true,
    });

    socketToRoom[socket.id] = { roomId, playerId };
    socket.join(roomId);
    broadcastRoom(roomId);
    socket.emit('joined', { roomId, playerId });
  });

  // ── Reconnect (player refreshed) ──
  socket.on('reconnect', ({ roomId, playerId }) => {
    const r = rooms[roomId];
    if (!r) return socket.emit('joinError', 'Game no longer exists.');

    const player = r.players.find(p => p.id === playerId);
    if (!player) return socket.emit('joinError', 'Could not find your player in this game.');

    // Update socket reference
    const oldSocketId = player.socketId;
    player.socketId = socket.id;
    player.connected = true;

    // Update socketToRoom map
    delete socketToRoom[oldSocketId];
    socketToRoom[socket.id] = { roomId, playerId };

    // If player was host, update host socket
    socket.join(roomId);
    broadcastRoom(roomId);
    socket.emit('joined', { roomId, playerId });
  });

  // ── Seat assignment ──
  socket.on('assignSeat', ({ roomId, playerId, seatIdx }) => {
    const r = rooms[roomId];
    const info = socketToRoom[socket.id];
    if (!r || !info || r.hostId !== info.playerId) return;
    const p = r.players.find(pl => pl.id === playerId);
    if (p) p.seat = seatIdx;
    broadcastRoom(roomId);
  });

  // ── Update config ──
  socket.on('updateConfig', ({ roomId, config }) => {
    const r = rooms[roomId];
    const info = socketToRoom[socket.id];
    if (!r || !info || r.hostId !== info.playerId) return;
    r.config = { ...r.config, ...config };
    broadcastRoom(roomId);
  });

  // ── Start session ──
  socket.on('startSession', ({ roomId }) => {
    const r = rooms[roomId];
    const info = socketToRoom[socket.id];
    if (!r || !info || r.hostId !== info.playerId) return;
    if (r.players.length < 4) return socket.emit('joinError', 'Need at least 4 players to start.');

    r.sessionNumber = (r.sessionNumber || 0) + 1;
    r.round = 0;

    // Assign roles
    const shuffled = [...r.players].sort(() => Math.random() - 0.5);
    shuffled.forEach(p => { p.role = 'CITIZEN'; p.alive = true; });
    shuffled[0].role = 'KILLER';
    shuffled[1].role = 'ANGEL';

    const useDetective = r.config.detectiveMode === 'ALWAYS'
      ? r.players.length >= 6
      : r.players.length >= 6 && Math.random() > 0.5;

    if (useDetective) shuffled[2].role = 'DETECTIVE';

    r.status = 'ROLE_REVEAL';
    r.logs = `Session ${r.sessionNumber} — Roles assigned. Check your role!`;
    broadcastRoom(roomId);

    // Auto-advance from role reveal after 10s
    runTimer(roomId, 10, startNight);
  });

  // ── Night action ──
  socket.on('submitNightAction', ({ roomId, targetId }) => {
    const r = rooms[roomId];
    const info = socketToRoom[socket.id];
    if (!r || !info || r.status !== 'NIGHT') return;
    const me = r.players.find(p => p.id === info.playerId);
    if (!me || !me.alive) return;
    r.nightActions[me.role] = targetId;

    // Check if all active roles have submitted
    const alive = r.players.filter(p => p.alive);
    const needKiller = alive.some(p => p.role === 'KILLER');
    const needAngel = alive.some(p => p.role === 'ANGEL');
    const needDetective = alive.some(p => p.role === 'DETECTIVE');

    const allSubmitted =
      (!needKiller || r.nightActions['KILLER']) &&
      (!needAngel || r.nightActions['ANGEL']) &&
      (!needDetective || r.nightActions['DETECTIVE']);

    if (allSubmitted) {
      clearRoomTimer(roomId);
      resolveNight(roomId);
    } else {
      broadcastRoom(roomId); // update "submitted" state for the player
    }
  });

  // ── Vote ──
  socket.on('submitVote', ({ roomId, targetId }) => {
    const r = rooms[roomId];
    const info = socketToRoom[socket.id];
    if (!r || !info || r.status !== 'VOTING') return;
    const me = r.players.find(p => p.id === info.playerId);
    if (!me || !me.alive) return;
    // Only allow one vote
    if (r.votes[info.playerId]) return;
    r.votes[info.playerId] = targetId;

    // Check if all alive players voted
    const aliveIds = r.players.filter(p => p.alive).map(p => p.id);
    const allVoted = aliveIds.every(id => r.votes[id]);
    if (allVoted) {
      clearRoomTimer(roomId);
      resolveVoting(roomId);
    } else {
      broadcastRoom(roomId);
    }
  });

  // ── Host controls ──
  socket.on('pauseGame', ({ roomId }) => {
    const r = rooms[roomId];
    const info = socketToRoom[socket.id];
    if (!r || !info || r.hostId !== info.playerId) return;
    clearRoomTimer(roomId);
    r.paused = true;
    r.logs = 'Game paused by host.';
    broadcastRoom(roomId);
  });

  socket.on('resumeGame', ({ roomId }) => {
    const r = rooms[roomId];
    const info = socketToRoom[socket.id];
    if (!r || !info || r.hostId !== info.playerId) return;
    r.paused = false;
    r.logs = 'Game resumed.';
    if (r.status === 'DISCUSSION') runTimer(roomId, r.timer || r.config.discussionTime, startVoting);
    else if (r.status === 'VOTING') runTimer(roomId, r.timer || r.config.votingTime, resolveVoting);
    broadcastRoom(roomId);
  });

  socket.on('restartSession', ({ roomId }) => {
    const r = rooms[roomId];
    const info = socketToRoom[socket.id];
    if (!r || !info || r.hostId !== info.playerId) return;
    clearRoomTimer(roomId);
    socket.emit('startSession', { roomId }); // reuse logic
  });

  socket.on('startNextSession', ({ roomId }) => {
    const r = rooms[roomId];
    const info = socketToRoom[socket.id];
    if (!r || !info || r.hostId !== info.playerId) return;
    clearRoomTimer(roomId);
    // Keep scores, reset session state
    r.players.forEach(p => { p.alive = true; p.role = null; });
    socket.emit('startSession', { roomId });
  });

  socket.on('endGame', ({ roomId }) => {
    const r = rooms[roomId];
    const info = socketToRoom[socket.id];
    if (!r || !info || r.hostId !== info.playerId) return;
    clearRoomTimer(roomId);
    io.to(roomId).emit('gameEnded', { scores: r.players.map(p => ({ name: p.name, score: p.score, avatar: p.avatar })) });
    delete rooms[roomId];
  });

  socket.on('removePlayer', ({ roomId, playerId }) => {
    const r = rooms[roomId];
    const info = socketToRoom[socket.id];
    if (!r || !info || r.hostId !== info.playerId) return;
    r.players = r.players.filter(p => p.id !== playerId);
    // Cancel current session if in play
    if (r.status !== 'LOBBY') {
      clearRoomTimer(roomId);
      r.status = 'LOBBY';
      r.players.forEach(p => { p.alive = true; p.role = null; });
      r.logs = 'A player was removed. Session cancelled. Start a new session.';
    }
    broadcastRoom(roomId);
  });

  // ── Disconnect ──
  socket.on('disconnect', () => {
    const info = socketToRoom[socket.id];
    if (!info) return;
    const { roomId, playerId } = info;
    delete socketToRoom[socket.id];

    const r = rooms[roomId];
    if (!r) return;

    const player = r.players.find(p => p.id === playerId);
    if (player) player.connected = false;

    if (r.hostId === playerId) {
      // Host left — terminate game
      io.to(roomId).emit('hostLeft');
      clearRoomTimer(roomId);
      delete rooms[roomId];
    } else {
      // Non-host disconnected — mark them, give 30s grace
      r.logs = `${player?.name || 'A player'} disconnected.`;
      broadcastRoom(roomId);
    }
  });
});

server.listen(process.env.PORT || 4000, () => {
  console.log('Killer City backend running on port', process.env.PORT || 4000);
});
