import React, { useState, useMemo, useEffect } from 'react';
import { useGameEngine } from './hooks/useGameEngine';
import { HexGrid } from './components/HexGrid';
import { GameUI } from './components/GameUI';
import { UnitType, PlayerColor, Tile, Player, StructureType, Unit } from './types';
import { Sword, Users, Monitor, Info, Globe, Play, Cloud, RotateCcw, AlertTriangle, Loader2, X, ClipboardCopy, Link as LinkIcon, Share2, Menu, LogIn, Key, BarChart3, Trophy, Skull, HelpCircle, Settings } from 'lucide-react';
import { getNeighbors, getHexId } from './utils/hexUtils';
import { PLAYER_BG_COLORS, PLAYER_COLORS } from './constants';

const DEFAULT_CONFIG_TEMPLATE = JSON.stringify({
  apiKey: "AIzaSyDXQ5E9E-rcXYauP9o72AJ_OFAxzpt6mZE",
  authDomain: "hexconquest-b04a1.firebaseapp.com",
  projectId: "hexconquest-b04a1",
  storageBucket: "hexconquest-b04a1.firebasestorage.app",
  messagingSenderId: "1083378229404",
  appId: "1:1083378229404:web:10f03b9eac487ca855cd59",
  measurementId: "G-TGVZS60TJ5"
}, null, 2);

const App: React.FC = () => {
  const { 
    gameState, setupMode, startGame, startOnlineGame, joinGame, resumeLastGame,
    handleMove, handleConstruct, handleTrade, endTurn, setGameState, isOnline, localPlayerColor,
    matchId, firebaseConfigured, saveFirebaseConfig, resetFirebaseConfig,
    savedMatchId, gameError, isCreatingGame, playerId, syncPlayerId
  } = useGameEngine();

  const [buildItem, setBuildItem] = useState<{ id: string, category: 'UNIT' | 'STRUCTURE' } | null>(null);
  const [joinId, setJoinId] = useState("");
  const [joinError, setJoinError] = useState("");
  const [showConfig, setShowConfig] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showHotseatOverlay, setShowHotseatOverlay] = useState(false);
  const [passcodeInput, setPasscodeInput] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [playerCount, setPlayerCount] = useState(2);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('gameId');
    if (id) setJoinId(id.toUpperCase());
    
    // Check if first time user
    const hasVisited = localStorage.getItem('hexacon_visited');
    if (!hasVisited) {
        setShowInstructions(true);
        localStorage.setItem('hexacon_visited', 'true');
    }
  }, []);

  // Hotseat Transition Effect: Only show if offline, not setup, later turn, and NOT AI turn.
  useEffect(() => {
    if (!isOnline && !setupMode && gameState.turn > 1) {
        const currentPlayer = gameState.players[gameState.currentPlayerIndex];
        // If it's an AI player, do NOT show the hotseat overlay.
        if (!currentPlayer.isAI) {
             setShowHotseatOverlay(true);
        }
    }
  }, [gameState.currentPlayerIndex, isOnline, setupMode, gameState.turn, gameState.players]);

  const { validMoves, validAttacks } = useMemo(() => {
    const moves: string[] = [];
    const attacks: string[] = [];
    if (gameState.selectedHexId && !buildItem) {
        const tile = gameState.tiles[gameState.selectedHexId];
        const unit = tile?.unitId ? gameState.units[tile.unitId] : null;
        if (unit && unit.movesLeft > 0) {
            getNeighbors(tile).forEach(n => {
                const nId = getHexId(n.q, n.r, n.s);
                const neighborTile = gameState.tiles[nId];
                if (neighborTile) {
                    if (!neighborTile.unitId) moves.push(nId);
                    else if (gameState.units[neighborTile.unitId].owner !== unit.owner) attacks.push(nId);
                }
            });
        }
    }
    return { validMoves: moves, validAttacks: attacks };
  }, [gameState.selectedHexId, gameState.tiles, gameState.units, buildItem]);

  const handleBuildSelect = (id: string, category: 'UNIT' | 'STRUCTURE') => {
    setBuildItem({ id, category });
  };

  const handleTileClick = (hexId: string) => {
    if (isOnline && gameState.players[gameState.currentPlayerIndex].color !== localPlayerColor) return;
    if (buildItem) {
      handleConstruct(buildItem.id, buildItem.category, hexId);
      setBuildItem(null);
      return;
    }
    if (!gameState.selectedHexId) {
      const tile = gameState.tiles[hexId];
      const unit = tile?.unitId ? gameState.units[tile.unitId] : null;
      if (unit) {
        const isMyUnit = isOnline ? unit.owner === localPlayerColor : unit.owner === gameState.players[gameState.currentPlayerIndex].color;
        if (isMyUnit && !gameState.players[gameState.currentPlayerIndex].isAI) {
            if (unit.movesLeft > 0) setGameState(prev => ({ ...prev, selectedHexId: hexId }));
            else setGameState(prev => ({ ...prev, gameLog: [`Exhausted!`, ...prev.gameLog] }));
        }
      }
    } else {
      const fromId = gameState.selectedHexId;
      if (fromId === hexId) setGameState(prev => ({ ...prev, selectedHexId: null }));
      else if (validMoves.includes(hexId) || validAttacks.includes(hexId)) {
          handleMove(fromId, hexId);
          setGameState(prev => ({ ...prev, selectedHexId: null }));
      } else {
          setGameState(prev => ({ ...prev, selectedHexId: null }));
      }
    }
  };

  const onSyncPasscode = () => {
    if (syncPlayerId(passcodeInput)) {
        setShowSyncModal(false);
        setPasscodeInput("");
        alert("Account Synced! You can now join your games.");
    } else {
        alert("Invalid Passcode.");
    }
  };

  const getInviteUrl = () => {
      let currentUrl = window.location.href;
      // Strip 'blob:' protocol if present (common in preview environments)
      if (currentUrl.startsWith('blob:')) {
          currentUrl = currentUrl.replace('blob:', '');
      }
      try {
          const url = new URL(currentUrl);
          if (matchId) url.searchParams.set('gameId', matchId);
          return url.toString();
      } catch (e) {
          // Fallback if URL construction fails
          return matchId || "";
      }
  };

  // Helper to get stats for a player
  const getPlayerStats = (player: Player) => {
      const tiles = (Object.values(gameState.tiles) as Tile[]).filter(t => t.controller === player.color);
      const units = (Object.values(gameState.units) as Unit[]).filter(u => u.owner === player.color);
      const income = tiles.reduce((acc, t) => {
          let amt = 1;
          if (t.structure === StructureType.SETTLEMENT) amt += 1;
          if (t.structure === StructureType.CITY) amt += 2;
          return acc + amt;
      }, 0);
      return { tileCount: tiles.length, unitCount: units.length, income };
  };

  if (setupMode) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 pb-24">
        {showInstructions && (
            <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[110] p-4">
                <div className="bg-slate-800 p-6 rounded-2xl max-w-2xl w-full border border-slate-700 shadow-2xl relative max-h-[90vh] overflow-y-auto">
                    <button onClick={() => setShowInstructions(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><X size={24} /></button>
                    <h2 className="text-3xl font-black text-white mb-6 flex items-center gap-3">
                        <Info className="text-indigo-500" /> How to Play Hexacon
                    </h2>
                    
                    <div className="space-y-6 text-slate-300">
                        <section>
                            <h3 className="text-xl font-bold text-white mb-2">1. The Objective</h3>
                            <p>Conquer the hexagonal world. Eliminate all other players by destroying their units and taking their territory.</p>
                        </section>

                        <section>
                            <h3 className="text-xl font-bold text-white mb-2">2. Economy</h3>
                            <p>Your territory generates resources at the start of your turn.</p>
                            <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                                <div className="flex items-center gap-2"><span className="text-green-400">🌲 Wood</span> & <span className="text-red-400">🧱 Brick</span>: Used for Buildings & Basic Units.</div>
                                <div className="flex items-center gap-2"><span className="text-yellow-400">🌾 Wheat</span> & <span className="text-slate-400">⛰️ Ore</span>: Used for Cities & Elite Units.</div>
                            </div>
                            <p className="mt-2 text-sm italic">Tip: Build <strong>Settlements</strong> (+1 Income) and upgrade to <strong>Cities</strong> (+2 Income) to fuel your war machine.</p>
                        </section>

                        <section>
                            <h3 className="text-xl font-bold text-white mb-2">3. Combat</h3>
                            <p>Units have power levels. When you attack, the higher power wins.</p>
                            <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                                <li><strong>Scout (Power 2):</strong> Fast (2 moves), cheap.</li>
                                <li><strong>Soldier (Power 4):</strong> The backbone of your army.</li>
                                <li><strong>Knight (Power 7):</strong> Strong offensive unit.</li>
                                <li><strong>General (Power 9):</strong> The ultimate weapon. Expensive.</li>
                            </ul>
                            <p className="mt-2 text-sm text-yellow-500">Warning: Enemy unit power is HIDDEN until they fight (Fog of War).</p>
                        </section>
                         
                         <section>
                            <h3 className="text-xl font-bold text-white mb-2">4. Defense & Terrain</h3>
                            <p>Terrain offers defensive bonuses. Walls add +3 Defense.</p>
                            <p className="text-sm mt-1">Total Defense = Unit Power + Terrain Bonus + Wall Bonus.</p>
                        </section>
                    </div>

                    <button onClick={() => setShowInstructions(false)} className="w-full mt-8 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold text-white shadow-lg">
                        Understood, Commander
                    </button>
                </div>
            </div>
        )}

        {showSyncModal && (
            <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-4">
                <div className="bg-slate-800 p-6 rounded-2xl max-w-md w-full border border-slate-700 shadow-2xl">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-bold flex items-center gap-2"><Key size={20} className="text-yellow-400" /> Sync Device</h3>
                        <button onClick={() => setShowSyncModal(false)}><X /></button>
                    </div>
                    <div className="space-y-4">
                        <div className="bg-slate-900 p-4 rounded-xl border border-slate-700">
                            <p className="text-xs text-slate-500 uppercase font-bold mb-2">Your Current Passcode</p>
                            <div className="flex items-center gap-2 bg-slate-800 p-2 rounded border border-slate-600">
                                <span className="font-mono text-[10px] truncate flex-1">{playerId}</span>
                                <button onClick={() => {navigator.clipboard.writeText(playerId); alert("Copied!")}} className="text-indigo-400 p-1"><ClipboardCopy size={16} /></button>
                            </div>
                        </div>
                        <div className="pt-2 border-t border-slate-700">
                            <p className="text-sm text-slate-400 mb-2">Sync with a different device by entering its passcode:</p>
                            <input type="text" value={passcodeInput} onChange={(e) => setPasscodeInput(e.target.value)} placeholder="Paste Passcode" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs font-mono mb-3" />
                            <button onClick={onSyncPasscode} className="w-full py-3 bg-indigo-600 rounded-xl font-bold flex items-center justify-center gap-2">
                                <LogIn size={18} /> Sync Account
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {showConfig && (
            <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[120] p-4">
                <div className="bg-slate-800 p-6 rounded-2xl max-w-lg w-full border border-slate-700 shadow-2xl">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold flex items-center gap-2"><Monitor size={20} /> Firebase Configuration</h3>
                    <button onClick={() => setShowConfig(false)}><X /></button>
                </div>
                <p className="text-sm text-slate-400 mb-4">
                    To play online, you need a Firebase project. Create one at <a href="https://console.firebase.google.com" target="_blank" rel="noopener noreferrer" className="text-indigo-400 underline">console.firebase.google.com</a>, enable Firestore and Auth (Anonymous), and paste the config object here.
                </p>
                <textarea
                    className="w-full h-48 bg-slate-950 border border-slate-700 rounded-lg p-3 font-mono text-xs text-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                    defaultValue={localStorage.getItem('hex_firebase_config') || DEFAULT_CONFIG_TEMPLATE}
                    id="firebase-config-input"
                    spellCheck={false}
                />
                <div className="flex justify-end gap-2 mt-4">
                    <button onClick={() => {resetFirebaseConfig(); alert("Reset to default!"); window.location.reload();}} className="px-4 py-2 text-red-400 hover:text-red-300 text-sm font-bold">Reset Default</button>
                    <button onClick={() => {
                    const val = (document.getElementById('firebase-config-input') as HTMLTextAreaElement).value;
                    if (saveFirebaseConfig(val)) {
                        setShowConfig(false);
                        alert("Configuration Saved! Refreshing...");
                        window.location.reload();
                    } else {
                        alert("Invalid JSON configuration.");
                    }
                    }} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold">Save & Reload</button>
                </div>
                </div>
            </div>
        )}

        <div className="max-w-md w-full space-y-6 text-center">
            <div className="space-y-2">
                <div className="p-6 bg-indigo-600 rounded-3xl shadow-2xl inline-block mb-2">
                    <Sword size={48} className="text-white" />
                </div>
                <h1 className="text-5xl font-black tracking-tighter text-white">Hexacon</h1>
            </div>

            <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50 backdrop-blur-sm">
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-3">Number of Players</p>
                <div className="flex justify-center gap-3">
                    {[2, 3, 4].map(num => (
                        <button
                            key={num}
                            onClick={() => setPlayerCount(num)}
                            className={`w-16 h-12 rounded-xl font-black text-lg border-2 transition-all flex items-center justify-center gap-2
                                ${playerCount === num 
                                    ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-900/50 scale-105' 
                                    : 'bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300'}`}
                        >
                            {num} <Users size={14} className={playerCount === num ? "opacity-100" : "opacity-50"} />
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
                <button onClick={() => startGame(playerCount)} className="flex items-center p-5 bg-slate-800 border border-slate-700 hover:border-indigo-500 rounded-2xl transition-all group shadow-lg">
                    <Monitor className="text-indigo-400 mr-4 group-hover:scale-110 transition-transform" size={28} />
                    <div className="text-left"><span className="block font-bold">vs AI Advisor</span><span className="text-xs text-slate-500">Single Player ({playerCount}P)</span></div>
                </button>

                <div className="p-5 bg-slate-800 border border-slate-700 rounded-2xl shadow-lg relative overflow-hidden">
                    {gameError && (
                        <div className="mb-3 p-2 bg-red-900/50 border border-red-500/50 rounded flex items-center gap-2 text-xs text-red-200">
                             <AlertTriangle size={14} /> {gameError}
                             <button onClick={() => setShowConfig(true)} className="ml-auto underline font-bold">Fix</button>
                        </div>
                    )}
                    <div className="flex items-center mb-4 justify-between">
                        <div className="flex items-center"><Globe className="text-blue-400 mr-4" size={28} /><span className="font-bold">Online Play</span></div>
                        <button onClick={() => setShowConfig(true)} className="p-2 text-slate-500 hover:text-white" title="Firebase Settings"><Settings size={18} /></button>
                    </div>
                    {savedMatchId && <button onClick={resumeLastGame} className="w-full py-3 mb-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg transition-colors"><RotateCcw size={18} /> Resume Game</button>}
                    <button onClick={() => startOnlineGame(playerCount)} disabled={isCreatingGame} className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold mb-3 flex items-center justify-center gap-2 transition-colors">
                        {isCreatingGame ? <Loader2 className="animate-spin" /> : <Cloud />} {isCreatingGame ? "Creating..." : `Start ${playerCount}P Match`}
                    </button>
                    <div className="flex gap-2">
                        <input type="text" placeholder="GAME ID" className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 uppercase font-bold text-white" value={joinId} onChange={(e) => setJoinId(e.target.value.toUpperCase())} />
                        <button onClick={() => joinGame(joinId)} className="px-6 bg-slate-700 hover:bg-slate-600 rounded-lg font-bold">Join</button>
                    </div>
                </div>
            </div>
            
            <div className="flex justify-center gap-4 mt-4">
                <button onClick={() => setShowInstructions(true)} className="flex items-center gap-2 text-slate-500 hover:text-white transition-colors text-sm font-bold bg-slate-800/50 px-4 py-2 rounded-full">
                    <HelpCircle size={16} /> How to Play
                </button>
                <button onClick={() => setShowSyncModal(true)} className="flex items-center gap-2 text-slate-500 hover:text-white transition-colors text-sm font-bold bg-slate-800/50 px-4 py-2 rounded-full">
                    <Key size={16} /> Sync Account
                </button>
            </div>
        </div>
      </div>
    );
  }

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden flex-col lg:flex-row">
      {/* Hotseat Curtain */}
      {showHotseatOverlay && (
          <div className="fixed inset-0 z-[200] bg-slate-950 flex items-center justify-center flex-col p-6 animate-in fade-in duration-300">
               <h2 className="text-slate-400 uppercase tracking-widest font-bold mb-4">Turn Change</h2>
               <div className={`text-6xl font-black mb-8 ${PLAYER_COLORS[currentPlayer.color]} drop-shadow-lg`}>
                   {currentPlayer.color}'s TURN
               </div>
               <p className="text-slate-400 mb-8 max-w-xs text-center">Pass the device to {currentPlayer.color}. Don't look at the screen until you are the active player!</p>
               <button 
                  onClick={() => setShowHotseatOverlay(false)}
                  className={`px-12 py-6 rounded-2xl text-2xl font-bold text-white shadow-2xl transition-transform hover:scale-105 active:scale-95 ${PLAYER_BG_COLORS[currentPlayer.color]}`}
               >
                   I am Ready
               </button>
          </div>
      )}

      {/* Modals */}
      {showInviteModal && isOnline && matchId && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4">
              <div className="bg-slate-800 p-6 rounded-2xl max-w-md w-full border border-indigo-500 shadow-2xl">
                  <h3 className="text-2xl font-bold mb-2">Invite Players</h3>
                  
                  <p className="text-sm text-slate-400 font-bold uppercase mt-4 mb-1">Share Link</p>
                  <div className="bg-slate-900 p-3 rounded-xl border border-slate-700 flex items-center gap-2 mb-4">
                      <LinkIcon size={18} className="text-indigo-400" />
                      <input readOnly value={getInviteUrl()} className="bg-transparent text-xs w-full focus:outline-none" />
                      <button onClick={async () => {await navigator.clipboard.writeText(getInviteUrl()); alert("Copied!")}} className="bg-indigo-600 px-3 py-1 rounded-lg text-xs font-bold hover:bg-indigo-500">Copy</button>
                  </div>

                  <p className="text-sm text-slate-400 font-bold uppercase mb-1">Game ID</p>
                  <div className="bg-slate-900 p-3 rounded-xl border border-slate-700 flex items-center gap-2 mb-4">
                      <span className="text-slate-500 text-xs font-mono">ID:</span>
                      <input readOnly value={matchId || ""} className="bg-transparent text-xs w-full focus:outline-none font-bold text-white tracking-widest" />
                      <button onClick={async () => {if(matchId) {await navigator.clipboard.writeText(matchId); alert("Copied!")}}} className="bg-slate-700 px-3 py-1 rounded-lg text-xs font-bold hover:bg-slate-600">Copy</button>
                  </div>

                  <button onClick={() => setShowInviteModal(false)} className="w-full py-3 bg-slate-700 rounded-xl font-bold hover:bg-slate-600">Close</button>
              </div>
          </div>
      )}

      {showSyncModal && (
          <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-4">
              <div className="bg-slate-800 p-6 rounded-2xl max-w-md w-full border border-slate-700 shadow-2xl">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xl font-bold flex items-center gap-2"><Key size={20} className="text-yellow-400" /> Sync Device</h3>
                      <button onClick={() => setShowSyncModal(false)}><X /></button>
                  </div>
                  <div className="space-y-4">
                      <div className="bg-slate-900 p-4 rounded-xl border border-slate-700">
                          <p className="text-xs text-slate-500 uppercase font-bold mb-2">Your Current Passcode</p>
                          <div className="flex items-center gap-2 bg-slate-800 p-2 rounded border border-slate-600">
                              <span className="font-mono text-[10px] truncate flex-1">{playerId}</span>
                              <button onClick={() => {navigator.clipboard.writeText(playerId); alert("Copied!")}} className="text-indigo-400 p-1"><ClipboardCopy size={16} /></button>
                          </div>
                      </div>
                      <div className="pt-2 border-t border-slate-700">
                          <p className="text-sm text-slate-400 mb-2">Sync with a different device by entering its passcode:</p>
                          <input type="text" value={passcodeInput} onChange={(e) => setPasscodeInput(e.target.value)} placeholder="Paste Passcode" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs font-mono mb-3" />
                          <button onClick={onSyncPasscode} className="w-full py-3 bg-indigo-600 rounded-xl font-bold flex items-center justify-center gap-2">
                              <LogIn size={18} /> Sync Account
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {showStatsModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4">
              <div className="bg-slate-800 p-6 rounded-2xl max-w-lg w-full border border-slate-700 shadow-2xl">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-bold flex items-center gap-2"><Trophy size={20} className="text-yellow-400" /> Game Stats</h3>
                      <button onClick={() => setShowStatsModal(false)}><X /></button>
                  </div>
                  
                  <div className="space-y-2">
                      <div className="grid grid-cols-4 text-xs font-bold text-slate-500 uppercase px-2 mb-1">
                          <span>Player</span>
                          <span className="text-center">Territory</span>
                          <span className="text-center">Units</span>
                          <span className="text-right">Income</span>
                      </div>
                      {gameState.players.map(p => {
                          const stats = getPlayerStats(p);
                          return (
                            <div key={p.color} className={`grid grid-cols-4 items-center p-3 rounded-lg border border-slate-700 ${p.eliminated ? 'bg-slate-900/50 opacity-50' : 'bg-slate-900'}`}>
                                <div className="flex items-center gap-2">
                                    <div className={`w-3 h-3 rounded-full ${PLAYER_BG_COLORS[p.color]}`} />
                                    <span className="font-bold">{p.color} {p.eliminated && <Skull size={12} className="inline ml-1" />}</span>
                                </div>
                                <div className="text-center font-mono">{stats.tileCount}</div>
                                <div className="text-center font-mono">{stats.unitCount}</div>
                                <div className="text-right font-mono text-green-400">+{stats.income}</div>
                            </div>
                          );
                      })}
                  </div>
              </div>
          </div>
      )}

      {/* Main Board */}
      <div className="flex-1 relative flex flex-col min-h-0">
        <div className="absolute top-0 inset-x-0 p-4 z-30 flex justify-between items-start pointer-events-none">
            <div className="flex gap-2 pointer-events-auto">
                <button onClick={() => setSidebarOpen(!sidebarOpen)} className="lg:hidden p-3 bg-slate-900/80 backdrop-blur rounded-full shadow-xl border border-slate-700 text-white"><Menu size={24} /></button>
                <div className={`p-2 px-4 rounded-full border shadow-xl flex flex-col ${PLAYER_BG_COLORS[currentPlayer.color]} border-white/20 transition-colors duration-500`}>
                   <span className="text-[10px] opacity-80 leading-none">Turn {gameState.turn}</span>
                   <span className="text-xs font-black uppercase">{currentPlayer.color}'s Turn</span>
                </div>
            </div>
            <div className="pointer-events-auto flex flex-col items-end gap-2">
                <div className="flex gap-2">
                    <button onClick={() => setShowSyncModal(true)} className="p-2 bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 rounded-full shadow-xl transition-colors" title="Sync Account">
                        <Key size={20} />
                    </button>
                    {isOnline && (
                        <button onClick={() => setShowInviteModal(true)} className="p-2 bg-indigo-600 rounded-full shadow-xl text-white">
                            <Share2 size={20} />
                        </button>
                    )}
                </div>
                {isOnline && (
                    <div className="bg-slate-900/80 p-2 px-4 rounded-full border border-slate-700 text-xs font-mono text-white shadow-xl">
                        ID: <span className="font-bold text-blue-400">{matchId}</span>
                    </div>
                )}
            </div>
        </div>

        {buildItem && <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 bg-indigo-600 text-white px-6 py-2 rounded-full shadow-2xl font-bold text-sm animate-pulse">Select target tile for {buildItem.id}</div>}

        <HexGrid gameState={gameState} onTileClick={handleTileClick} validMoves={validMoves} validAttacks={validAttacks} />
      </div>

      {/* Responsive Sidebar */}
      <div className={`${isMobile ? (sidebarOpen ? 'fixed inset-0 translate-x-0' : 'fixed inset-0 translate-x-full') : 'relative w-full max-w-sm'} transition-transform duration-300 ease-in-out z-[90]`}>
        {isMobile && <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />}
        <div className={`relative h-full ${isMobile ? 'ml-auto w-[85%]' : 'w-full'} bg-slate-900 shadow-2xl`}>
            {isMobile && <button onClick={() => setSidebarOpen(false)} className="absolute top-4 left-[-50px] p-3 bg-red-600 text-white rounded-full"><X size={24} /></button>}
            <GameUI 
                gameState={gameState} 
                onEndTurn={() => {endTurn(); if(isMobile) setSidebarOpen(false);}} 
                onBuild={(id, cat) => {handleBuildSelect(id, cat as 'UNIT' | 'STRUCTURE'); if(isMobile) setSidebarOpen(false);}} 
                onTrade={handleTrade}
                onShare={() => {setShowInviteModal(true)}} 
                onShowStats={() => {setShowStatsModal(true)}}
                isMobile={isMobile}
                localPlayerColor={localPlayerColor}
            />
        </div>
      </div>
    </div>
  );
};

export default App;