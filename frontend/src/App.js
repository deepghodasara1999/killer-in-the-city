import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';

const socket = io('https://killer-in-the-city-ihef.onrender.com'); // Replace with actual URL

export default function App() {
    const [room, setRoom] = useState(null);
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [timer, setTimer] = useState(0);
    const [showRole, setShowRole] = useState(false);

    useEffect(() => {
        socket.on('roomUpdate', (r) => {
            setRoom(r);
            if (r.status === 'ROLE_REVEAL') {
                setShowRole(true);
                setTimeout(() => setShowRole(false), 5000);
            }
        });
        socket.on('tick', setTimer);
        socket.on('error', (m) => { alert(m); window.location.reload(); });
    }, []);

    if (!room) return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 font-sans">
            <h1 className="text-5xl font-black text-red-600 mb-10 tracking-tighter">KILLER CITY</h1>
            <div className="w-full max-w-xs space-y-4">
                <input className="w-full bg-zinc-900 border border-zinc-800 p-4 rounded-xl" placeholder="Name" onChange={e=>setName(e.target.value)} />
                <button className="w-full bg-red-600 p-4 rounded-xl font-bold" onClick={()=>socket.emit('createRoom',{name})}>HOST GAME</button>
                <div className="flex gap-2">
                    <input className="flex-1 bg-zinc-900 border border-zinc-800 p-4 rounded-xl" placeholder="Code" onChange={e=>setCode(e.target.value)} />
                    <button className="bg-zinc-700 px-6 rounded-xl font-bold" onClick={()=>socket.emit('joinRoom',{roomId:code, name})}>JOIN</button>
                </div>
            </div>
        </div>
    );

    const me = room.players.find(p => p.id === socket.id);
    const isHost = socket.id === room.hostId;

    return (
        <div className="min-h-screen bg-zinc-950 text-white p-4 max-w-lg mx-auto flex flex-col">
            {/* Header: Timer & Room Info */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <p className="text-[10px] text-zinc-500 uppercase">Room: {room.id}</p>
                    <p className="text-xl font-bold text-red-500">{room.status}</p>
                </div>
                <div className="text-4xl font-mono font-black text-white bg-zinc-900 px-4 py-2 rounded-lg border border-zinc-800">
                    {timer}s
                </div>
            </div>

            {/* Logs Area */}
            <div className="bg-red-600/10 border-l-4 border-red-600 p-4 mb-8 text-sm italic">
                {room.logs}
            </div>

            {/* Main Action View */}
            <div className="flex-1">
                {room.status === 'LOBBY' && (
                    <div className="text-center">
                        <h2 className="text-zinc-400 mb-4 font-bold uppercase text-xs">Assign Physical Seats</h2>
                        <div className="relative w-64 h-64 border-2 border-dashed border-zinc-800 rounded-full mx-auto flex items-center justify-center mb-8">
                           {room.players.map((p, i) => (
                               <div key={p.id} className="absolute text-[10px] bg-zinc-800 px-2 py-1 rounded-full" style={{transform: `rotate(${i*360/room.players.length}deg) translate(100px) rotate(-${i*360/room.players.length}deg)`}}>
                                   {p.name}
                               </div>
                           ))}
                           <span className="text-zinc-600 text-xs text-center uppercase">Table<br/>Layout</span>
                        </div>
                        {isHost && room.players.length >= 4 && (
                            <button onClick={()=>socket.emit('startSession', room.id)} className="bg-white text-black px-10 py-4 rounded-full font-black hover:scale-105 transition">START GAME</button>
                        )}
                    </div>
                )}

                {room.status === 'ROLE_REVEAL' && (
                    <div className="text-center py-10 animate-pulse">
                        <h2 className="text-zinc-500 uppercase text-sm mb-4">Your Secret Identity</h2>
                        <div className={`p-10 rounded-3xl border-2 transition-all ${showRole ? 'bg-red-600 border-red-400 scale-100' : 'bg-zinc-900 border-zinc-800 scale-95'}`}>
                            {showRole ? <h1 className="text-6xl font-black">{me.role}</h1> : <button onClick={()=>setShowRole(true)} className="text-zinc-700">Tap to Reveal</button>}
                        </div>
                        <p className="mt-6 text-xs text-zinc-500">Auto-hiding in 5 seconds...</p>
                    </div>
                )}

                {room.status === 'NIGHT' && me.alive && (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-bold text-center italic">
                            {me.role === 'CITIZEN' ? "The City Sleeps..." : room.phrase[me.role[0]]}
                        </h2>
                        {me.role !== 'CITIZEN' ? (
                            <div className="grid grid-cols-2 gap-3">
                                {room.players.filter(p=>p.alive && p.id !== socket.id).map(p=>(
                                    <button key={p.id} onClick={()=>socket.emit('submitNightAction',{roomId:room.id, targetId:p.id})} className="p-4 bg-zinc-900 rounded-2xl border border-zinc-800 active:bg-red-600">
                                        {p.name}
                                    </button>
                                ))}
                                {me.role === 'DETECTIVE' && <button onClick={()=>socket.emit('submitNightAction',{roomId:room.id, targetId:'NOT_SURE'})} className="p-4 bg-zinc-800 rounded-2xl">Not Sure</button>}
                            </div>
                        ) : (
                            <div className="text-center p-8 bg-zinc-900 rounded-3xl border border-zinc-800">
                                <p className="text-zinc-500 mb-2 uppercase text-[10px]">Distraction Task</p>
                                <p className="text-2xl font-bold">{room.citQ.q}</p>
                                <input className="mt-4 bg-black border border-zinc-700 p-2 rounded w-full text-center" placeholder="Think..." />
                            </div>
                        )}
                    </div>
                )}

                {room.status === 'VOTING' && me.alive && (
                    <div className="grid grid-cols-2 gap-3">
                        {room.players.filter(p=>p.alive && p.id !== socket.id).map(p=>(
                            <button key={p.id} onClick={()=>socket.emit('submitVote',{roomId:room.id, targetId:p.id})} className="p-4 bg-zinc-900 rounded-2xl border border-zinc-800 hover:border-red-600">
                                Vote {p.name}
                            </button>
                        ))}
                    </div>
                )}

                {room.status === 'WINNER' && (
                    <div className="text-center py-10">
                        <h1 className="text-6xl font-black text-yellow-500 mb-4">VICTORY</h1>
                        <p className="text-xl uppercase tracking-widest mb-10">{room.logs}</p>
                        <button onClick={()=>window.location.reload()} className="bg-white text-black px-10 py-4 rounded-full font-bold">REMATCH</button>
                    </div>
                )}
            </div>

            {/* Footer: Circular Board / Leaderboard */}
            <div className="mt-10 border-t border-zinc-900 pt-6">
                <div className="grid grid-cols-5 gap-4">
                    {room.players.sort((a,b)=>a.avatar-b.avatar).map(p => (
                        <div key={p.id} className={`flex flex-col items-center ${!p.alive ? 'opacity-20 grayscale' : ''}`}>
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold ${p.id === socket.id ? 'bg-red-600' : 'bg-zinc-800'}`}>
                                {p.avatar}
                            </div>
                            <span className="text-[10px] mt-1 truncate w-full text-center">{p.name}</span>
                            <span className="text-[10px] text-yellow-600 font-bold">{p.score}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}