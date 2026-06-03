const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

let rooms = {};

const PHRASES = {
    KILLER: ["Who disappears tonight?", "Choose a target.", "Eliminate someone.", "Select a victim.", "Who is next?", "The city needs a sacrifice.", "Silence someone.", "Make your move.", "Pick a player to remove.", "Who survives no longer?", "End someone's story.", "Tonight's hit is...", "The killer chooses...", "Who goes away?", "Remove a citizen."],
    ANGEL: ["Who needs protection?", "Save someone tonight.", "Shield a player.", "Guardian's choice.", "Who stays alive?", "Protect a life.", "Cast your shield.", "Defend a citizen.", "Who will you save?", "Prevent a tragedy.", "Safety for whom?", "Keep someone safe.", "The angel watches...", "Shield target...", "Save a soul."],
    DETECTIVE: ["Who do you suspect?", "Identify the killer.", "Search for the truth.", "Who is guilty?", "Investigate a player.", "Find the murderer.", "Check a suspect.", "Reveal the identity.", "The detective looks at...", "Whose role to see?", "Expose the killer.", "Point the finger.", "The search begins with...", "Inspect someone.", "Are they the one?"]
};

const CITIZEN_QS = [
    {q: "7 x 8?", a: "56"}, {q: "Capital of France?", a: "Paris"}, {q: "Red Planet?", a: "Mars"},
    {q: "Water formula?", a: "H2O"}, {q: "12 + 15?", a: "27"}, {q: "Speed of light?", a: "Fast"}
];

io.on('connection', (socket) => {
    socket.on('createRoom', ({ name }) => {
        const roomId = Math.floor(100000 + Math.random() * 900000).toString();
        rooms[roomId] = {
            id: roomId, hostId: socket.id, status: 'LOBBY',
            players: [{ id: socket.id, name, score: 0, avatar: 1, alive: true, role: null, seat: null }],
            config: { discussionTime: 150, votingTime: 30, resultDuration: 10 },
            nightActions: {}, votes: {}, logs: "Waiting for players...", timer: 0
        };
        socket.join(roomId);
        update(roomId);
    });

    socket.on('joinRoom', ({ roomId, name }) => {
        const r = rooms[roomId];
        if (r && r.players.length < 25 && r.status === 'LOBBY') {
            r.players.push({ id: socket.id, name, score: 0, avatar: r.players.length + 1, alive: true, role: null, seat: null });
            socket.join(roomId);
            update(roomId);
        } else { socket.emit('error', 'Room full or not found.'); }
    });

    socket.on('assignSeat', ({ roomId, playerId, seatIdx }) => {
        const r = rooms[roomId];
        if (r && r.hostId === socket.id) {
            const p = r.players.find(pl => pl.id === playerId);
            if (p) p.seat = seatIdx;
            update(roomId);
        }
    });

    socket.on('startSession', (roomId) => {
        const r = rooms[roomId];
        if (!r || r.players.length < 4) return;
        r.status = 'ROLE_REVEAL';
        r.nightActions = {};
        r.votes = {};
        
        let p = [...r.players].sort(() => Math.random() - 0.5);
        p.forEach(pl => { pl.role = 'CITIZEN'; pl.alive = true; });
        p[0].role = 'KILLER';
        p[1].role = 'ANGEL';
        if (p.length >= 6) p[2].role = 'DETECTIVE';

        update(roomId);
        runTimer(roomId, 10, 'NIGHT');
    });

    function runTimer(roomId, sec, next) {
        const r = rooms[roomId];
        if(!r) return;
        r.timer = sec;
        const itv = setInterval(() => {
            if(!rooms[roomId]) return clearInterval(itv);
            rooms[roomId].timer--;
            if (rooms[roomId].timer <= 0) {
                clearInterval(itv);
                transition(roomId, next);
            }
            io.to(roomId).emit('tick', rooms[roomId].timer);
        }, 1000);
    }

    function transition(roomId, next) {
        const r = rooms[roomId];
        r.status = next;
        if (next === 'NIGHT') {
            r.phrase = { K: PHRASES.KILLER[Math.floor(Math.random()*15)], A: PHRASES.ANGEL[Math.floor(Math.random()*15)], D: PHRASES.DETECTIVE[Math.floor(Math.random()*15)] };
            r.citQ = CITIZEN_QS[Math.floor(Math.random()*CITIZEN_QS.length)];
        }
        if (next === 'DISCUSSION') { resolveNight(roomId); runTimer(roomId, r.config.discussionTime, 'VOTING'); }
        if (next === 'VOTING') runTimer(roomId, r.config.votingTime, 'RESULT');
        if (next === 'RESULT') resolveVoting(roomId);
        update(roomId);
    }

    function resolveNight(roomId) {
        const r = rooms[roomId];
        const acts = r.nightActions;
        let deaths = [];

        if (acts['DETECTIVE']) {
            const target = r.players.find(p => p.id === acts['DETECTIVE']);
            if (target?.role === 'KILLER') return finish(roomId, 'CITY_WIN_DET', 'Detective identified the Killer!');
            if (acts['DETECTIVE'] !== 'NOT_SURE') {
                const det = r.players.find(p => p.role === 'DETECTIVE');
                if (det) { det.alive = false; deaths.push(det.name); }
            }
        }

        if (acts['KILLER'] && acts['KILLER'] !== acts['ANGEL']) {
            const target = r.players.find(p => p.id === acts['KILLER']);
            if (target) { target.alive = false; deaths.push(target.name); }
        }

        r.logs = deaths.length > 0 ? `${deaths.join(' & ')} died.` : "No one died tonight.";
        if (checkWin(roomId)) return;
    }

    function resolveVoting(roomId) {
        const r = rooms[roomId];
        const counts = {};
        Object.values(r.votes).forEach(id => counts[id] = (counts[id] || 0) + 1);
        let max = 0, tid = null, tie = false;
        for (let id in counts) {
            if (counts[id] > max) { max = counts[id]; tid = id; tie = false; }
            else if (counts[id] === max) tie = true;
        }

        if (tid && !tie) {
            const target = r.players.find(p => p.id === tid);
            target.alive = false;
            r.logs = `City eliminated ${target.name}.`;
            if (target.role === 'KILLER') return finish(roomId, 'CITY_WIN_VOTE', 'Killer eliminated!');
        } else { r.logs = "Tie! No one died."; }

        if (checkWin(roomId)) return;
        runTimer(roomId, r.config.resultDuration, 'NIGHT');
    }

    function checkWin(roomId) {
        const r = rooms[roomId];
        const killer = r.players.find(p => p.role === 'KILLER' && p.alive);
        const others = r.players.filter(p => p.role !== 'KILLER' && p.alive).length;
        if (!killer) { finish(roomId, 'CITY_WIN_VOTE', 'Killer is dead!'); return true; }
        if (1 >= others) { finish(roomId, 'KILLER_WIN', 'Killer took control!'); return true; }
        return false;
    }

    function finish(roomId, win, reason) {
        const r = rooms[roomId];
        r.status = 'WINNER'; r.logs = reason;
        r.players.forEach(p => {
            if (win === 'KILLER_WIN' && p.role === 'KILLER') p.score += 2;
            if (win === 'CITY_WIN_DET' && p.role === 'DETECTIVE') p.score += 2;
            if (win === 'CITY_WIN_VOTE' && p.role !== 'KILLER' && p.alive) p.score += 1;
        });
        update(roomId);
    }

    socket.on('submitNightAction', ({ roomId, targetId }) => {
        const r = rooms[roomId];
        const me = r.players.find(p => p.id === socket.id);
        if(r && me) r.nightActions[me.role] = targetId;
        update(roomId);
    });

    socket.on('submitVote', ({ roomId, targetId }) => {
        const r = rooms[roomId];
        if(r) r.votes[socket.id] = targetId;
        update(roomId);
    });

    socket.on('disconnect', () => {
        for (let id in rooms) {
            if (rooms[id].hostId === socket.id) {
                io.to(id).emit('error', 'Host disconnected. Game terminated.');
                delete rooms[id];
            }
        }
    });

    function update(roomId) { io.to(roomId).emit('roomUpdate', rooms[roomId]); }
});

server.listen(process.env.PORT || 4000);