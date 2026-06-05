import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://killer-in-the-city-ihef.onrender.com';
// const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://killer-in-the-city-production.up.railway.app';


// ─── Avatar system ────────────────────────────────────────────────────────────
const AVATARS = [
  { bg:'#c0392b', border:'#e74c3c', emoji:'🦊' },
  { bg:'#8e44ad', border:'#9b59b6', emoji:'🦄' },
  { bg:'#d35400', border:'#e67e22', emoji:'🐺' },
  { bg:'#e91e63', border:'#f06292', emoji:'🦋' },
  { bg:'#f39c12', border:'#f1c40f', emoji:'🦁' },
  { bg:'#00bcd4', border:'#80deea', emoji:'🦚' },
  { bg:'#16a085', border:'#1abc9c', emoji:'🐯' },
  { bg:'#27ae60', border:'#2ecc71', emoji:'🐻' },
  { bg:'#2980b9', border:'#3498db', emoji:'🦝' },
  { bg:'#2c3e50', border:'#34495e', emoji:'🐸' },
  { bg:'#c0392b', border:'#e74c3c', emoji:'🐧' },
  { bg:'#ff5722', border:'#ff8a65', emoji:'🦈' },
  { bg:'#795548', border:'#a1887f', emoji:'🐉' },
  { bg:'#607d8b', border:'#90a4ae', emoji:'🦅' },
  { bg:'#009688', border:'#4db6ac', emoji:'🦜' },
  { bg:'#3f51b5', border:'#7986cb', emoji:'🐬' },
  { bg:'#673ab7', border:'#9575cd', emoji:'🦔' },
  { bg:'#f44336', border:'#ef9a9a', emoji:'🦩' },
  
  { bg:'#4caf50', border:'#a5d6a7', emoji:'🐊' },
  { bg:'#ff9800', border:'#ffcc80', emoji:'🦘' },
  { bg:'#9c27b0', border:'#ce93d8', emoji:'🦞' },
  { bg:'#1565c0', border:'#42a5f5', emoji:'🐙' },
  { bg:'#2e7d32', border:'#66bb6a', emoji:'🦭' },
  { bg:'#6d4c41', border:'#bcaaa4', emoji:'🦫' },
  { bg:'#37474f', border:'#78909c', emoji:'🦬' },
];

function Avatar({ num, size = 10, highlight = false, dead = false }) {
  const idx = Math.max(0, (num - 1) % AVATARS.length);
  const av  = AVATARS[idx];
  const px  = size * 4;
  return (
    <div style={{
      width: px, height: px, flexShrink: 0,
      backgroundColor: dead ? '#3f3f46' : av.bg,
      border: `2.5px solid ${dead ? '#52525b' : highlight ? '#ffffff' : av.border}`,
      boxShadow: highlight && !dead ? '0 0 0 3px rgba(255,255,255,0.2)' : 'none',
      borderRadius: '50%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: px * 0.5,
      opacity: dead ? 0.45 : 1,
      filter: dead ? 'grayscale(1)' : 'none',
      transition: 'all 0.3s',
      userSelect: 'none',
    }}>
      {dead ? '💀' : av.emoji}
    </div>
  );
}

// ─── Misc UI atoms ────────────────────────────────────────────────────────────
function Spinner({ size = 8 }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div className="animate-spin" style={{
        width: size * 4, height: size * 4,
        border: '4px solid #3f3f46', borderTopColor: '#ef4444',
        borderRadius: '50%',
      }} />
    </div>
  );
}

function TimerBar({ timer, maxTimer, color = '#ef4444' }) {
  const pct = maxTimer > 0 ? Math.max(0, Math.min(100, (timer / maxTimer) * 100)) : 0;
  return (
    <div style={{ width:'100%', background:'#27272a', borderRadius:9999, height:4, overflow:'hidden' }}>
      <div style={{ height:4, borderRadius:9999, background:color, width:`${pct}%`, transition:'width 1s linear' }} />
    </div>
  );
}

function Screen({ children }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-lg mx-auto px-4 pb-10">{children}</div>
    </div>
  );
}

function InfoBox({ children, color }) {
  return (
    <div style={{ border:`1px solid ${color || '#3f3f46'}`, background: color ? color + '22' : '#18181b' }}
      className="rounded-2xl p-4 text-center text-sm text-zinc-400">
      {children}
    </div>
  );
}

function Tag({ children, color = 'zinc' }) {
  const map = { yellow:'bg-yellow-900/30 text-yellow-500 border-yellow-800/50', zinc:'bg-zinc-800 text-zinc-500 border-zinc-700', red:'bg-red-900/30 text-red-400 border-red-800/50' };
  return <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${map[color]||map.zinc}`}>{children}</span>;
}



function Divider({ label }) {
  return (
    <div className="flex items-center gap-3 my-1">
      <div className="flex-1 h-px bg-zinc-800" />
      <span className="text-zinc-600 text-xs">{label}</span>
      <div className="flex-1 h-px bg-zinc-800" />
    </div>
  );
}

function SubmittedBox({ label = 'Submitted!', sub = 'Waiting for others…' }) {
  return (
    <div className="text-center py-10 bg-zinc-900 border border-zinc-800 rounded-2xl">
      <div className="text-4xl mb-3">✅</div>
      <p className="text-zinc-200 font-semibold">{label}</p>
      <p className="text-zinc-500 text-sm mt-1">{sub}</p>
    </div>
  );
}

function SpectatorScreen({ logs }) {
  return (
    <div className="text-center py-12 px-4 space-y-3">
      <div className="text-5xl">💀</div>
      <h2 className="text-2xl font-black text-zinc-500">You are eliminated</h2>
      <p className="text-zinc-600 text-sm">Stay silent until the session ends.</p>
      {logs && <p className="text-zinc-400 text-sm bg-zinc-900 border border-zinc-800 rounded-xl p-3">{logs}</p>}
    </div>
  );
}

function PlayerCard({ player, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="flex flex-col items-center p-4 bg-zinc-900 rounded-2xl border border-zinc-800 hover:border-zinc-600 active:scale-95 transition gap-2 disabled:opacity-40">
      <Avatar num={player.avatar} size={11} />
      <span className="text-sm font-semibold text-center w-full truncate px-1">{player.name}</span>
    </button>
  );
}

// ─── Role & phase colours ─────────────────────────────────────────────────────
const ROLE_INFO = {
  KILLER:    { label:'Killer',    emoji:'🔪', color:'#ef4444', bg:'rgba(127,29,29,0.45)',   border:'#991b1b', desc:'Eliminate one player each night without being caught.' },
  ANGEL:     { label:'Angel',     emoji:'😇', color:'#60a5fa', bg:'rgba(30,58,138,0.45)',   border:'#1d4ed8', desc:'Protect one player each night from the Killer.' },
  DETECTIVE: { label:'Detective', emoji:'🔍', color:'#facc15', bg:'rgba(113,63,18,0.45)',   border:'#92400e', desc:'Identify the Killer directly. Guess wrong and you die.' },
  CITIZEN:   { label:'Citizen',   emoji:'🏙️', color:'#d4d4d8', bg:'rgba(39,39,42,0.6)',    border:'#52525b', desc:'Find and vote out the Killer with your fellow citizens.' },
};
const PHASE_COLORS = {
  ROLE_REVEAL:'#3b82f6', NIGHT:'#6366f1', NIGHT_DONE:'#a855f7',
  DISCUSSION:'#eab308', VOTING:'#ef4444', VOTING_RESULT:'#71717a', WINNER:'#71717a',
};
const STATUS_LABELS = {
  ROLE_REVEAL:'Role Reveal', NIGHT:'Night', NIGHT_DONE:'Night — All Submitted',
  DISCUSSION:'Discussion', VOTING:'Voting', VOTING_RESULT:'Results', WINNER:'Session Over',
};
const DEFAULT_CONFIG = { roleRevealTime:12, questionTime:20, discussionTime:120, votingTime:30, resultDuration:8 };

// ─── APP BOOT STATE ───────────────────────────────────────────────────────────
// 'booting'  — socket not yet connected, trying to rejoin if session exists
// 'home'     — no active session, show main menu
// 'joining'  — waiting for server response to join/create
// 'in_game'  — active room

export default function App() {
  const socketRef = useRef(null);
  const [appState, setAppState]                 = useState('booting');
  const [room, setRoom]                         = useState(null);
  const [myInfo, setMyInfo]                     = useState(null);
  const [name, setName]                         = useState('');
  const [code, setCode]                         = useState('');
  const [error, setError]                       = useState('');
  const [showRole, setShowRole]                 = useState(false);
  const [timer, setTimer]                       = useState(0);
  const [maxTimer, setMaxTimer]                 = useState(0);
  const [myVote, setMyVote]                     = useState(null);
  const [myNightSubmitted, setMyNightSubmitted] = useState(false);
  const [gameEnded, setGameEnded]               = useState(null);
  const [showConfig, setShowConfig]             = useState(false);
  const [pendingConfig, setPendingConfig]       = useState(DEFAULT_CONFIG);

  useEffect(() => {
    const hasSaved = !!sessionStorage.getItem('killerSession');

    const socket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 1500,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      const saved = sessionStorage.getItem('killerSession');
      if (saved) {
        try {
          const { roomId, playerId } = JSON.parse(saved);
          // Stay in 'booting' while we wait for rejoinGame response
          socket.emit('rejoinGame', { roomId, playerId });
        } catch {
          sessionStorage.removeItem('killerSession');
          setAppState('home');
        }
      } else {
        setAppState('home');
      }
    });

    socket.on('disconnect', () => {
      // Don't reset to home on socket disconnect — keep showing game state
      // The socket will reconnect automatically and re-emit rejoinGame
    });

    socket.on('joined', ({ roomId, playerId }) => {
      setError('');
      setMyInfo({ roomId, playerId });
      sessionStorage.setItem('killerSession', JSON.stringify({ roomId, playerId }));
      setAppState('in_game');
    });

    socket.on('rejoinFailed', msg => {
      sessionStorage.removeItem('killerSession');
      setMyInfo(null);
      setRoom(null);
      setError(msg || 'Session expired.');
      setAppState('home');
    });

    socket.on('roomUpdate', r => {
      setTimer(r.timer || 0);
      setMaxTimer(r.maxTimer || 0);
      if (r.myActions?.submitted) setMyNightSubmitted(true);
      // Sync pendingConfig from room so sliders always reflect current values
      if (r.config) setPendingConfig(prev => ({ ...prev, ...r.config }));

      setRoom(prev => {
        if (prev?.status !== r.status) {
          if (r.status === 'ROLE_REVEAL') { setShowRole(false); setMyNightSubmitted(false); }
          if (r.status === 'NIGHT')       { setMyNightSubmitted(false); }
          if (r.status === 'VOTING')      { setMyVote(null); }
        }
        return r;
      });
    });

    socket.on('tick', ({ timer: t, maxTimer: m }) => {
      setTimer(t);
      setMaxTimer(m);
    });

    socket.on('joinError', msg => {
      setError(msg);
      setAppState('home');
    });

    socket.on('hostLeft', ({ reason } = {}) => {
      sessionStorage.removeItem('killerSession');
      setRoom(null);
      setMyInfo(null);
      setError(reason || 'Host disconnected. Game ended.');
      setAppState('home');
    });

    socket.on('gameEnded', data => {
      setGameEnded(data.scores);
      sessionStorage.removeItem('killerSession');
      setRoom(null);
      setMyInfo(null);
      setAppState('home');
    });

    return () => socket.disconnect();
  }, []);

  const emit = useCallback((ev, data) => socketRef.current?.emit(ev, data), []);

  const handleHost = () => {
    if (!name.trim()) return setError('Enter your name first.');
    setError(''); setAppState('joining');
    emit('createRoom', { name: name.trim() });
  };
  const handleJoin = () => {
    if (!name.trim()) return setError('Enter your name first.');
    if (code.trim().length < 6) return setError('Enter the full 6-digit code.');
    setError(''); setAppState('joining');
    emit('joinRoom', { roomId: code.trim(), name: name.trim() });
  };
  const handleNightAction = targetId => {
    if (myNightSubmitted) return;
    setMyNightSubmitted(true);
    emit('submitNightAction', { roomId: myInfo.roomId, targetId });
  };
  const handleVote = targetId => {
    if (myVote) return;
    setMyVote(targetId);
    emit('submitVote', { roomId: myInfo.roomId, targetId });
  };
  const applyConfig = (key, val) => setPendingConfig(prev => ({ ...prev, [key]: val }));

  const me     = room?.players?.find(p => p.id === myInfo?.playerId);
  const isHost = !!(me && room && me.id === room.hostId);
  const roomId = myInfo?.roomId;

  // ── BOOTING ──────────────────────────────────────────────────────────────────
  if (appState === 'booting' || appState === 'joining') {
    return (
      <Screen>
        <div className="flex flex-col items-center justify-center min-h-screen gap-5">
          <div className="text-center select-none">
            <div className="text-6xl mb-3">🔪</div>
            <h1 className="text-4xl font-black text-red-500 tracking-tight">KILLER</h1>
            <h2 className="text-2xl font-black text-zinc-400 tracking-widest">IN THE CITY</h2>
          </div>
          <Spinner size={10} />
          <p className="text-zinc-500 text-sm">
            {appState === 'booting' ? 'Connecting…' : 'Joining…'}
          </p>
        </div>
      </Screen>
    );
  }

  // ── GAME ENDED ────────────────────────────────────────────────────────────────
  if (gameEnded) {
    const sorted = [...gameEnded].sort((a, b) => b.score - a.score);
    return (
      <Screen>
        <div className="py-10 text-center space-y-4">
          <div className="text-5xl">🏆</div>
          <h1 className="text-3xl font-black text-yellow-400">Game Over</h1>
          <p className="text-zinc-500">Final standings</p>
          <div className="space-y-2">
            {sorted.map((p, i) => (
              <div key={p.name} className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3">
                <span className="text-zinc-600 font-black w-5 text-sm">{i + 1}</span>
                <Avatar num={p.avatar} size={9} />
                <span className="flex-1 font-semibold text-left truncate">{p.name}</span>
                <span className="text-yellow-400 font-black text-lg">{p.score}</span>
              </div>
            ))}
          </div>
          <button className="btn-primary" onClick={() => { setGameEnded(null); setAppState('home'); setError(''); }}>
            Back to Menu
          </button>
        </div>
      </Screen>
    );
  }

  // ── HOME ──────────────────────────────────────────────────────────────────────
  if (appState === 'home') {
    return (
      <Screen>
        <div className="flex flex-col items-center justify-center min-h-screen py-12">
          <div className="mb-10 text-center select-none">
            <div className="text-6xl mb-3">🔪</div>
            <h1 className="text-4xl font-black text-red-500 tracking-tight">KILLER</h1>
            <h2 className="text-2xl font-black text-zinc-400 tracking-widest">IN THE CITY</h2>
          </div>

          <div className="w-full max-w-xs space-y-3 mb-10">
            {error && (
              <div className="bg-red-900/30 border border-red-800 text-red-300 text-sm rounded-2xl p-3 text-center">
                {error}
              </div>
            )}
            <input className="input-field border-red-950 border-3" placeholder="Your name" value={name} maxLength={20}
              onChange={e => { setName(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleHost()} />
          </div>
                
          <div className="w-full max-w-xs space-y-3 mt-5">
            <input className="input-field text-center tracking-widest text-xl font-bold"
              placeholder="Game code" value={code} inputMode="numeric" maxLength={6}
              onChange={e => { setCode(e.target.value.replace(/\D/g,'').slice(0,6)); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleJoin()} />
            <button className="btn-secondary w-full" onClick={handleJoin}>🚪  Join Game</button>
            <Divider label="or host" />
            <button className="btn-primary w-full" onClick={handleHost}>🎮  Host a Game</button>
          </div>
        </div>
      </Screen>
    );
  }

  // ── Waiting for first roomUpdate ──────────────────────────────────────────────
  if (!room || !me) {
    return (
      <Screen>
        <div className="flex flex-col items-center justify-center min-h-screen gap-4">
          <Spinner /><p className="text-zinc-500">Loading game…</p>
        </div>
      </Screen>
    );
  }

  // ── LOBBY ─────────────────────────────────────────────────────────────────────
  if (room.status === 'LOBBY') {
    return (
      <Screen>
        <div className="py-6 space-y-5">
          <div className="text-center">
            <p className="text-zinc-500 text-xs uppercase tracking-widest mb-2">Game Code</p>
            <div className="inline-block bg-zinc-900 border border-zinc-700 rounded-3xl px-8 py-5">
              <span className="text-5xl font-black tracking-[0.2em]">{room.id}</span>
            </div>
            <p className="text-zinc-600 text-xs mt-2">Share with friends</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <p className="text-zinc-500 text-xs uppercase tracking-widest mb-3">
              Players — {room.players.length} / 25
            </p>
            <div className="space-y-2">
              {room.players.map(p => (
                <div key={p.id} className="flex items-center gap-3">
                  <Avatar num={p.avatar} size={9} highlight={p.id === me.id} />
                  <span className="flex-1 font-semibold truncate">{p.name}</span>
                  {p.id === room.hostId && <Tag color="yellow">Host</Tag>}
                  {!p.connected && <Tag color="zinc">Offline</Tag>}
                  {isHost && p.id !== me.id && (
                    <button onClick={() => emit('removePlayer', { roomId, playerId: p.id })}
                      className="text-zinc-600 hover:text-red-500 transition px-1 text-xl leading-none">✕</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Settings — host only */}
          {isHost && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
              <button className="w-full flex items-center justify-between px-4 py-3"
                onClick={() => setShowConfig(v => !v)}>
                <span className="text-sm font-semibold text-zinc-300">⚙️  Game Settings</span>
                <span className="text-zinc-500 text-xs">{showConfig ? '▲' : '▼'}</span>
              </button>
              {showConfig && (
                <div className="px-4 pb-5 border-t border-zinc-800 pt-4 space-y-4">
                  <ConfigSlider label="Discussion time"  value={pendingConfig.discussionTime} min={30}  max={300} step={15} format={fmtTime} onChange={v => applyConfig('discussionTime', v)} />
                  <ConfigSlider label="Voting time"      value={pendingConfig.votingTime}      min={15}  max={90}  step={5}  unit="s"        onChange={v => applyConfig('votingTime', v)} />
                  <ConfigSlider label="Result display"   value={pendingConfig.resultDuration}  min={4}   max={15}  step={1}  unit="s"        onChange={v => applyConfig('resultDuration', v)} />
                  <button className="btn-secondary w-full text-sm py-3" onClick={() => {
                    emit('updateConfig', { roomId, config: pendingConfig });
                    setShowConfig(false);
                  }}>✅  Save Settings</button>
                </div>
              )}
            </div>
          )}

          {isHost
            ? room.players.length >= 4
              ? <button className="btn-primary w-full text-lg" onClick={() => emit('startSession', { roomId })}>🚀  Start Game</button>
              : <InfoBox>Need {4 - room.players.length} more player{4 - room.players.length !== 1 ? 's' : ''} to start</InfoBox>
            : <InfoBox>⏳ Waiting for host to start…</InfoBox>
          }
        </div>
      </Screen>
    );
  }

  // ── ROLE REVEAL ───────────────────────────────────────────────────────────────
  if (room.status === 'ROLE_REVEAL') {
    const info = ROLE_INFO[me.role] || ROLE_INFO.CITIZEN;
    return (
      <GameScreen room={room} me={me} isHost={isHost} emit={emit} roomId={roomId} timer={timer} maxTimer={maxTimer}>
        <div className="flex flex-col items-center py-6 gap-5">
          <p className="text-zinc-500 text-xs uppercase tracking-widest">Your Secret Role</p>

          <div onClick={() => setShowRole(true)} style={{ borderColor: showRole ? info.border : '#3f3f46', backgroundColor: showRole ? info.bg : 'transparent' }}
            className="w-full max-w-xs rounded-3xl border-2 p-8 text-center cursor-pointer active:scale-95 transition-all duration-300">
            {showRole ? (
              <>
                <div className="text-6xl mb-4">{info.emoji}</div>
                <h1 className="text-4xl font-black mb-3" style={{ color: info.color }}>{info.label}</h1>
                <p className="text-zinc-300 text-sm leading-relaxed">{info.desc}</p>
              </>
            ) : (
              <div className="py-6">
                <div className="text-5xl mb-4">🃏</div>
                <p className="text-zinc-400 font-semibold">Tap to reveal your role</p>
                <p className="text-zinc-600 text-xs mt-2">Make sure no one is looking!</p>
              </div>
            )}
          </div>

          

          {isHost && (
            <button className="btn-secondary w-full mt-2"
              onClick={() => emit('startNight', { roomId })}>
              🌙  Everyone's ready — Start Night
            </button>
          )}
          {!isHost && (
            <InfoBox>Waiting for host to start the night…</InfoBox>
          )}
        </div>
      </GameScreen>
    );
  }

  // ── NIGHT ─────────────────────────────────────────────────────────────────────
  if (room.status === 'NIGHT' || room.status === 'NIGHT_DONE') {
    const done = room.status === 'NIGHT_DONE';

    if (!me.alive) return (
      <GameScreen room={room} me={me} isHost={isHost} emit={emit} roomId={roomId} timer={timer} maxTimer={maxTimer}>
        <SpectatorScreen />
      </GameScreen>
    );

    const phrase  = room.phrase;
    const targets = room.players.filter(p => p.alive && p.id !== me.id);
    const subs    = room.nightSubmissions || [];
    const allDone = subs.length > 0 && subs.every(s => s.submitted);

    return (
      <GameScreen room={room} me={me} isHost={isHost} emit={emit} roomId={roomId} timer={timer} maxTimer={maxTimer}>
        <div className="py-4 space-y-5">
          <div className="text-center">
            <div className="text-4xl mb-2">🌙</div>
            <h2 className="text-xl font-bold text-zinc-200">
              {phrase?.type === 'citizen' ? 'The city sleeps…' : phrase?.text || '…'}
            </h2>
          </div>

          {/* Submission tracker — visible to everyone */}
          {subs.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3">
              <p className="text-zinc-600 text-xs uppercase tracking-widest mb-2 text-center">
                Submissions — {subs.filter(s => s.submitted).length} / {subs.length}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {subs.map(s => (
                  <div key={s.id} className="flex flex-col items-center gap-1" style={{ opacity: s.submitted ? 1 : 0.35 }}>
                    <Avatar num={s.avatar} size={7} />
                    <span className="text-[9px] text-zinc-400" style={{ maxWidth:40, textOverflow:'ellipsis', overflow:'hidden', whiteSpace:'nowrap' }}>{s.name}</span>
                    <span className="text-[10px]">{s.submitted ? '✅' : '⏳'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* My action area */}
          {done ? (
            <SubmittedBox label="All players submitted!" sub={isHost ? 'Tap Proceed below to reveal the night.' : 'Waiting for host to proceed…'} />
          ) : myNightSubmitted ? (
            <SubmittedBox sub="Waiting for others…" />
          ) : phrase?.type === 'citizen' ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <p className="text-zinc-500 text-xs uppercase tracking-widest mb-3 text-center">Quick Question</p>
              <p className="text-xl font-bold text-center mb-5">{phrase?.text}</p>
              <div className="grid grid-cols-2 gap-3">
                {(phrase?.opts || []).map(opt => (
                  <button key={opt} onClick={() => handleNightAction('CIT_' + opt)}
                    className="p-4 bg-zinc-800 rounded-2xl font-semibold hover:bg-zinc-700 active:scale-95 transition text-sm">
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-zinc-500 text-xs uppercase tracking-widest text-center">Choose a player</p>
              <div className="grid grid-cols-2 gap-3">
                {targets.map(p => <PlayerCard key={p.id} player={p} onClick={() => handleNightAction(p.id)} />)}
                {me.role === 'DETECTIVE' && (
                  <button onClick={() => handleNightAction('NOT_SURE')}
                    className="col-span-2 flex items-center justify-center gap-3 p-4 bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-yellow-700 active:scale-95 transition">
                    <span className="text-2xl">🤔</span>
                    <span className="font-semibold text-zinc-400">Not Sure — Skip</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Host proceed button — only enabled when all submitted */}
          {isHost && (
            <button
              className="btn-primary w-full text-lg"
              disabled={!done}
              onClick={() => emit('advanceNight', { roomId })}
            >
              {done ? '▶  Proceed to Discussion' : `⏳  Waiting (${subs.filter(s=>s.submitted).length}/${subs.length} submitted)`}
            </button>
          )}
        </div>
      </GameScreen>
    );
  }

  // ── DISCUSSION ────────────────────────────────────────────────────────────────
  if (room.status === 'DISCUSSION') {
    return (
      <GameScreen room={room} me={me} isHost={isHost} emit={emit} roomId={roomId} timer={timer} maxTimer={maxTimer}>
        {me.alive ? (
          <div className="py-4 space-y-5">
            <div className="text-center">
              <div className="text-4xl mb-2">💬</div>
              <h2 className="text-xl font-bold">Discussion Time</h2>
              <p className="text-zinc-500 text-sm mt-1">Speak to each other. Find the Killer.</p>
            </div>
            <CircularBoard players={room.players} myId={me.id} />
            <div className="bg-red-950/40 border border-red-900/50 rounded-2xl p-4 text-center">
              <p className="text-red-400 text-xs uppercase tracking-widest mb-1 font-semibold">Night Result</p>
              <p className="text-zinc-200 text-sm">{room.logs}</p>
            </div>
          </div>
        ) : <SpectatorScreen logs={room.logs} />}
      </GameScreen>
    );
  }

  // ── VOTING ────────────────────────────────────────────────────────────────────
  if (room.status === 'VOTING') {
    return (
      <GameScreen room={room} me={me} isHost={isHost} emit={emit} roomId={roomId} timer={timer} maxTimer={maxTimer}>
        {me.alive ? (
          <div className="py-4 space-y-5">
            <div className="text-center">
              <div className="text-4xl mb-2">🗳️</div>
              <h2 className="text-xl font-bold">Vote to Eliminate</h2>
              <p className="text-zinc-500 text-sm mt-1">Who is the Killer?</p>
            </div>
            {myVote
              ? <SubmittedBox label="Vote cast!" sub="Waiting for others…" />
              : <div className="grid grid-cols-2 gap-3">
                  {room.players.filter(p => p.alive && p.id !== me.id).map(p => (
                    <PlayerCard key={p.id} player={p} onClick={() => handleVote(p.id)} />
                  ))}
                </div>
            }
          </div>
        ) : <SpectatorScreen logs={room.logs} />}
      </GameScreen>
    );
  }

  // ── VOTING RESULT ─────────────────────────────────────────────────────────────
  if (room.status === 'VOTING_RESULT') {
    return (
      <GameScreen room={room} me={me} isHost={isHost} emit={emit} roomId={roomId} timer={timer} maxTimer={maxTimer}>
        <div className="py-4 space-y-4">
          <div className="text-center">
            <div className="text-4xl mb-2">📊</div>
            <h2 className="text-xl font-bold">Voting Results</h2>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 text-center">
            <p className="text-zinc-200">{room.logs}</p>
          </div>
          {(room.votingResults || []).map(r => (
            <div key={r.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold">{r.name}</span>
                <span className="text-red-400 font-black">{r.votes} vote{r.votes !== 1 ? 's' : ''}</span>
              </div>
              <p className="text-zinc-500 text-xs">from: {r.voters.join(', ')}</p>
            </div>
          ))}
          {timer > 0 && <p className="text-zinc-600 text-xs text-center">Next round in {timer}s</p>}
        </div>
      </GameScreen>
    );
  }

  // ── WINNER ────────────────────────────────────────────────────────────────────
  if (room.status === 'WINNER') {
    const killer  = room.players.find(p => p.role === 'KILLER');
    const cityWon = room.outcome !== 'KILLER_WIN';
    return (
      <GameScreen room={room} me={me} isHost={isHost} emit={emit} roomId={roomId} timer={timer} maxTimer={maxTimer}>
        <div className="py-4 text-center space-y-5">
          <div>
            <div className="text-6xl mb-3">{cityWon ? '🏙️' : '🔪'}</div>
            <h1 className="text-4xl font-black mb-1" style={{ color: cityWon ? '#4ade80' : '#f87171' }}>
              {cityWon ? 'City Wins!' : 'Killer Wins!'}
            </h1>
            <p className="text-zinc-400 text-sm">{room.logs}</p>
          </div>

          {killer && (
            <div className="flex items-center gap-4 bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <Avatar num={killer.avatar} size={12} highlight={killer.id === me.id} />
              <div className="text-left">
                <p className="text-zinc-500 text-xs uppercase tracking-widest">The Killer was</p>
                <p className="text-xl font-black text-red-400">{killer.name}</p>
              </div>
            </div>
          )}

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <p className="text-zinc-500 text-xs uppercase tracking-widest mb-3">Scores</p>
            {[...room.players].sort((a, b) => b.score - a.score).map((p, i) => (
              <div key={p.id} className={`flex items-center gap-3 py-2 ${i < room.players.length - 1 ? 'border-b border-zinc-800' : ''}`}>
                <span className="text-zinc-600 w-5 text-sm font-bold">{i + 1}</span>
                <Avatar num={p.avatar} size={9} highlight={p.id === me.id} dead={!p.alive} />
                <span className="flex-1 text-sm font-semibold text-left truncate">{p.name}</span>
                {p.role && <span className="text-base">{ROLE_INFO[p.role]?.emoji}</span>}
                <span className="text-yellow-400 font-black">{p.score}</span>
              </div>
            ))}
          </div>

          {isHost ? (
            <div className="space-y-3">
              <button className="btn-primary w-full" onClick={() => emit('startNextSession', { roomId })}>🔄  Next Session</button>
              <button className="btn-secondary w-full" onClick={() => emit('endGame', { roomId })}>🏁  End Game</button>
            </div>
          ) : <InfoBox>Waiting for host to continue…</InfoBox>}
        </div>
      </GameScreen>
    );
  }

  return (
    <Screen>
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <Spinner /><p className="text-zinc-500 text-sm">{room?.status}</p>
      </div>
    </Screen>
  );
}

// ─── Circular board ───────────────────────────────────────────────────────────
function CircularBoard({ players, myId }) {
  const n = players.length;
  const R = 115, cx = 160, cy = 165;
  return (
    <div className="flex justify-center">
      <svg width={320} height={330} className="overflow-visible">
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="#27272a" strokeWidth={1.5} />
        {players.map((p, i) => {
          const angle = (i * 2 * Math.PI) / n - Math.PI / 2;
          const x = cx + R * Math.cos(angle);
          const y = cy + R * Math.sin(angle);
          const isMe = p.id === myId;
          const av   = AVATARS[Math.max(0, (p.avatar - 1) % AVATARS.length)];
          const r    = isMe ? 22 : 19;
          return (
            <g key={p.id}>
              <circle cx={x} cy={y} r={r}
                fill={p.alive ? av.bg : '#27272a'}
                stroke={isMe ? '#fff' : (p.alive ? av.border : '#3f3f46')}
                strokeWidth={isMe ? 2.5 : 1.5}
                opacity={p.alive ? 1 : 0.4}
              />
              <text x={x} y={y} textAnchor="middle" dominantBaseline="central"
                fontSize={r * 1.05}
                style={{ filter: p.alive ? 'none' : 'grayscale(1)' }}>
                {p.alive ? av.emoji : '💀'}
              </text>
              <text x={x} y={y + (y < cy ? -(r + 10) : r + 13)}
                textAnchor="middle" fontSize={9.5}
                fill={p.alive ? '#e4e4e7' : '#52525b'}
                fontWeight={isMe ? '700' : '500'}>
                {p.name.length > 10 ? p.name.slice(0, 9) + '…' : p.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── GameScreen wrapper ───────────────────────────────────────────────────────
function GameScreen({ room, me, isHost, emit, roomId, timer, maxTimer, children }) {
  const [showControls, setShowControls] = useState(false);
  const phaseColor = PHASE_COLORS[room.status] || '#71717a';

  return (
    <Screen>
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur-sm pt-3 pb-3 mb-1">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-zinc-600 text-[10px] uppercase tracking-widest">Room {room.id}</p>
            <p className="text-sm font-bold" style={{ color: phaseColor }}>
              {STATUS_LABELS[room.status] || room.status}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {timer > 0 && room.status !== 'WINNER' && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5 font-mono font-black text-lg tabular-nums"
                style={{ color: phaseColor }}>
                {timer}s
              </div>
            )}
            {/* Host reconnecting banner */}
            {room.hostReconnecting && (
              <div className="text-xs text-yellow-400 bg-yellow-900/30 border border-yellow-800/50 px-2 py-1 rounded-lg">
                Host reconnecting…
              </div>
            )}
            {isHost && (
              <button onClick={() => setShowControls(v => !v)}
                className="bg-zinc-800 rounded-xl p-2 text-zinc-400 hover:text-white transition text-lg leading-none">⚙</button>
            )}
          </div>
        </div>
        {timer > 0 && maxTimer > 0 && room.status !== 'WINNER' && (
          <TimerBar timer={timer} maxTimer={maxTimer} color={phaseColor} />
        )}
      </div>

      {/* Host controls overlay */}
      {showControls && isHost && (
        <div className="fixed inset-0 bg-black/85 z-50 flex flex-col items-center justify-center gap-3 p-6">
          <h2 className="text-xl font-black text-white mb-2">Host Controls</h2>
          <button onClick={() => { emit('pauseGame',  { roomId }); setShowControls(false); }} className="btn-secondary w-full max-w-xs">⏸  Pause</button>
          <button onClick={() => { emit('resumeGame', { roomId }); setShowControls(false); }} className="btn-primary  w-full max-w-xs">▶  Resume</button>
          <button onClick={() => { emit('restartSession', { roomId }); setShowControls(false); }} className="btn-secondary w-full max-w-xs">🔄  Restart Session</button>
          <button onClick={() => { emit('endGame', { roomId }); setShowControls(false); }}
            className="w-full max-w-xs py-4 rounded-2xl font-bold border"
            style={{ background:'rgba(127,29,29,0.4)', borderColor:'#991b1b', color:'#fca5a5' }}>
            🏁  End Game
          </button>
          <button onClick={() => setShowControls(false)} className="text-zinc-500 text-sm mt-1">Cancel</button>
        </div>
      )}

      {children}

      {/* Player bar */}
      <div className="mt-8 pt-4 border-t border-zinc-900">
        <div className="flex justify-around flex-wrap gap-x-3 gap-y-4">
          {room.players.map(p => (
            <div key={p.id} className="flex flex-col items-center gap-1" style={{ minWidth:52 }}>
              <Avatar num={p.avatar} size={9} highlight={p.id === me.id} dead={!p.alive} />
              <span className="text-[10px] text-zinc-400 font-medium text-center leading-tight"
                style={{ maxWidth:56, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {p.name}
              </span>
              <span className="text-[10px] text-yellow-500 font-bold">{p.score}</span>
            </div>
          ))}
        </div>
      </div>
    </Screen>
  );
}

// ─── ConfigSlider ─────────────────────────────────────────────────────────────
function ConfigSlider({ label, value, min, max, step, unit, format, onChange }) {
  const display = format ? format(value) : `${value}${unit}`;
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-zinc-400 text-sm">{label}</span>
        <span className="text-zinc-200 font-bold text-sm tabular-nums">{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-red-500 cursor-pointer" />
      <div className="flex justify-between text-zinc-700 text-xs mt-0.5">
        <span>{format ? format(min) : `${min}${unit}`}</span>
        <span>{format ? format(max) : `${max}${unit}`}</span>
      </div>
    </div>
  );
}

function fmtTime(s) {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), r = s % 60;
  return r === 0 ? `${m}m` : `${m}m ${r}s`;
}
