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

let rooms = {};
let socketToRoom = {};

// ─── Phrase banks ────────────────────────────────────────────────────────────
const PHRASES = {
  KILLER: [
    "Who disappears tonight?","Choose a target.","Eliminate someone.",
    "Select a victim.","Who is next?","The city needs a sacrifice.",
    "Silence someone.","Make your move.","Pick a player to remove.",
    "Who survives no longer?","End someone's story.","Tonight's hit is…",
    "The killer chooses…","Who goes away?","Remove a citizen.",
  ],
  ANGEL: [
    "Who needs protection?","Save someone tonight.","Shield a player.",
    "Guardian's choice.","Who stays alive?","Protect a life.",
    "Cast your shield.","Defend a citizen.","Who will you save?",
    "Prevent a tragedy.","Safety for whom?","Keep someone safe.",
    "The angel watches…","Shield target…","Save a soul.",
  ],
  DETECTIVE: [
    "Who do you suspect?","Identify the killer.","Search for the truth.",
    "Who is guilty?","Investigate a player.","Find the murderer.",
    "Check a suspect.","Reveal the identity.","The detective looks at…",
    "Whose role to see?","Expose the killer.","Point the finger.",
    "The search begins with…","Inspect someone.","Are they the one?",
  ],
};

const CITIZEN_QS = [
  { q:"7 × 8 = ?",                        opts:["54","56","58","64"] },
  { q:"Capital of France?",                opts:["Berlin","Madrid","Paris","Rome"] },
  { q:"Red Planet?",                       opts:["Venus","Mars","Jupiter","Saturn"] },
  { q:"Chemical symbol for water?",        opts:["H2O","CO2","O2","H2"] },
  { q:"12 + 15 = ?",                       opts:["25","27","28","30"] },
  { q:"Largest ocean?",                    opts:["Atlantic","Indian","Arctic","Pacific"] },
  { q:"Sides of a hexagon?",               opts:["5","6","7","8"] },
  { q:"Capital of Japan?",                 opts:["Beijing","Seoul","Tokyo","Bangkok"] },
  { q:"Who wrote Romeo & Juliet?",         opts:["Dickens","Shakespeare","Austen","Twain"] },
  { q:"3 × 3 × 3 = ?",                    opts:["9","18","27","81"] },
  { q:"Fastest land animal?",              opts:["Lion","Cheetah","Horse","Ostrich"] },
  { q:"How many continents?",              opts:["5","6","7","8"] },
  { q:"Boiling point of water (°C)?",      opts:["90","95","100","110"] },
  { q:"Capital of Australia?",             opts:["Sydney","Melbourne","Brisbane","Canberra"] },
  { q:"√144 = ?",                          opts:["10","11","12","14"] },
  { q:"Largest planet?",                   opts:["Saturn","Neptune","Jupiter","Uranus"] },
  { q:"Bones in the adult body?",          opts:["196","206","216","226"] },
  { q:"Speed of light (km/s)?",            opts:["200k","300k","400k","500k"] },
  { q:"Currency of Japan?",                opts:["Won","Yuan","Rupee","Yen"] },
  { q:"Legs on a spider?",                 opts:["6","8","10","12"] },
  { q:"Longest river?",                    opts:["Amazon","Congo","Nile","Yangtze"] },
  { q:"Symbol for gold?",                  opts:["Go","Gd","Au","Ag"] },
  { q:"Piano keys?",                       opts:["76","80","86","88"] },
  { q:"Capital of Brazil?",                opts:["São Paulo","Rio","Brasília","Salvador"] },
  { q:"Hours in 3 days?",                  opts:["60","66","72","80"] },
  { q:"Gas plants absorb?",                opts:["O₂","N₂","CO₂","H₂"] },
  { q:"Human chromosomes?",               opts:["44","46","48","52"] },
  { q:"Smallest country?",                 opts:["Monaco","San Marino","Liechtenstein","Vatican City"] },
  { q:"Strings on a guitar?",              opts:["4","5","6","7"] },
  { q:"Capital of Canada?",                opts:["Toronto","Vancouver","Montreal","Ottawa"] },
  { q:"Human ribs?",                       opts:["20","22","24","26"] },
  { q:"Which planet has rings?",           opts:["Mars","Neptune","Saturn","Uranus"] },
  { q:"25% of 200 = ?",                    opts:["40","50","60","75"] },
  { q:"Lightest element?",                 opts:["Helium","Oxygen","Hydrogen","Carbon"] },
  { q:"Everest is in?",                    opts:["India","Tibet","Nepal","Bhutan"] },
  { q:"Planets in solar system?",          opts:["7","8","9","10"] },
  { q:"Universal blood donor type?",       opts:["A","B","AB","O"] },
  { q:"Largest continent?",               opts:["Africa","Antarctica","Asia","N. America"] },
  { q:"WWII ended in?",                    opts:["1943","1944","1945","1946"] },
  { q:"6² + 8² = ?",                      opts:["100","102","96","110"] },
  { q:"Capital of Germany?",              opts:["Munich","Hamburg","Frankfurt","Berlin"] },
  { q:"Deepest ocean trench?",            opts:["Java","Puerto Rico","Mariana","Tonga"] },
  { q:"Inventor of telephone?",           opts:["Edison","Tesla","Bell","Marconi"] },
  { q:"Adult human teeth?",               opts:["28","30","32","34"] },
  { q:"Coldest continent?",               opts:["Arctic","Antarctica","Asia","N. America"] },
  { q:"Symbol for silver?",               opts:["Si","Sv","Ag","Al"] },
  { q:"Earth to Moon (km)?",              opts:["284k","384k","484k","584k"] },
  { q:"First iPhone year?",               opts:["2005","2006","2007","2008"] },
  { q:"Area of a circle?",                opts:["2πr","πr²","πd","2πd"] },
  { q:"Highest mountain?",                opts:["K2","Kangchenjunga","Everest","Lhotse"] },
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function generateCode() { return Math.floor(100000 + Math.random() * 900000).toString(); }

// ─── broadcastRoom ───────────────────────────────────────────────────────────
function broadcastRoom(roomId) {
  const r = rooms[roomId];
  if (!r) return;

  r.players.forEach(player => {
    const s = io.sockets.sockets.get(player.socketId);
    if (!s) return;

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
      safe.role = (p.id === player.id || r.status === 'WINNER') ? p.role : null;
      return safe;
    });

    // Has this player submitted their night action?
    const myActions = {};
    if (r.nightActions) {
      const me = r.players.find(p => p.id === player.id);
      if (me) {
        const key = me.role === 'CITIZEN' ? `CIT_${me.id}` : me.role;
        if (r.nightActions[key] !== undefined) myActions.submitted = true;
      }
    }

    // Phase-specific phrase for this player
    let phrase = null;
    if (r.status === 'NIGHT') {
      const me = r.players.find(p => p.id === player.id);
      if (me && me.alive) {
        if      (me.role === 'KILLER')    phrase = { text: r.phrases?.KILLER,    type: 'action' };
        else if (me.role === 'ANGEL')     phrase = { text: r.phrases?.ANGEL,     type: 'action' };
        else if (me.role === 'DETECTIVE') phrase = { text: r.phrases?.DETECTIVE, type: 'action' };
        else phrase = { text: r.citQ?.q, opts: r.citQ?.opts, type: 'citizen' };
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
      maxTimer: r.maxTimer,
      round: r.round,
      sessionNumber: r.sessionNumber,
      votingResults: (r.status === 'VOTING_RESULT' || r.status === 'WINNER') ? r.votingResults : null,
      outcome: r.status === 'WINNER' ? r.outcome : null,
      myActions,
      phrase,
    });
  });
}

function clearRoomTimer(roomId) {
  const r = rooms[roomId];
  if (r?._interval) { clearInterval(r._interval); r._interval = null; }
}

// runTimer: sets maxTimer once, ticks down, emits lightweight tick every second
function runTimer(roomId, seconds, onExpire) {
  clearRoomTimer(roomId);
  const r = rooms[roomId];
  if (!r) return;
  r.timer = seconds;
  r.maxTimer = seconds;
  broadcastRoom(roomId);

  r._interval = setInterval(() => {
    const room = rooms[roomId];
    if (!room) { clearInterval(r._interval); return; }
    room.timer = Math.max(0, room.timer - 1);
    // Lightweight tick — avoids sending full state every second
    io.to(roomId).emit('tick', { timer: room.timer, maxTimer: room.maxTimer });
    if (room.timer <= 0) {
      clearRoomTimer(roomId);
      onExpire(roomId);
    }
  }, 1000);
}

// ─── Game flow ───────────────────────────────────────────────────────────────
function assignRoles(r) {
  const shuffled = [...r.players].sort(() => Math.random() - 0.5);
  shuffled.forEach(p => { p.role = 'CITIZEN'; p.alive = true; });
  shuffled[0].role = 'KILLER';
  shuffled[1].role = 'ANGEL';
  if (r.players.length >= 6) shuffled[2].role = 'DETECTIVE';
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
    KILLER:    pick(PHRASES.KILLER),
    ANGEL:     pick(PHRASES.ANGEL),
    DETECTIVE: pick(PHRASES.DETECTIVE),
  };
  r.citQ = pick(CITIZEN_QS);
  r.logs = `Round ${r.round} — Night falls…`;
  broadcastRoom(roomId);

  runTimer(roomId, r.config.questionTime, rid => {
    const room = rooms[rid];
    if (!room) return;
    const alive = room.players.filter(p => p.alive);
    const validT = alive.filter(p => p.role !== 'KILLER').map(p => p.id);
    if (alive.find(p => p.role === 'KILLER')    && !room.nightActions['KILLER'])    room.nightActions['KILLER']    = validT.length ? pick(validT) : null;
    if (alive.find(p => p.role === 'ANGEL')     && !room.nightActions['ANGEL'])     room.nightActions['ANGEL']     = pick(alive.map(p => p.id));
    if (alive.find(p => p.role === 'DETECTIVE') && !room.nightActions['DETECTIVE']) room.nightActions['DETECTIVE'] = 'NOT_SURE';
    alive.filter(p => p.role === 'CITIZEN').forEach(p => {
      if (!room.nightActions[`CIT_${p.id}`]) room.nightActions[`CIT_${p.id}`] = 'TIMEOUT';
    });
    resolveNight(rid);
  });
}

function resolveNight(roomId) {
  const r = rooms[roomId];
  const acts = r.nightActions || {};
  let deaths = [];

  // Detective guess
  const detective = r.players.find(p => p.role === 'DETECTIVE' && p.alive);
  if (detective) {
    const guess = acts['DETECTIVE'];
    if (guess && guess !== 'NOT_SURE') {
      const guessed = r.players.find(p => p.id === guess);
      if (guessed?.role === 'KILLER') {
        return finish(roomId, 'CITY_WIN_DET', 'Detective identified the Killer! City wins!');
      }
      detective.alive = false;
      deaths.push(detective.name);
    }
  }

  // Killer attack (blocked by Angel)
  const killerTarget = acts['KILLER'];
  const angelTarget  = acts['ANGEL'];
  if (killerTarget && killerTarget !== angelTarget) {
    const target = r.players.find(p => p.id === killerTarget && p.alive);
    if (target) { target.alive = false; deaths.push(target.name); }
  }

  r.logs = deaths.length > 0
    ? `${deaths.join(' & ')} ${deaths.length === 1 ? 'was' : 'were'} killed tonight.`
    : 'No one was killed tonight.';

  if (!checkWin(roomId)) startDiscussion(roomId);
}

function checkWin(roomId) {
  const r = rooms[roomId];
  const killerAlive  = r.players.find(p => p.role === 'KILLER' && p.alive);
  const othersAlive  = r.players.filter(p => p.role !== 'KILLER' && p.alive).length;
  if (!killerAlive)     { finish(roomId, 'CITY_WIN_VOTE', 'Killer eliminated! City wins!'); return true; }
  if (othersAlive <= 1) { finish(roomId, 'KILLER_WIN',   'Killer took control of the city!'); return true; }
  return false;
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

  r.votingResults = r.players
    .filter(p => counts[p.id])
    .map(p => ({
      id: p.id, name: p.name, votes: counts[p.id] || 0,
      voters: Object.entries(r.votes)
        .filter(([, t]) => t === p.id)
        .map(([vid]) => r.players.find(pl => pl.id === vid)?.name || '?'),
    }))
    .sort((a, b) => b.votes - a.votes);

  let max = 0, topId = null, tie = false;
  for (const [id, cnt] of Object.entries(counts)) {
    if (cnt > max) { max = cnt; topId = id; tie = false; }
    else if (cnt === max) { tie = true; }
  }

  r.status = 'VOTING_RESULT';

  if (tie || !topId) {
    r.logs = "No consensus. No one was eliminated.";
    broadcastRoom(roomId);
    runTimer(roomId, r.config.resultDuration, startNight);
    return;
  }

  const elim = r.players.find(p => p.id === topId);
  if (elim) { elim.alive = false; r.logs = `City eliminated ${elim.name}.`; }
  broadcastRoom(roomId);
  if (!checkWin(roomId)) runTimer(roomId, r.config.resultDuration, startNight);
}

function finish(roomId, outcome, reason) {
  const r = rooms[roomId];
  if (!r) return;
  clearRoomTimer(roomId);
  r.status = 'WINNER';
  r.outcome = outcome;
  r.logs = reason;
  r.timer = 0;
  r.maxTimer = 0;
  r.players.forEach(p => {
    if (outcome === 'KILLER_WIN'                                                  && p.role === 'KILLER')    p.score += 2;
    if (outcome === 'CITY_WIN_DET'                                                && p.role === 'DETECTIVE') p.score += 2;
    if ((outcome === 'CITY_WIN_VOTE' || outcome === 'CITY_WIN_DET') && p.alive   && p.role !== 'KILLER')    p.score += 1;
  });
  broadcastRoom(roomId);
}

// ─── Socket handlers ─────────────────────────────────────────────────────────
io.on('connection', socket => {

  socket.on('createRoom', ({ name }) => {
    if (!name?.trim()) return socket.emit('joinError', 'Please enter your name.');
    const roomId   = generateCode();
    const playerId = `p_${socket.id}`;
    rooms[roomId] = {
      id: roomId, hostId: playerId, status: 'LOBBY',
      players: [{ id: playerId, socketId: socket.id, name: name.trim(), avatar: 1, score: 0, alive: true, role: null, seat: null, connected: true }],
      config: { roleRevealTime: 12, questionTime: 20, discussionTime: 120, votingTime: 30, resultDuration: 8 },
      nightActions: {}, votes: {}, votingResults: null,
      logs: 'Waiting for players to join…', timer: 0, maxTimer: 0, round: 0, sessionNumber: 0, _interval: null,
    };
    socketToRoom[socket.id] = { roomId, playerId };
    socket.join(roomId);
    broadcastRoom(roomId);
    socket.emit('joined', { roomId, playerId });
  });

  socket.on('joinRoom', ({ roomId, name }) => {
    if (!name?.trim())  return socket.emit('joinError', 'Please enter your name.');
    if (!roomId?.trim()) return socket.emit('joinError', 'Please enter the game code.');
    const r = rooms[roomId];
    if (!r)                    return socket.emit('joinError', 'Game not found. Check the code and try again.');
    if (r.status !== 'LOBBY')  return socket.emit('joinError', 'Game already started.');
    if (r.players.length >= 25) return socket.emit('joinError', 'Room is full (max 25 players).');
    const playerId = `p_${socket.id}`;
    r.players.push({ id: playerId, socketId: socket.id, name: name.trim(), avatar: r.players.length + 1, score: 0, alive: true, role: null, seat: null, connected: true });
    socketToRoom[socket.id] = { roomId, playerId };
    socket.join(roomId);
    broadcastRoom(roomId);
    socket.emit('joined', { roomId, playerId });
  });

  // IMPORTANT: named 'rejoinGame' (not 'reconnect') to avoid collision with socket.io internals
  socket.on('rejoinGame', ({ roomId, playerId }) => {
    const r = rooms[roomId];
    if (!r)                                      return socket.emit('rejoinFailed', 'Game no longer exists.');
    const player = r.players.find(p => p.id === playerId);
    if (!player)                                 return socket.emit('rejoinFailed', 'Player not found in this game.');
    delete socketToRoom[player.socketId];
    player.socketId  = socket.id;
    player.connected = true;
    socketToRoom[socket.id] = { roomId, playerId };
    socket.join(roomId);
    broadcastRoom(roomId);
    socket.emit('joined', { roomId, playerId });
  });

  socket.on('updateConfig', ({ roomId, config }) => {
    const r    = rooms[roomId];
    const info = socketToRoom[socket.id];
    if (!r || !info || r.hostId !== info.playerId) return;
    r.config = { ...r.config, ...config };
    broadcastRoom(roomId);
  });

  socket.on('startSession', ({ roomId }) => {
    const r    = rooms[roomId];
    const info = socketToRoom[socket.id];
    if (!r || !info || r.hostId !== info.playerId) return;
    if (r.players.length < 4) return socket.emit('joinError', 'Need at least 4 players to start.');
    r.sessionNumber = (r.sessionNumber || 0) + 1;
    r.round = 0;
    assignRoles(r);
    r.status = 'ROLE_REVEAL';
    r.logs = `Session ${r.sessionNumber} — Check your role!`;
    broadcastRoom(roomId);
    runTimer(roomId, r.config.roleRevealTime, startNight);
  });

  socket.on('startNextSession', ({ roomId }) => {
    const r    = rooms[roomId];
    const info = socketToRoom[socket.id];
    if (!r || !info || r.hostId !== info.playerId) return;
    clearRoomTimer(roomId);
    r.sessionNumber = (r.sessionNumber || 0) + 1;
    r.round = 0;
    r.players.forEach(p => { p.alive = true; p.role = null; });
    assignRoles(r);
    r.status = 'ROLE_REVEAL';
    r.logs = `Session ${r.sessionNumber} — New roles!`;
    broadcastRoom(roomId);
    runTimer(roomId, r.config.roleRevealTime, startNight);
  });

  socket.on('restartSession', ({ roomId }) => {
    const r    = rooms[roomId];
    const info = socketToRoom[socket.id];
    if (!r || !info || r.hostId !== info.playerId) return;
    clearRoomTimer(roomId);
    r.round = 0;
    r.players.forEach(p => { p.alive = true; p.role = null; });
    assignRoles(r);
    r.status = 'ROLE_REVEAL';
    r.logs = `Session ${r.sessionNumber} — Restarted!`;
    broadcastRoom(roomId);
    runTimer(roomId, r.config.roleRevealTime, startNight);
  });

  socket.on('submitNightAction', ({ roomId, targetId }) => {
    const r    = rooms[roomId];
    const info = socketToRoom[socket.id];
    if (!r || !info || r.status !== 'NIGHT') return;
    const me = r.players.find(p => p.id === info.playerId);
    if (!me || !me.alive) return;

    const key = me.role === 'CITIZEN' ? `CIT_${me.id}` : me.role;
    r.nightActions[key] = targetId;

    const alive        = r.players.filter(p => p.alive);
    const killerDone   = !alive.find(p => p.role === 'KILLER')    || r.nightActions['KILLER'];
    const angelDone    = !alive.find(p => p.role === 'ANGEL')     || r.nightActions['ANGEL'];
    const detectiveDone= !alive.find(p => p.role === 'DETECTIVE') || r.nightActions['DETECTIVE'];
    const citizensDone = alive.filter(p => p.role === 'CITIZEN').every(p => r.nightActions[`CIT_${p.id}`]);

    if (killerDone && angelDone && detectiveDone && citizensDone) {
      clearRoomTimer(roomId);
      resolveNight(roomId);
    } else {
      broadcastRoom(roomId);
    }
  });

  socket.on('submitVote', ({ roomId, targetId }) => {
    const r    = rooms[roomId];
    const info = socketToRoom[socket.id];
    if (!r || !info || r.status !== 'VOTING') return;
    const me = r.players.find(p => p.id === info.playerId);
    if (!me || !me.alive) return;
    if (r.votes[info.playerId]) return;
    r.votes[info.playerId] = targetId;
    const aliveIds = r.players.filter(p => p.alive).map(p => p.id);
    if (aliveIds.every(id => r.votes[id])) {
      clearRoomTimer(roomId);
      resolveVoting(roomId);
    } else {
      broadcastRoom(roomId);
    }
  });

  socket.on('pauseGame', ({ roomId }) => {
    const r    = rooms[roomId];
    const info = socketToRoom[socket.id];
    if (!r || !info || r.hostId !== info.playerId) return;
    clearRoomTimer(roomId);
    r.paused = true;
    r.logs = 'Game paused by host.';
    broadcastRoom(roomId);
  });

  socket.on('resumeGame', ({ roomId }) => {
    const r    = rooms[roomId];
    const info = socketToRoom[socket.id];
    if (!r || !info || r.hostId !== info.playerId) return;
    r.paused = false;
    r.logs = 'Game resumed.';
    const rem = r.timer > 0 ? r.timer : 10;
    if      (r.status === 'DISCUSSION') runTimer(roomId, rem, startVoting);
    else if (r.status === 'VOTING')     runTimer(roomId, rem, resolveVoting);
    else if (r.status === 'NIGHT')      runTimer(roomId, rem, rid => {
      const room = rooms[rid]; if (!room) return;
      const alive = room.players.filter(p => p.alive);
      if (alive.find(p => p.role === 'KILLER')    && !room.nightActions['KILLER'])    room.nightActions['KILLER']    = pick(alive.filter(p => p.role !== 'KILLER').map(p => p.id));
      if (alive.find(p => p.role === 'ANGEL')     && !room.nightActions['ANGEL'])     room.nightActions['ANGEL']     = pick(alive.map(p => p.id));
      if (alive.find(p => p.role === 'DETECTIVE') && !room.nightActions['DETECTIVE']) room.nightActions['DETECTIVE'] = 'NOT_SURE';
      resolveNight(rid);
    });
    broadcastRoom(roomId);
  });

  socket.on('removePlayer', ({ roomId, playerId }) => {
    const r    = rooms[roomId];
    const info = socketToRoom[socket.id];
    if (!r || !info || r.hostId !== info.playerId) return;
    r.players = r.players.filter(p => p.id !== playerId);
    if (r.status !== 'LOBBY') {
      clearRoomTimer(roomId);
      r.status = 'LOBBY';
      r.players.forEach(p => { p.alive = true; p.role = null; });
      r.logs = 'A player was removed. Session cancelled.';
    }
    broadcastRoom(roomId);
  });

  socket.on('endGame', ({ roomId }) => {
    const r    = rooms[roomId];
    const info = socketToRoom[socket.id];
    if (!r || !info || r.hostId !== info.playerId) return;
    clearRoomTimer(roomId);
    io.to(roomId).emit('gameEnded', { scores: r.players.map(p => ({ name: p.name, score: p.score, avatar: p.avatar })) });
    delete rooms[roomId];
  });

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
      io.to(roomId).emit('hostLeft');
      clearRoomTimer(roomId);
      delete rooms[roomId];
    } else {
      r.logs = `${player?.name || 'A player'} disconnected.`;
      broadcastRoom(roomId);
    }
  });
});

server.listen(process.env.PORT || 4000, () =>
  console.log('Killer City backend on port', process.env.PORT || 4000)
);
