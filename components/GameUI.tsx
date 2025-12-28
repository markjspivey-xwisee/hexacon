import React, { useState, useMemo } from 'react';
import { GameState, UnitType, StructureType, ResourceType, PlayerColor, Tile, Unit, Player } from '../types';
import { RESOURCES, UNIT_STATS, STRUCTURE_STATS, PLAYER_BG_COLORS, PLAYER_COLORS, RESOURCE_COLORS, TERRAIN_DEFENSE } from '../constants';
import { Shield, Sword, Axe, Crown, History, SkipForward, Copy, Check, Lightbulb, TrendingUp, Footprints, Eye, Hammer, Home, Construction, BrickWall, ChevronDown, ChevronUp, BarChart3, Lock, Loader2, ArrowRightLeft, Store, X } from 'lucide-react';

interface GameUIProps {
  gameState: GameState;
  onEndTurn: () => void;
  onBuild: (type: string, category: 'UNIT' | 'STRUCTURE') => void;
  onTrade: (give: ResourceType, get: ResourceType) => void;
  onShare: () => void;
  onShowStats: () => void;
  isMobile?: boolean;
  localPlayerColor: PlayerColor | null;
}

const ResourceBadge: React.FC<{ type: ResourceType; count: number; income: number }> = ({ type, count, income }) => {
  const icons = { WOOD: '🌲', BRICK: '🧱', WHEAT: '🌾', ORE: '⛰️' };
  return (
    <div className="flex flex-col bg-slate-800 px-3 py-2 rounded border border-slate-700 relative overflow-hidden group min-h-[54px] justify-center">
      <div className="flex justify-between items-center z-10">
        <span className="text-xl mr-1">{icons[type]}</span>
        <span className="font-bold text-white text-lg">{count}</span>
      </div>
      <div className="flex justify-between items-center mt-0.5">
         <div className="flex items-center text-[10px] text-slate-400">
            <Shield size={10} className="mr-0.5" />
            <span>+{TERRAIN_DEFENSE[type]}</span>
         </div>
         <div className="flex items-center text-[11px] font-medium text-green-400">
            <TrendingUp size={12} className="mr-1" />
            <span>+{income}</span>
         </div>
      </div>
    </div>
  );
};

export const GameUI: React.FC<GameUIProps> = ({ gameState, onEndTurn, onBuild, onTrade, onShare, onShowStats, isMobile, localPlayerColor }) => {
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  
  // Logic: In online mode, we always show the LOCAL player's resources/state in the dashboard
  // In local mode, we show the CURRENT active player's state
  const isOnline = !!localPlayerColor;
  const displayedPlayer = isOnline 
      ? gameState.players.find(p => p.color === localPlayerColor) || currentPlayer 
      : currentPlayer;

  const isMyTurn = isOnline ? currentPlayer.color === localPlayerColor : true;
  const isAI = displayedPlayer.isAI; // In local mode this matters, in online mode displayedPlayer is usually me (human)
  
  const [copied, setCopied] = useState(false);
  const [buildTab, setBuildTab] = useState<'UNITS' | 'STRUCTURES'>('UNITS');
  const [logExpanded, setLogExpanded] = useState(!isMobile);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [tradeGive, setTradeGive] = useState<ResourceType>('WOOD');
  const [tradeGet, setTradeGet] = useState<ResourceType>('ORE');

  const handleCopy = () => {
    onShare();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTradeSubmit = () => {
      onTrade(tradeGive, tradeGet);
      // Don't close modal to allow multiple trades, or close if preferred.
      // Keeping open for bulk trading feels better.
  };

  const income = useMemo(() => {
    const inc: Record<ResourceType, number> = { WOOD: 0, BRICK: 0, WHEAT: 0, ORE: 0 };
    (Object.values(gameState.tiles) as Tile[]).forEach(t => {
      if (t.controller === displayedPlayer.color) {
        let amount = 1;
        if (t.structure === StructureType.SETTLEMENT) amount += 1;
        if (t.structure === StructureType.CITY) amount += 2;
        inc[t.resource] += amount;
      }
    });
    return inc;
  }, [gameState.tiles, displayedPlayer.color]);

  const advice = useMemo(() => {
    if (!isMyTurn && isOnline) return `Waiting for ${currentPlayer.color} to end turn...`;
    if (gameState.isProcessing) return "AI is calculating optimum strategy...";
    if (isAI && !isOnline) return "Opponent is thinking...";
    
    const myUnits = Object.values(gameState.units).filter((u: Unit) => u.owner === displayedPlayer.color);
    if (myUnits.length === 0) return "CRITICAL: You have no units! Recruit one immediately.";
    const totalIncome = (Object.values(income) as number[]).reduce((a: number, b: number) => a + b, 0);
    if (totalIncome < 6) return "Economy is weak. Build Settlements to boost income.";
    return "Expand into the Fog of War.";
  }, [gameState, displayedPlayer, isAI, income, isMyTurn, isOnline, currentPlayer.color]);

  const canTrade = displayedPlayer.resources[tradeGive] >= 3;

  return (
    <div className={`flex flex-col h-full bg-slate-900 border-l border-slate-800 p-4 space-y-4 shadow-xl z-20 ${isMobile ? 'w-full' : 'w-full max-w-sm'}`}>
      
      {/* Trade Modal Overlay */}
      {showTradeModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[110] p-4 backdrop-blur-sm">
              <div className="bg-slate-800 p-6 rounded-2xl max-w-sm w-full border border-slate-600 shadow-2xl animate-in fade-in zoom-in duration-200">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-bold flex items-center gap-2"><Store size={22} className="text-yellow-400" /> Marketplace</h3>
                      <button onClick={() => setShowTradeModal(false)} className="text-slate-400 hover:text-white"><X /></button>
                  </div>
                  
                  <div className="space-y-6">
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                           <div className="space-y-1">
                               <label className="text-xs font-bold text-slate-500 uppercase">Give (3)</label>
                               <select 
                                   value={tradeGive} 
                                   onChange={(e) => setTradeGive(e.target.value as ResourceType)}
                                   className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                               >
                                   {RESOURCES.map(r => (
                                       <option key={r} value={r}>{r} ({displayedPlayer.resources[r]})</option>
                                   ))}
                               </select>
                           </div>

                           <div className="flex flex-col items-center justify-center pt-4 text-slate-500">
                               <ArrowRightLeft size={20} />
                           </div>

                           <div className="space-y-1">
                               <label className="text-xs font-bold text-slate-500 uppercase">Get (1)</label>
                               <select 
                                   value={tradeGet} 
                                   onChange={(e) => setTradeGet(e.target.value as ResourceType)}
                                   className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                               >
                                   {RESOURCES.map(r => (
                                       <option key={r} value={r}>{r} ({displayedPlayer.resources[r]})</option>
                                   ))}
                               </select>
                           </div>
                      </div>

                      <div className="bg-slate-900/50 p-3 rounded-lg text-center text-xs text-slate-400 border border-slate-800">
                          Exchange Rate: <strong className="text-white">3 {tradeGive}</strong> for <strong className="text-white">1 {tradeGet}</strong>
                      </div>

                      <button 
                        onClick={handleTradeSubmit} 
                        disabled={!canTrade}
                        className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 text-lg shadow-lg transition-all
                            ${canTrade ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}
                      >
                         {canTrade ? 'Confirm Trade' : 'Insufficient Resources'}
                      </button>
                  </div>
              </div>
          </div>
      )}
      
      <div className="flex justify-between items-center pb-2 border-b border-slate-700">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Hexacon</h1>
          <p className="text-xs text-slate-400">Turn {gameState.turn}</p>
        </div>
        <div className="flex gap-1">
            <button onClick={onShowStats} className="p-2 text-slate-400 hover:text-indigo-400" title="Game Stats">
                <BarChart3 size={18} />
            </button>
            <button onClick={handleCopy} className="p-2 flex items-center space-x-1 text-slate-400 hover:text-blue-400" title="Share Game ID">
                {copied ? <Check size={18} /> : <Copy size={18} />}
            </button>
        </div>
      </div>

      <div className={`bg-indigo-900/40 border border-indigo-500/30 p-3 rounded-lg flex gap-3 items-start transition-colors ${!isMyTurn && isOnline ? 'opacity-70 grayscale' : ''}`}>
        {gameState.isProcessing ? (
             <Loader2 size={18} className="text-indigo-400 shrink-0 mt-0.5 animate-spin" />
        ) : (isMyTurn || !isOnline ? (
            <Lightbulb size={18} className="text-indigo-400 shrink-0 mt-0.5" />
        ) : (
            <Lock size={18} className="text-slate-500 shrink-0 mt-0.5" />
        ))}
        <p className="text-sm text-indigo-100 leading-snug">{advice}</p>
      </div>

      <div className={`p-4 rounded-xl shadow-lg text-white ${PLAYER_BG_COLORS[displayedPlayer.color]} transition-all relative overflow-hidden`}>
        {!isMyTurn && isOnline && (
            <div className="absolute inset-0 bg-black/20 flex items-center justify-center backdrop-blur-[1px] z-10">
                <span className="font-bold text-white/90 bg-black/40 px-3 py-1 rounded-full text-xs border border-white/20">
                    {currentPlayer.color}'s Turn
                </span>
            </div>
        )}
        <div className="flex items-center justify-between mb-3">
            <span className="font-bold text-lg flex items-center gap-2">
                {displayedPlayer.color} 
                {isOnline && <span className="text-[10px] bg-black/20 px-1.5 rounded uppercase">YOU</span>}
                {isAI && !isOnline && "(AI)"}
                {gameState.isProcessing && isAI && !isOnline && <Loader2 size={14} className="animate-spin" />}
            </span>
            <div className="flex items-center gap-1 bg-black/20 px-2 py-1 rounded text-xs">
                <Eye size={14} /> <span>{gameState.visibleHexes?.length || 0}</span>
            </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
           {RESOURCES.map(res => (
             <ResourceBadge key={res} type={res} count={displayedPlayer.resources[res]} income={income[res]} />
           ))}
        </div>
      </div>

      {(!isAI || isOnline) && (
        <div className={`flex-1 flex flex-col min-h-0 space-y-2 transition-opacity duration-200 ${(!isMyTurn && isOnline) ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="flex justify-between items-center">
                 <h3 className="text-xs uppercase text-slate-500 font-bold">Construction</h3>
                 <div className="flex items-center gap-2">
                     <button 
                        onClick={() => setShowTradeModal(true)} 
                        className="px-2 py-1 text-xs font-bold rounded bg-yellow-600 text-white flex items-center gap-1 hover:bg-yellow-500"
                        title="Trade Resources (3:1)"
                     >
                         <Store size={12} /> Market
                     </button>
                     <div className="flex gap-1 bg-slate-800 p-1 rounded-lg">
                         <button onClick={() => setBuildTab('UNITS')} className={`px-2 py-1 text-xs font-bold rounded ${buildTab === 'UNITS' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>UNITS</button>
                         <button onClick={() => setBuildTab('STRUCTURES')} className={`px-2 py-1 text-xs font-bold rounded ${buildTab === 'STRUCTURES' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>BLDGS</button>
                     </div>
                 </div>
            </div>
            
            <div className="grid grid-cols-1 gap-2 overflow-y-auto pr-1">
                {(buildTab === 'UNITS' ? Object.entries(UNIT_STATS) : Object.entries(STRUCTURE_STATS)).map(([type, stats]: [any, any]) => {
                    const cost = stats.cost;
                    const canAfford = Object.entries(cost).every(([r, amt]: [any, any]) => displayedPlayer.resources[r as ResourceType] >= amt);
                    return (
                        <button
                            key={type} disabled={!canAfford} onClick={() => onBuild(type, buildTab === 'UNITS' ? 'UNIT' : 'STRUCTURE')}
                            className={`flex flex-col p-3 rounded-xl border transition-all text-left relative min-h-[64px]
                                ${canAfford ? 'bg-slate-800 border-slate-600 active:scale-[0.98]' : 'bg-slate-900/50 opacity-40 cursor-not-allowed'}`}
                        >
                            <div className="flex justify-between items-center w-full z-10">
                                <span className="font-bold text-sm">{stats.name || type}</span>
                                {buildTab === 'UNITS' && <div className="flex gap-2 text-[10px] bg-slate-700 px-1.5 py-0.5 rounded">
                                    <span className="flex items-center gap-0.5"><Footprints size={10} /> {stats.moves}</span>
                                    <span className="flex items-center gap-0.5"><Sword size={10} /> {stats.power}</span>
                                </div>}
                            </div>
                            <div className="flex gap-2 mt-2 text-[10px] text-slate-400">
                                {Object.entries(cost).map(([r, amt]: [any, any]) => amt > 0 && <span key={r}>{amt}{r[0]}</span>)}
                            </div>
                        </button>
                    )
                })}
            </div>
        </div>
      )}

      <div className="flex flex-col min-h-0 bg-slate-950/50 rounded-xl border border-slate-800 transition-all">
         <button onClick={() => setLogExpanded(!logExpanded)} className="p-3 flex items-center justify-between text-slate-400 text-xs font-bold">
             <div className="flex items-center gap-2"><History size={14} /> Battle Log</div>
             {logExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
         </button>
         {logExpanded && <div className="max-h-32 overflow-y-auto p-3 pt-0 space-y-1">
             {gameState.gameLog.map((entry, i) => <div key={i} className="text-[11px] text-slate-300 font-mono border-l border-slate-700 pl-2">{entry}</div>)}
         </div>}
      </div>

      {(!isAI || isOnline) && (
          <button 
            onClick={onEndTurn} 
            disabled={(!isMyTurn && isOnline) || gameState.isProcessing}
            className={`w-full py-4 font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all
                ${((!isMyTurn && isOnline) || gameState.isProcessing) 
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700' 
                    : 'bg-indigo-600 active:bg-indigo-700 text-white hover:bg-indigo-500'}`}
          >
            {gameState.isProcessing ? "AI Playing..." : ((!isMyTurn && isOnline) ? `Waiting for ${currentPlayer.color}` : 'End Turn')} 
            {!gameState.isProcessing && isMyTurn && <SkipForward size={20} />}
            {gameState.isProcessing && <Loader2 size={20} className="animate-spin" />}
          </button>
      )}
    </div>
  );
};