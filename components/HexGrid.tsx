import React, { useMemo, useState } from 'react';
import { GameState, HexCoordinate, PlayerColor, Tile, StructureType, FloatingText, UnitType } from '../types';
import { hexToPixel, getNeighbors, getHexId } from '../utils/hexUtils';
import { HEX_SIZE, RESOURCE_COLORS, PLAYER_COLORS, TERRAIN_DEFENSE, MAX_MAP_RADIUS, PLAYER_BG_COLORS, FACTION_INFO } from '../constants';
import { Trees, Mountain, Wheat, BrickWall, Castle, User, EyeOff, Shield, Home, Building2, Milestone, Gem, TowerControl, Sparkles, Star, Footprints, Sword, Anchor, Crown, ShieldAlert, Compass, Axe, Ship } from 'lucide-react';

interface HexGridProps {
  gameState: GameState;
  onTileClick: (tileId: string) => void;
  validMoves?: string[]; // IDs of tiles valid for moving to
  validAttacks?: string[]; // IDs of tiles valid for attacking
}

// 1. Base Tile Renderer
const HexTileBase: React.FC<{
  tile: Tile;
  isVisible: boolean;
  defenseBonus: number;
  onClick: () => void;
  cursorClass: string;
  onHover: (tileId: string | null) => void;
}> = ({ tile, isVisible, defenseBonus, onClick, cursorClass, onHover }) => {
  const { x, y } = hexToPixel(tile);
  const points = useMemo(() => {
    const angles = [0, 60, 120, 180, 240, 300];
    return angles.map(angle => {
      const rad = Math.PI / 180 * angle;
      return `${HEX_SIZE * Math.cos(rad)},${HEX_SIZE * Math.sin(rad)}`;
    }).join(' ');
  }, []);

  let fillColor = RESOURCE_COLORS[tile.resource] || '#94a3b8';
  let stroke = '#1e293b'; 
  let strokeWidth = 2;

  if (tile.structure === StructureType.MONOLITH) fillColor = '#0f172a';
  if (tile.structure === StructureType.WONDER) fillColor = '#422006';

  if (!isVisible) {
      fillColor = '#020617'; 
      stroke = '#0f172a';
  }

  const TerrainIcon = () => {
    if (!isVisible) return <EyeOff size={16} className="text-slate-700 opacity-20" />;
    if (tile.structure === StructureType.MONOLITH) return <Gem size={24} className="text-violet-400 drop-shadow-[0_0_15px_rgba(167,139,250,0.6)] animate-pulse" />;
    if (tile.structure === StructureType.WONDER) return <Star size={24} className="text-yellow-400 drop-shadow-[0_0_15px_rgba(234,179,8,0.8)] animate-spin-slow" fill="currentColor" />;
    const iconProps = { size: 16, className: "opacity-40 text-slate-200" };
    switch (tile.resource) {
      case 'WOOD': return <Trees {...iconProps} />;
      case 'ORE': return <Mountain {...iconProps} />;
      case 'WHEAT': return <Wheat {...iconProps} />;
      case 'BRICK': return <BrickWall {...iconProps} />;
      default: return null;
    }
  };

  return (
    <g transform={`translate(${x}, ${y})`} onClick={onClick} onMouseEnter={() => onHover(tile.id)} onMouseLeave={() => onHover(null)} className={`${cursorClass} transition-all duration-200`}>
      <polygon points={points} fill={fillColor} stroke={stroke} strokeWidth={strokeWidth} />
      {isVisible && tile.hasWall && <polygon points={points} fill="none" stroke="#94a3b8" strokeWidth="6" className="opacity-80" />}
      {!isVisible && <polygon points={points} fill="url(#fogPattern)" fillOpacity={0.4} className="pointer-events-none" />}
      
      {/* Terrain Icon - Significantly increased size to prevent clipping of Monolith/Wonder glow effects */}
      <foreignObject x={-30} y={-30} width={60} height={60} className="pointer-events-none">
         <div className="flex justify-center items-center h-full"><TerrainIcon /></div>
      </foreignObject>

      {/* Buildings */}
      {isVisible && tile.structure && tile.structure !== StructureType.MONOLITH && tile.structure !== StructureType.WONDER && (
         <foreignObject x={-20} y={-28} width={40} height={24} className="pointer-events-none">
            <div className="flex justify-center items-center gap-1">
               {tile.isHQ && <Castle size={16} className="text-white drop-shadow-md" fill={PLAYER_COLORS[tile.controller!]} />}
               {!tile.isHQ && tile.structure === StructureType.SETTLEMENT && <Home size={16} className="text-white drop-shadow-md" fill={PLAYER_COLORS[tile.controller!]} />}
               {!tile.isHQ && tile.structure === StructureType.CITY && <Building2 size={20} className="text-white drop-shadow-md" fill={PLAYER_COLORS[tile.controller!]} />}
               {tile.structure === StructureType.PORT && <Anchor size={16} className="text-white drop-shadow-md" />}
               {tile.structure === StructureType.ROAD && <Milestone size={14} className="text-white/50" />}
            </div>
         </foreignObject>
      )}

      {/* Ruins */}
      {isVisible && tile.isRuins && !tile.structure && !tile.unitId && (
          <foreignObject x={-15} y={-15} width={30} height={30} className="pointer-events-none">
             <div className="flex justify-center items-center h-full animate-bounce"><Sparkles size={16} className="text-yellow-400 drop-shadow-md" /></div>
          </foreignObject>
      )}

      {/* Defense Shield */}
      {isVisible && (defenseBonus > 0 || tile.hasWall) && (
          <foreignObject x={8} y={-24} width={24} height={24} className="pointer-events-auto">
             <div className="flex items-center justify-center bg-slate-800 rounded-full w-5 h-5 border border-slate-600 shadow-md cursor-help hover:scale-110 transition-transform" 
                  title={`Defense: ${defenseBonus} (Terrain) ${tile.hasWall ? '+3 (Wall)' : ''}`}>
                <Shield size={10} className={tile.hasWall ? "text-orange-400" : "text-blue-400"} fill="currentColor" />
             </div>
          </foreignObject>
      )}
    </g>
  );
};

// 2. Tile Overlay Renderer
const TileOverlay: React.FC<{
    tile: Tile;
    isSelected: boolean;
    isValidMove: boolean;
    isValidAttack: boolean;
    isVisible: boolean;
}> = ({ tile, isSelected, isValidMove, isValidAttack, isVisible }) => {
    const { x, y } = hexToPixel(tile);
    const points = useMemo(() => {
        const angles = [0, 60, 120, 180, 240, 300];
        return angles.map(angle => {
            const rad = Math.PI / 180 * angle;
            return `${HEX_SIZE * Math.cos(rad)},${HEX_SIZE * Math.sin(rad)}`;
        }).join(' ');
    }, []);

    if (!isVisible) return null;

    let stroke = "none";
    let strokeWidth = 0;
    let className = "pointer-events-none";

    // Monolith/Wonder Borders
    if (tile.structure === StructureType.MONOLITH) {
        stroke = '#8b5cf6'; strokeWidth = 5;
    }
    if (tile.structure === StructureType.WONDER) {
        stroke = '#eab308'; strokeWidth = 5;
    }

    if (isSelected) {
        stroke = '#ffffff'; strokeWidth = 4;
    } else if (isValidAttack) {
        stroke = '#ef4444'; strokeWidth = 4;
    } else if (isValidMove) {
        stroke = '#22c55e'; strokeWidth = 4;
    }

    if (stroke === "none" && !isValidMove && !isValidAttack) return null;

    return (
        <g transform={`translate(${x}, ${y})`} className={className}>
             <polygon points={points} fill="none" stroke={stroke} strokeWidth={strokeWidth} />
             {isValidMove && <circle r={HEX_SIZE * 0.3} fill="#22c55e" fillOpacity={0.4} className="animate-pulse" />}
             {isValidAttack && <circle r={HEX_SIZE * 0.3} fill="#ef4444" fillOpacity={0.4} className="animate-pulse" />}
        </g>
    );
};

// 3. Unit Renderer
const UnitToken: React.FC<{ tile: Tile; gameState: GameState; isVisible: boolean }> = ({ tile, gameState, isVisible }) => {
    if (!tile.unitId || !isVisible) return null;
    const unit = gameState.units[tile.unitId];
    if (!unit) return null;

    const { x, y } = hexToPixel(tile);
    const isMyUnit = unit.owner === gameState.players[gameState.currentPlayerIndex].color;
    const isHidden = !isMyUnit && !unit.revealed;

    const UnitIcon = () => {
        const props = { size: 18, className: "text-white drop-shadow-md" };
        if (isHidden) return <span className="text-xl font-bold text-white">?</span>;
        switch(unit.type) {
            case UnitType.SCOUT: return <Compass {...props} />; // Unique Icon
            case UnitType.SOLDIER: return <User {...props} />;
            case UnitType.KNIGHT: return <Axe {...props} />; // Distinguish from Soldier
            case UnitType.GENERAL: return <Crown {...props} />;
            case UnitType.GALLEY: return <Ship {...props} />;
            default: return <User {...props} />;
        }
    };

    return (
        <g transform={`translate(${x}, ${y})`} className="pointer-events-none">
            <foreignObject x={-32} y={-32} width={64} height={64}>
                <div className="w-full h-full flex items-center justify-center">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.5)] relative
                        ${PLAYER_BG_COLORS[unit.owner]} ${unit.movesLeft === 0 ? 'grayscale opacity-80' : ''}`}
                        style={{ borderColor: 'white' }}
                    >
                        <div className="absolute inset-0.5 rounded-full border border-white/20"></div>
                        
                        <UnitIcon />

                        {/* Movement Indicator (Top Center) */}
                        {isMyUnit && (
                            <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-green-500 text-white text-[9px] font-bold px-1.5 h-4 min-w-[16px] flex items-center justify-center rounded-full border border-white shadow-sm z-30">
                                {unit.movesLeft}
                            </div>
                        )}

                        {/* Stats Row at Bottom */}
                        {!isHidden && (
                            <>
                                {/* Attack Badge (Bottom Left) */}
                                <div className="absolute -bottom-1 -left-1 w-4 h-4 bg-red-600 rounded-full flex items-center justify-center border border-white shadow-sm z-20">
                                    <span className="text-[9px] font-black text-white leading-none">{unit.attack}</span>
                                </div>

                                {/* Defense Badge (Bottom Right) */}
                                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center border border-white shadow-sm z-20">
                                    <span className="text-[9px] font-black text-white leading-none">{unit.defense}</span>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </foreignObject>
        </g>
    );
};

// 4. Tooltip Component
const Tooltip: React.FC<{ tile: Tile | null; gameState: GameState }> = ({ tile, gameState }) => {
    if (!tile) return null;
    const { x, y } = hexToPixel(tile);
    const tooltipX = x + 30; 
    const tooltipY = y - 60;
    
    const isVisible = gameState.visibleHexes ? gameState.visibleHexes.includes(tile.id) : true;
    if (!isVisible) return null;

    const unit = tile.unitId ? gameState.units[tile.unitId] : null;
    const isMyUnit = unit && unit.owner === gameState.players[gameState.currentPlayerIndex].color;
    
    if (!unit && !tile.structure && !tile.isRuins && !tile.isHQ) return null;

    return (
        <g transform={`translate(${tooltipX}, ${tooltipY})`} className="pointer-events-none z-[100]">
            <foreignObject width={200} height={150}>
                <div className="bg-slate-900/95 p-3 rounded-lg border border-slate-600 shadow-2xl text-xs text-white backdrop-blur-sm">
                    {/* Unit Section */}
                    {unit && (
                        <div className="mb-2 pb-2 border-b border-slate-700">
                             <div className="flex justify-between items-center mb-1">
                                 <span className={`font-bold uppercase ${PLAYER_COLORS[unit.owner]}`}>{unit.type}</span>
                                 <div className="flex gap-2">
                                     <span className="bg-red-900/50 px-1.5 py-0.5 rounded text-red-200 border border-red-800 flex items-center gap-1" title="Attack">
                                         <Sword size={10} /> {unit.attack}
                                     </span>
                                     <span className="bg-blue-900/50 px-1.5 py-0.5 rounded text-blue-200 border border-blue-800 flex items-center gap-1" title="Defense">
                                         <Shield size={10} /> {unit.defense}
                                     </span>
                                 </div>
                             </div>
                             {isMyUnit ? (
                                 <div className="text-slate-400 flex items-center gap-1">
                                     <Footprints size={12} className="text-green-400" /> Moves: <span className="text-white font-mono">{unit.movesLeft}/{unit.maxMoves}</span>
                                 </div>
                             ) : (
                                 <div className="text-slate-500 italic">Enemy Unit</div>
                             )}
                        </div>
                    )}
                    
                    {/* Tile/Structure Section */}
                    <div>
                        <div className="font-bold text-slate-300 mb-1">{tile.isHQ ? "Headquarters" : (tile.structure || (tile.isRuins ? "Ancient Ruins" : tile.resource))}</div>
                        <div className="flex gap-2 text-[10px] text-slate-400">
                             <span className="flex items-center gap-1"><Shield size={10} /> Def Bonus: +{TERRAIN_DEFENSE[tile.resource] + (tile.hasWall ? 3 : 0)}</span>
                             {tile.controller && <span className={`uppercase font-bold ${PLAYER_COLORS[tile.controller]}`}>{tile.controller}</span>}
                        </div>
                        {tile.isRuins && <div className="text-yellow-400 mt-1 italic animate-pulse">Explore for rewards!</div>}
                    </div>
                </div>
            </foreignObject>
        </g>
    );
};

export const HexGrid: React.FC<HexGridProps> = ({ gameState, onTileClick, validMoves = [], validAttacks = [] }) => {
  const [hoveredTileId, setHoveredTileId] = useState<string | null>(null);
  
  const tiles = Object.values(gameState.tiles) as Tile[];
  
  const bounds = useMemo(() => {
    if (tiles.length === 0) return { minX: 0, minY: 0, width: 800, height: 700 };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    tiles.forEach(tile => {
        const { x, y } = hexToPixel(tile);
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
    });
    const padding = 100;
    return { minX: minX - padding, minY: minY - padding, width: maxX - minX + padding * 2, height: maxY - minY + padding * 2 };
  }, [tiles.length]); 

  const arenaPath = useMemo(() => {
      const angles = [0, 60, 120, 180, 240, 300];
      const rad = MAX_MAP_RADIUS * 1.5 * HEX_SIZE * 1.732; 
      return angles.map(angle => {
          const r = Math.PI / 180 * angle;
          return `${rad * Math.cos(r)},${rad * Math.sin(r)}`;
      }).join(' ');
  }, []);

  const vertexOffsets = useMemo(() => {
      const angles = [0, 60, 120, 180, 240, 300];
      return angles.map(angle => ({ x: HEX_SIZE * Math.cos(Math.PI / 180 * angle), y: HEX_SIZE * Math.sin(Math.PI / 180 * angle) }));
  }, []);

  const hoveredTile = hoveredTileId ? gameState.tiles[hoveredTileId] : null;

  return (
    <div className="w-full h-full overflow-hidden flex justify-center items-center bg-slate-900 rounded-xl shadow-2xl border border-slate-800 relative">
        <div className="absolute inset-0 opacity-20 pointer-events-none" style={{backgroundImage: 'radial-gradient(circle at 2px 2px, #334155 1px, transparent 0)', backgroundSize: '24px 24px'}}></div>

      <svg width="100%" height="100%" viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`} className="w-full h-full transition-all duration-500 ease-in-out">
        <defs>
            <pattern id="fogPattern" width="4" height="4" patternUnits="userSpaceOnUse">
                <path d="M-1,1 l2,-2 M0,4 l4,-4 M3,5 l2,-2" stroke="#1e293b" strokeWidth="1" />
            </pattern>
        </defs>
        
        <polygon points={arenaPath} fill="none" stroke="#1e293b" strokeWidth="20" strokeDasharray="20 10" className="opacity-50" />
        
        {/* Pass 1: Base Tiles */}
        <g>
          {tiles.map((tile: Tile) => {
             const isVisible = gameState.visibleHexes ? gameState.visibleHexes.includes(tile.id) : true;
             const hasMyUnit = tile.unitId && gameState.units[tile.unitId]?.owner === gameState.players[gameState.currentPlayerIndex].color;
             const isMyTurn = !gameState.players[gameState.currentPlayerIndex].isAI;
             const canInteract = isVisible && (hasMyUnit || tile.controller === gameState.players[gameState.currentPlayerIndex].color) && isMyTurn;
             
             return (
                <HexTileBase
                    key={`base-${tile.id}`}
                    tile={tile}
                    isVisible={isVisible}
                    defenseBonus={TERRAIN_DEFENSE[tile.resource] || 0}
                    onClick={() => onTileClick(tile.id)}
                    cursorClass={(canInteract || validMoves.includes(tile.id) || validAttacks.includes(tile.id)) ? "cursor-pointer" : "cursor-default"}
                    onHover={setHoveredTileId}
                />
            );
          })}
        </g>

        {/* Pass 2: Territory Borders */}
        <g className="pointer-events-none">
            {tiles.map(tile => {
                const isVisible = gameState.visibleHexes ? gameState.visibleHexes.includes(tile.id) : true;
                if (!isVisible || !tile.controller) return null;
                const { x, y } = hexToPixel(tile);
                const neighbors = getNeighbors(tile);
                const edgeMap = [[0, 1], [5, 0], [4, 5], [3, 4], [2, 3], [1, 2]]; 
                return (
                    <g key={`border-${tile.id}`}>
                        {neighbors.map((n, i) => {
                            const nId = getHexId(n.q, n.r, n.s);
                            const nTile = gameState.tiles[nId];
                            const isNeighborVisible = gameState.visibleHexes ? gameState.visibleHexes.includes(nId) : true;
                            if (!nTile || nTile.controller !== tile.controller || !isNeighborVisible) {
                                const [vStart, vEnd] = edgeMap[i];
                                return (
                                    <line key={i} x1={x + vertexOffsets[vStart].x} y1={y + vertexOffsets[vStart].y} x2={x + vertexOffsets[vEnd].x} y2={y + vertexOffsets[vEnd].y} stroke={PLAYER_COLORS[tile.controller!]} strokeWidth="4" strokeLinecap="round" className="opacity-90" />
                                );
                            }
                            return null;
                        })}
                    </g>
                );
            })}
        </g>

        {/* Pass 3: Tile Overlays */}
        <g className="pointer-events-none">
             {tiles.map(tile => {
                const isVisible = gameState.visibleHexes ? gameState.visibleHexes.includes(tile.id) : true;
                return (
                    <TileOverlay 
                        key={`overlay-${tile.id}`}
                        tile={tile}
                        isVisible={isVisible}
                        isSelected={gameState.selectedHexId === tile.id}
                        isValidMove={validMoves.includes(tile.id)}
                        isValidAttack={validAttacks.includes(tile.id)}
                    />
                );
             })}
        </g>

        {/* Pass 4: Units */}
        <g>
            {tiles.map(tile => {
                 const isVisible = gameState.visibleHexes ? gameState.visibleHexes.includes(tile.id) : true;
                 return <UnitToken key={`unit-${tile.id}`} tile={tile} gameState={gameState} isVisible={isVisible} />;
            })}
        </g>
        
        {/* Pass 5: Tooltips (Topmost Layer) */}
        <Tooltip tile={hoveredTile} gameState={gameState} />

        {/* Floating Text Overlay */}
        {gameState.effects.map(effect => (
             <text key={effect.id} x={effect.x} y={effect.y} fill={effect.color} textAnchor="middle" fontSize="16" fontWeight="bold" className="animate-float-up pointer-events-none drop-shadow-md" style={{ animation: 'floatUp 2s ease-out forwards' }}>{effect.text}</text>
        ))}
        <style>{`@keyframes floatUp { 0% { opacity: 1; transform: translateY(0); } 100% { opacity: 0; transform: translateY(-40px); } } .animate-float-up { animation: floatUp 2s ease-out forwards; } .animate-spin-slow { animation: spin 8s linear infinite; } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </svg>
    </div>
  );
};