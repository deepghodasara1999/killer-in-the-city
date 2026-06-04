import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://killer-in-the-city-ihef.onrender.com';

// ─── Avatar colours (25 presets) ─────────────────────────────────────────────
const AVATAR_COLORS = [
  '#e63946','#f4a261','#2a9d8f','#457b9d','#e9c46a',
  '#6d6875','#b5838d','#52b788','#4361ee','#f72585',
  '#fb8500','#023e8a','#80b918','#9b2226','#0077b6',
  '#7b2d8b','#c77dff','#4cc9f0','#f8961e','#43aa8b',
  '#577590','#f94144','#90be6d','#277da1','#f9c74f',
];
const AVATAR_EMOJIS = [
  '🦊','🐺','🦁','🐯','🐻','🦝','🦄','🐸','🐧','🦋',
  '🦈','🐉','🦅','🦜','🐬','🦊','🐺','🦁','🐯','🐻',
  '🦝','🦄','🐸','🐧','🦋',
];

function Avatar({ num, size = 10, highlight = false, dead = false }) {
  const idx = (num - 1) % 25;
  return (
    <div
      className={`rounded-full flex items-center justify-center font-bold transition-all
        w-${size} h-${size}
        ${dead ? 'opacity-30 grayscale' : ''}
        ${highlight ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-950' : ''}
      `}
      style={{ backgroundColor: AVATAR_COLORS[idx], fontSize: size * 2.2 }}
    >
      <span style={{ fontSize: size * 3.5 }}>{AVATAR_EMOJIS[idx]}</span>
    </div>
  );
}

// ─── Timer bar ────────────────────────────────────────────────────────────────
function TimerBar({ timer, max, color = 'bg-red-500' }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (timer / max) * 100)) : 0;
  return (
    <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
      <div
        className={`h-2 rounded-full transition-all duration-1000 ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ─── Loading spinner ──────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div className="flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-zinc-700 border-t-red-500 rounded-full animate-spin" />
    </div>
  );
}

// ─── Role config ──────────────────────────────────────────────────────────────
const ROLE_INFO = {
  KILLER:   { label: 'Killer',   emoji: '🔪', color: 'text-red-500',    bg: 'bg-red-900/40   border-red-700',   desc: 'Eliminate players each night without being caught.' },
  ANGEL:    { label: 'Angel',    emoji: '😇', color: 'text-blue-400',   bg: 'bg-blue-900/40  border-blue-700',  desc: 'Protect one player each night from the Killer.' },
  DETECTIVE:{ label: 'Detective',emoji: '🔍', color: 'text-yellow-400', bg: 'bg-yellow-900/40 border-yellow-700',desc: 'Identify the Killer directly. Guess wrong and you die.' },
  CITIZEN:  { label: 'Citizen',  emoji: '🏙️', color: 'text-zinc-300',   bg: 'bg-zinc-800/60  border-zinc-700',  desc: 'Work with the city during discussion to find the Killer.' },
};

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState(null);
  const [myInfo, setMyInfo] = useState(null);      // { roomId, playerId }
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showRole, setShowRole] = useState(false);
  const [timer, setTimer] = useState(0);
  const [maxTimer, setMaxTimer] = useState(0);
  const [myVote, setMyVote] = useState(null);
  const [myNightSubmitted, setMyNightSubmitted] = useState(false);
  const [gameEnded, setGameEnded] = useState(null); // final scores

  const timerRef = useRef(0);

  // ── Connect socket once ──
  useEffect(() => {
    const socket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      // Try to reconnect if we have saved session
      const saved = sessionStorage.getItem('killerCitySession');
      if (saved) {
        try {
          const { roomId, playerId } = JSON.parse(saved);
          socket.emit('reconnect', { roomId, playerId });
        } catch {}
      }
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('joined', ({ roomId, playerId }) => {
      setLoading(false);
      setError('');
      setMyInfo({ roomId, playerId });
      sessionStorage.setItem('killerCitySession', JSON.stringify({ roomId, playerId }));
    });

    socket.on('roomUpdate', (r) => {
      setRoom(prev => {
        // Detect status change to reset ephemeral state
        if (prev?.status !== r.status) {
          if (r.status === 'ROLE_REVEAL') {
            setShowRole(true);
            setTimeout(() => setShowRole(false), 5000);
            setMyNightSubmitted(false);
          }
          if (r.status === 'NIGHT') {
            setMyNightSubmitted(false);
          }
          if (r.status === 'VOTING') {
            setMyVote(null);
          }
          // Set max timer for progress bar
          setMaxTimer(r.timer || 0);
        }
        return r;
      });
      setTimer(r.timer || 0);
      timerRef.current = r.timer || 0;
      if (r.myActions?.submitted) setMyNightSubmitted(true);
    });

    socket.on('joinError', (msg) => {
      setLoading(false);
      setError(msg);
    });

    socket.on('hostLeft', () => {
      setRoom(null);
      setMyInfo(null);
      sessionStorage.removeItem('killerCitySession');
      setError('Host disconnected. Game ended.');
    });

    socket.on('gameEnded', (data) => {
      setGameEnded(data.scores);
      setRoom(null);
      setMyInfo(null);
      sessionStorage.removeItem('killerCitySession');
    });

    // Live tick
    socket.on('tick', (t) => {
      setTimer(t);
    });

    return () => socket.disconnect();
  }, []);

  const emit = useCallback((event, data) => {
    socketRef.current?.emit(event, data);
  }, []);

  const handleHost = () => {
    if (!name.trim()) return setError('Enter your name first.');
    setLoading(true);
    setError('');
    emit('createRoom', { name: name.trim() });
  };

  const handleJoin = () => {
    if (!name.trim()) return setError('Enter your name first.');
    if (!code.trim()) return setError('Enter the 6-digit game code.');
    setLoading(true);
    setError('');
    emit('joinRoom', { roomId: code.trim(), name: name.trim() });
  };

  const handleNightAction = (targetId) => {
    if (myNightSubmitted) return;
    setMyNightSubmitted(true);
    emit('submitNightAction', { roomId: myInfo.roomId, targetId });
  };

  const handleVote = (targetId) => {
    if (myVote) return;
    setMyVote(targetId);
    emit('submitVote', { roomId: myInfo.roomId, targetId });
  };

  // ── Derived ──
  const me = room?.players?.find(p => p.id === myInfo?.playerId);
  const isHost = me && room && me.id === room.hostId;
  const roomId = myInfo?.roomId;

  // ── Game ended screen ──
  if (gameEnded) {
    const sorted = [...gameEnded].sort((a, b) => b.score - a.score);
    return (
      <Screen>
        <div className="text-center py-8">
          <div className="text-5xl mb-4">🏆</div>
          <h1 className="text-3xl font-black text-yellow-400 mb-2">Game Over</h1>
          <p className="text-zinc-400 mb-8">Final Standings</p>
          <div className="space-y-3 mb-8">
            {sorted.map((p, i) => (
              <div key={p.name} className="flex items-center gap-3 bg-zinc-900 rounded-xl px-4 py-3">
                <span className="text-lg font-black text-zinc-500 w-6">{i + 1}</span>
                <Avatar num={p.avatar} size={8} />
                <span className="flex-1 font-bold text-left">{p.name}</span>
                <span className="text-yellow-400 font-black text-lg">{p.score} pts</span>
              </div>
            ))}
          </div>
          <button onClick={() => { setGameEnded(null); setError(''); }} className="btn-primary">
            Back to Menu
          </button>
        </div>
      </Screen>
    );
  }

  // ── Main menu (no room) ──
  if (!room || !myInfo) {
    return (
      <Screen>
        <div className="flex flex-col items-center justify-center min-h-screen py-12">
          <div className="mb-10 text-center">
            <div className="text-6xl mb-3">🔪</div>
            <h1 className="text-4xl font-black text-red-500 tracking-tight">KILLER</h1>
            <h2 className="text-2xl font-black text-zinc-300 tracking-widest">IN THE CITY</h2>
          </div>

          <div className="w-full max-w-xs space-y-3">
            {error && (
              <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm rounded-xl p-3 text-center">
                {error}
              </div>
            )}

            <input
              className="input-field"
              placeholder="Your name"
              value={name}
              onChange={e => { setName(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleHost()}
              maxLength={20}
            />

            <button
              className="btn-primary w-full"
              onClick={handleHost}
              disabled={loading}
            >
              {loading ? <Spinner /> : '🎮 Host a Game'}
            </button>

            <div className="relative flex items-center my-2">
              <div className="flex-1 h-px bg-zinc-800" />
              <span className="px-3 text-zinc-600 text-xs">or join</span>
              <div className="flex-1 h-px bg-zinc-800" />
            </div>

            <input
              className="input-field text-center tracking-widest text-lg"
              placeholder="Game code (6 digits)"
              value={code}
              onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
              maxLength={6}
              inputMode="numeric"
            />

            <button
              className="btn-secondary w-full"
              onClick={handleJoin}
              disabled={loading}
            >
              {loading ? <Spinner /> : '🚪 Join Game'}
            </button>
          </div>

          {!connected && (
            <div className="mt-6 flex items-center gap-2 text-zinc-500 text-xs">
              <Spinner />
              <span>Connecting to server…</span>
            </div>
          )}
        </div>
      </Screen>
    );
  }

  // ── Waiting (joined but no room update yet) ──
  if (!me) {
    return (
      <Screen>
        <div className="flex flex-col items-center justify-center min-h-screen">
          <Spinner />
          <p className="text-zinc-400 mt-4">Joining game…</p>
        </div>
      </Screen>
    );
  }

  // ── LOBBY ──
  if (room.status === 'LOBBY') {
    return (
      <Screen>
        <div className="py-6">
          <div className="text-center mb-6">
            <p className="text-zinc-500 text-xs uppercase tracking-widest mb-1">Game Code</p>
            <div className="text-5xl font-black tracking-widest text-white bg-zinc-900 rounded-2xl py-4 px-6 inline-block border border-zinc-800">
              {room.id}
            </div>
            <p className="text-zinc-500 text-xs mt-2">Share this with friends</p>
          </div>

          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-4 mb-6">
            <p className="text-zinc-500 text-xs uppercase tracking-widest mb-3">
              Players — {room.players.length} / 25
            </p>
            <div className="space-y-2">
              {room.players.map(p => (
                <div key={p.id} className="flex items-center gap-3">
                  <Avatar num={p.avatar} size={8} highlight={p.id === me.id} />
                  <span className="font-semibold flex-1">{p.name}</span>
                  {p.id === room.hostId && <span className="text-xs text-yellow-500 bg-yellow-900/30 px-2 py-0.5 rounded-full">Host</span>}
                  {!p.connected && <span className="text-xs text-zinc-500">Offline</span>}
                  {isHost && p.id !== me.id && (
                    <button
                      onClick={() => emit('removePlayer', { roomId, playerId: p.id })}
                      className="text-xs text-red-500 hover:text-red-400 px-2"
                    >✕</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {isHost ? (
            room.players.length >= 4 ? (
              <button
                onClick={() => emit('startSession', { roomId })}
                className="btn-primary w-full text-lg"
              >
                🚀 Start Game
              </button>
            ) : (
              <div className="text-center text-zinc-500 text-sm bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                Need at least {4 - room.players.length} more player{4 - room.players.length !== 1 ? 's' : ''} to start
              </div>
            )
          ) : (
            <div className="text-center text-zinc-500 text-sm bg-zinc-900 rounded-xl p-4 border border-zinc-800">
              ⏳ Waiting for host to start the game…
            </div>
          )}
        </div>
      </Screen>
    );
  }

  // ── ROLE REVEAL ──
  if (room.status === 'ROLE_REVEAL') {
    const role = me.role;
    const info = ROLE_INFO[role] || ROLE_INFO.CITIZEN;
    return (
      <GameScreen room={room} me={me} isHost={isHost} emit={emit} roomId={roomId} timer={timer} maxTimer={maxTimer}>
        <div className="flex flex-col items-center py-6">
          <p className="text-zinc-500 text-xs uppercase tracking-widest mb-6">Your Secret Role</p>
          <div
            className={`w-full max-w-xs rounded-3xl border-2 p-8 text-center transition-all duration-500 cursor-pointer
              ${showRole ? info.bg + ' scale-100' : 'bg-zinc-900 border-zinc-800 scale-95'}
            `}
            onClick={() => setShowRole(true)}
          >
            {showRole ? (
              <>
                <div className="text-6xl mb-4">{info.emoji}</div>
                <h1 className={`text-4xl font-black mb-3 ${info.color}`}>{info.label}</h1>
                <p className="text-zinc-300 text-sm leading-relaxed">{info.desc}</p>
              </>
            ) : (
              <div className="py-4">
                <div className="text-4xl mb-3">🃏</div>
                <p className="text-zinc-500 text-sm">Tap to reveal your role</p>
                <p className="text-zinc-700 text-xs mt-1">Make sure no one is watching!</p>
              </div>
            )}
          </div>
          {showRole && (
            <p className="text-zinc-600 text-xs mt-4">Auto-hiding in {timer}s</p>
          )}
          {!showRole && role && (
            <button onClick={() => setShowRole(true)} className="btn-secondary mt-4">
              👁 Reveal My Role
            </button>
          )}
        </div>
      </GameScreen>
    );
  }

  // ── NIGHT ──
  if (room.status === 'NIGHT') {
    if (!me.alive) {
      return (
        <GameScreen room={room} me={me} isHost={isHost} emit={emit} roomId={roomId} timer={timer} maxTimer={maxTimer}>
          <SpectatorScreen />
        </GameScreen>
      );
    }

    const phrase = room.phrase;
    const alivePlayers = room.players.filter(p => p.alive && p.id !== me.id);

    return (
      <GameScreen room={room} me={me} isHost={isHost} emit={emit} roomId={roomId} timer={timer} maxTimer={maxTimer}>
        <div className="py-4">
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">🌙</div>
            <h2 className="text-xl font-bold text-zinc-300">
              {phrase?.type === 'citizen' ? 'The city sleeps…' : phrase?.text || '…'}
            </h2>
          </div>

          {myNightSubmitted ? (
            <div className="text-center py-8 bg-zinc-900 rounded-2xl border border-zinc-800">
              <div className="text-3xl mb-3">✅</div>
              <p className="text-zinc-400">Action submitted.</p>
              <p className="text-zinc-600 text-sm mt-1">Waiting for others…</p>
            </div>
          ) : phrase?.type === 'citizen' ? (
            // Distraction question
            <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6">
              <p className="text-zinc-500 text-xs uppercase tracking-widest mb-3">Distraction Question</p>
              <p className="text-xl font-bold mb-4 text-center">{phrase?.text}</p>
              <div className="grid grid-cols-2 gap-2">
                {(phrase?.opts || []).map(opt => (
                  <button
                    key={opt}
                    onClick={() => handleNightAction('CITIZEN_' + opt)}
                    className="p-3 bg-zinc-800 rounded-xl text-sm font-semibold hover:bg-zinc-700 active:bg-zinc-600 transition"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            // Role action
            <div className="space-y-3">
              <p className="text-zinc-500 text-xs uppercase tracking-widest text-center mb-2">Choose a player</p>
              <div className="grid grid-cols-2 gap-3">
                {alivePlayers.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleNightAction(p.id)}
                    className="flex flex-col items-center p-4 bg-zinc-900 rounded-2xl border border-zinc-800 hover:border-red-700 active:bg-red-900/30 transition"
                  >
                    <Avatar num={p.avatar} size={10} />
                    <span className="mt-2 text-sm font-semibold">{p.name}</span>
                  </button>
                ))}
                {me.role === 'DETECTIVE' && (
                  <button
                    onClick={() => handleNightAction('NOT_SURE')}
                    className="flex flex-col items-center p-4 bg-zinc-800 rounded-2xl border border-zinc-700 hover:border-yellow-700 active:bg-yellow-900/20 transition col-span-2"
                  >
                    <span className="text-2xl">🤔</span>
                    <span className="mt-1 text-sm font-semibold text-zinc-400">Not Sure</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </GameScreen>
    );
  }

  // ── DISCUSSION ──
  if (room.status === 'DISCUSSION') {
    return (
      <GameScreen room={room} me={me} isHost={isHost} emit={emit} roomId={roomId} timer={timer} maxTimer={maxTimer}>
        {me.alive ? (
          <div className="py-4">
            <div className="text-center mb-6">
              <div className="text-4xl mb-3">💬</div>
              <h2 className="text-xl font-bold">Discussion Time</h2>
              <p className="text-zinc-500 text-sm mt-1">Talk to each other. Who do you think is the Killer?</p>
            </div>
            <CircularBoard players={room.players} myId={me.id} />
            <div className="mt-6 bg-red-900/20 border border-red-900/40 rounded-xl p-4 text-center">
              <p className="text-red-400 text-sm font-semibold">🔪 Night Result</p>
              <p className="text-zinc-300 text-sm mt-1">{room.logs}</p>
            </div>
          </div>
        ) : (
          <SpectatorScreen />
        )}
      </GameScreen>
    );
  }

  // ── VOTING ──
  if (room.status === 'VOTING') {
    return (
      <GameScreen room={room} me={me} isHost={isHost} emit={emit} roomId={roomId} timer={timer} maxTimer={maxTimer}>
        {me.alive ? (
          <div className="py-4">
            <div className="text-center mb-6">
              <div className="text-4xl mb-3">🗳️</div>
              <h2 className="text-xl font-bold">Voting Phase</h2>
              <p className="text-zinc-500 text-sm mt-1">Vote to eliminate who you think is the Killer.</p>
            </div>

            {myVote ? (
              <div className="text-center py-8 bg-zinc-900 rounded-2xl border border-zinc-800">
                <div className="text-3xl mb-3">✅</div>
                <p className="text-zinc-300">Vote cast!</p>
                <p className="text-zinc-600 text-sm mt-1">Waiting for others…</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {room.players.filter(p => p.alive && p.id !== me.id).map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleVote(p.id)}
                    className="flex flex-col items-center p-4 bg-zinc-900 rounded-2xl border border-zinc-800 hover:border-red-700 active:bg-red-900/30 transition"
                  >
                    <Avatar num={p.avatar} size={10} />
                    <span className="mt-2 text-sm font-semibold">{p.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <SpectatorScreen />
        )}
      </GameScreen>
    );
  }

  // ── VOTING RESULT ──
  if (room.status === 'VOTING_RESULT') {
    return (
      <GameScreen room={room} me={me} isHost={isHost} emit={emit} roomId={roomId} timer={timer} maxTimer={maxTimer}>
        <div className="py-4">
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">📊</div>
            <h2 className="text-xl font-bold">Voting Results</h2>
          </div>
          <div className="bg-red-900/20 border border-red-900/40 rounded-xl p-4 text-center mb-6">
            <p className="text-zinc-200 font-semibold">{room.logs}</p>
          </div>
          {room.votingResults && room.votingResults.length > 0 && (
            <div className="space-y-3">
              {[...room.votingResults].sort((a, b) => b.votes - a.votes).map(r => (
                <div key={r.id} className="bg-zinc-900 rounded-xl p-3 border border-zinc-800">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold">{r.name}</span>
                    <span className="text-red-400 font-black">{r.votes} vote{r.votes !== 1 ? 's' : ''}</span>
                  </div>
                  <p className="text-zinc-500 text-xs">{r.voters.join(', ')} voted for them</p>
                </div>
              ))}
            </div>
          )}
          <p className="text-zinc-600 text-xs text-center mt-4">Next round in {timer}s</p>
        </div>
      </GameScreen>
    );
  }

  // ── WINNER ──
  if (room.status === 'WINNER') {
    const killerPlayer = room.players.find(p => p.role === 'KILLER');
    return (
      <GameScreen room={room} me={me} isHost={isHost} emit={emit} roomId={roomId} timer={timer} maxTimer={maxTimer}>
        <div className="py-4 text-center">
          <div className="text-6xl mb-4">
            {room.outcome === 'KILLER_WIN' ? '🔪' : '🏙️'}
          </div>
          <h1 className="text-4xl font-black text-yellow-400 mb-2">
            {room.outcome === 'KILLER_WIN' ? 'Killer Wins!' : 'City Wins!'}
          </h1>
          <p className="text-zinc-400 mb-6">{room.logs}</p>

          {killerPlayer && (
            <div className="bg-zinc-900 rounded-2xl border border-red-900/50 p-4 mb-6 flex items-center gap-4">
              <Avatar num={killerPlayer.avatar} size={12} />
              <div className="text-left">
                <p className="text-zinc-500 text-xs uppercase tracking-wide">The Killer was</p>
                <p className="text-xl font-black text-red-400">{killerPlayer.name}</p>
              </div>
            </div>
          )}

          {/* Scores */}
          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-4 mb-6">
            <p className="text-zinc-500 text-xs uppercase tracking-widest mb-3">Scores</p>
            {[...room.players].sort((a, b) => b.score - a.score).map((p, i) => (
              <div key={p.id} className={`flex items-center gap-3 py-2 ${i < room.players.length - 1 ? 'border-b border-zinc-800' : ''}`}>
                <span className="text-zinc-600 text-sm w-4">{i + 1}</span>
                <Avatar num={p.avatar} size={8} highlight={p.id === me.id} />
                <span className="flex-1 text-sm font-semibold text-left">{p.name}</span>
                {p.role && <span className="text-xs text-zinc-600">{ROLE_INFO[p.role]?.emoji}</span>}
                <span className="text-yellow-400 font-black">{p.score}</span>
              </div>
            ))}
          </div>

          {isHost && (
            <div className="space-y-3">
              <button
                onClick={() => emit('startNextSession', { roomId })}
                className="btn-primary w-full"
              >
                🔄 Next Session
              </button>
              <button
                onClick={() => emit('endGame', { roomId })}
                className="btn-secondary w-full"
              >
                🏁 End Game
              </button>
            </div>
          )}
          {!isHost && (
            <p className="text-zinc-500 text-sm">Waiting for host to continue…</p>
          )}
        </div>
      </GameScreen>
    );
  }

  // Fallback
  return (
    <Screen>
      <div className="flex flex-col items-center justify-center min-h-screen">
        <Spinner />
        <p className="text-zinc-500 mt-4 text-sm">{room.status}</p>
      </div>
    </Screen>
  );
}

// ─── Circular board component ─────────────────────────────────────────────────
function CircularBoard({ players, myId }) {
  const n = players.length;
  const radius = 110;
  const centerX = 160;
  const centerY = 160;

  return (
    <div className="flex justify-center">
      <svg width={320} height={320} className="overflow-visible">
        {/* Circle outline */}
        <circle cx={centerX} cy={centerY} r={radius} fill="none" stroke="#27272a" strokeWidth={2} />

        {players.map((p, i) => {
          const angle = (i * 2 * Math.PI) / n - Math.PI / 2;
          const x = centerX + radius * Math.cos(angle);
          const y = centerY + radius * Math.sin(angle);
          const isMe = p.id === myId;
          const color = AVATAR_COLORS[(p.avatar - 1) % 25];

          return (
            <g key={p.id}>
              {/* Dead cross */}
              {!p.alive && (
                <>
                  <line x1={x - 10} y1={y - 10} x2={x + 10} y2={y + 10} stroke="#ef4444" strokeWidth={2} />
                  <line x1={x + 10} y1={y - 10} x2={x - 10} y2={y + 10} stroke="#ef4444" strokeWidth={2} />
                </>
              )}
              {/* Avatar circle */}
              <circle
                cx={x} cy={y} r={isMe ? 20 : 18}
                fill={p.alive ? color : '#1c1c1e'}
                stroke={isMe ? '#fff' : 'transparent'}
                strokeWidth={2}
                opacity={p.alive ? 1 : 0.4}
              />
              <text x={x} y={y + 5} textAnchor="middle" fontSize={16} dominantBaseline="middle">
                {AVATAR_EMOJIS[(p.avatar - 1) % 25]}
              </text>
              {/* Name label */}
              <text
                x={x}
                y={y + (y < centerY ? -24 : 30)}
                textAnchor="middle"
                fontSize={10}
                fill={p.alive ? '#e4e4e7' : '#52525b'}
                fontWeight={isMe ? '700' : '400'}
              >
                {p.name.length > 8 ? p.name.slice(0, 7) + '…' : p.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Spectator screen ─────────────────────────────────────────────────────────
function SpectatorScreen() {
  return (
    <div className="text-center py-12 px-4">
      <div className="text-5xl mb-4">💀</div>
      <h2 className="text-2xl font-black text-zinc-500 mb-2">You are dead</h2>
      <p className="text-zinc-600 text-sm">Please remain silent until the session ends.</p>
    </div>
  );
}

// ─── Game screen wrapper ──────────────────────────────────────────────────────
function GameScreen({ room, me, isHost, emit, roomId, timer, maxTimer, children }) {
  const [showPause, setShowPause] = useState(false);

  const statusLabels = {
    ROLE_REVEAL: 'Role Reveal',
    NIGHT: `Night — Round ${room.round}`,
    DISCUSSION: 'Discussion',
    VOTING: 'Vote',
    VOTING_RESULT: 'Results',
    WINNER: 'Session Over',
  };

  const timerColors = {
    ROLE_REVEAL: 'bg-blue-500',
    NIGHT: 'bg-indigo-500',
    DISCUSSION: 'bg-yellow-500',
    VOTING: 'bg-red-500',
    VOTING_RESULT: 'bg-zinc-500',
    WINNER: 'bg-zinc-500',
  };

  return (
    <Screen>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur-sm pb-3 mb-2">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-zinc-500 text-[10px] uppercase tracking-widest">Room {room.id}</p>
            <p className="text-sm font-bold text-zinc-200">{statusLabels[room.status] || room.status}</p>
          </div>
          <div className="flex items-center gap-2">
            {timer > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 font-mono font-black text-lg">
                {timer}s
              </div>
            )}
            {isHost && room.status !== 'WINNER' && (
              <button
                onClick={() => setShowPause(p => !p)}
                className="bg-zinc-800 rounded-lg p-2 text-zinc-400 hover:text-white"
              >
                ⏸
              </button>
            )}
          </div>
        </div>
        {maxTimer > 0 && timer > 0 && (
          <TimerBar timer={timer} max={maxTimer} color={timerColors[room.status]} />
        )}
      </div>

      {/* Pause overlay */}
      {showPause && isHost && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col items-center justify-center gap-4 p-6">
          <h2 className="text-2xl font-black text-white">Host Controls</h2>
          <button onClick={() => { emit('pauseGame', { roomId }); setShowPause(false); }} className="btn-secondary w-full max-w-xs">⏸ Pause Game</button>
          <button onClick={() => { emit('resumeGame', { roomId }); setShowPause(false); }} className="btn-primary w-full max-w-xs">▶ Resume Game</button>
          <button onClick={() => { emit('restartSession', { roomId }); setShowPause(false); }} className="btn-secondary w-full max-w-xs">🔄 Restart Session</button>
          <button onClick={() => { emit('endGame', { roomId }); setShowPause(false); }} className="w-full max-w-xs py-3 rounded-xl bg-red-900/40 border border-red-700 text-red-400 font-bold">🏁 End Game</button>
          <button onClick={() => setShowPause(false)} className="text-zinc-500 text-sm mt-2">Cancel</button>
        </div>
      )}

      {/* Main content */}
      {children}

      {/* Player bar */}
      <div className="mt-8 border-t border-zinc-900 pt-4">
        <div className="flex justify-around flex-wrap gap-3">
          {room.players.map(p => (
            <div key={p.id} className={`flex flex-col items-center gap-1 ${!p.alive ? 'opacity-30' : ''}`}>
              <Avatar num={p.avatar} size={8} highlight={p.id === me.id} dead={!p.alive} />
              <span className="text-[9px] text-zinc-400 truncate max-w-[40px] text-center">{p.name}</span>
              <span className="text-[9px] text-yellow-500 font-bold">{p.score}</span>
            </div>
          ))}
        </div>
      </div>
    </Screen>
  );
}

// ─── Base screen wrapper ──────────────────────────────────────────────────────
function Screen({ children }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans">
      <div className="max-w-lg mx-auto px-4 pb-8">
        {children}
      </div>
    </div>
  );
}
