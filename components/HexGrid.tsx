import React, { useMemo, useState } from 'react';
import { GameState, HexCoordinate, PlayerColor, Tile, StructureType, FloatingText, UnitType } from '../types';
import { hexToPixel, getNeighbors, getHexId } from '../utils/hexUtils';
import { HEX_SIZE, RESOURCE_COLORS, PLAYER_COLORS, TERRAIN_DEFENSE, MAX_MAP_RADIUS, PLAYER_BG_COLORS, FACTION_INFO } from '../constants';
import { Trees, Mountain, Wheat, BrickWall, Castle, User, EyeOff, Shield, Home, Building2, Milestone, Gem, TowerControl, Sparkles, Star, Footprints, Sword, Anchor, Crown, ShieldAlert, Compass, Axe, Ship } from 'lucide-react';

interface HexGridProps {
  gameState: GameState;
  onTileClick: (tileId: string) => void;
  validMoves?: string[]; 
  validAttacks?: string[];
}

// Map PlayerColor to specific Hex codes for SVG fills (Tailwind 500 equivalent)
const UNIT_BG_COLORS: Record<PlayerColor, string> = {
  [PlayerColor.RED]: '#ef4444',
  [PlayerColor.BLUE]: '#3b82f6',
  [PlayerColor.GREEN]: '#22c55e',
  [PlayerColor.YELLOW]: '#eab308',
};

// Helper to generate hex points
const getHexPointsString = (radius: number) => {
    const angles = [0, 60, 120, 180, 240, 300];
    return angles.map(angle => {
      const rad = Math.PI / 180 * angle;
      return `${radius * Math.cos(rad)},${radius * Math.sin(rad)}`;
    }).join(' ');
};

// 1. Base Tile Renderer (Pure SVG)
const HexTileBase: React.FC<{
  tile: Tile;
  isVisible: boolean;
  defenseBonus: number;
  onClick: () => void;
  cursorClass: string;
  onHover: (tileId: string | null) => void;
}> = ({ tile, isVisible, defenseBonus, onClick, cursorClass, onHover }) => {
  const { x, y } = hexToPixel(tile);
  
  const points = useMemo(() => getHexPointsString(HEX_SIZE), []);
  const wallPoints = useMemo(() => getHexPointsString(HEX_SIZE - 6), []);

  let fillColor = RESOURCE_COLORS[tile.resource] || '#94a3b8';
  let stroke = '#1e293b'; 
  let strokeWidth = 2;

  if (tile.structure === StructureType.MONOLITH) fillColor = '#0f172a';
  if (tile.structure === StructureType.WONDER) fillColor = '#422006';

  if (!isVisible) {
      fillColor = '#020617'; 
      stroke = '#0f172a';
  }

  const TerrainIconElement = () => {
    if (!isVisible) return <EyeOff size={20} x={-10} y={-10} className="text-slate-700 opacity-20" />;
    
    // Special Structures
    if (tile.structure === StructureType.MONOLITH) return <Gem size={32} x={-16} y={-16} className="text-violet-400 drop-shadow-[0_0_15px_rgba(167,139,250,0.6)]" />;
    if (tile.structure === StructureType.WONDER) return <Star size={32} x={-16} y={-16} className="text-yellow-400 drop-shadow-[0_0_15px_rgba(234,179,8,0.8)]" fill="currentColor" />;
    
    // Resources
    const iconProps = { size: 24, x: -12, y: -12, className: "opacity-40 text-slate-200" };
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
      
      {/* Visual Road Path (Ground Layer) */}
      {isVisible && tile.hasRoad && (
         <g className="pointer-events-none opacity-40">
            <line x1={-14} y1={0} x2={14} y2={0} stroke="#e2e8f0" strokeWidth="4" strokeLinecap="round" />
            <line x1={0} y1={-14} x2={0} y2={14} stroke="#e2e8f0" strokeWidth="4" strokeLinecap="round" />
            <circle cx={0} cy={0} r={4} fill="#e2e8f0" />
         </g>
      )}

      {/* Wall Rendering (Inset) */}
      {isVisible && tile.hasWall && (
          <polygon points={wallPoints} fill="none" stroke="#cbd5e1" strokeWidth="4" className="drop-shadow-sm opacity-90" />
      )}

      {!isVisible && <polygon points={points} fill="url(#fogPattern)" fillOpacity={0.4} className="pointer-events-none" />}
      
      {/* Terrain Icon - Direct SVG */}
      <g className="pointer-events-none">
         <TerrainIconElement />
      </g>

      {/* Buildings - Direct SVG */}
      {isVisible && (tile.structure || tile.hasRoad) && tile.structure !== StructureType.MONOLITH && tile.structure !== StructureType.WONDER && (
         <g transform="translate(0, -20)" className="pointer-events-none">
             {tile.isHQ && <Castle size={20} x={-10} y={-10} className="text-white drop-shadow-md" fill={PLAYER_COLORS[tile.controller!]} />}
             {!tile.isHQ && tile.structure === StructureType.SETTLEMENT && <Home size={20} x={-10} y={-10} className="text-white drop-shadow-md" fill={PLAYER_COLORS[tile.controller!]} />}
             {!tile.isHQ && tile.structure === StructureType.CITY && <Building2 size={24} x={-12} y={-12} className="text-white drop-shadow-md" fill={PLAYER_COLORS[tile.controller!]} />}
             {tile.structure === StructureType.PORT && <Anchor size={20} x={-10} y={-10} className="text-white drop-shadow-md" />}
             {(tile.structure === StructureType.ROAD || tile.hasRoad) && <Milestone size={16} x={-8} y={-8} className="text-white/80 drop-shadow-md" />}
         </g>
      )}

      {/* Ruins - Direct SVG */}
      {isVisible && tile.isRuins && !tile.structure && !tile.unitId && (
          <g className="pointer-events-none">
             <Sparkles size={20} x={-10} y={-10} className="text-yellow-400 drop-shadow-md animate-pulse" />
          </g>
      )}

      {/* Defense Shield - Direct SVG */}
      {isVisible && (defenseBonus > 0 || tile.hasWall) && (
          <g transform="translate(10, -22)" className="pointer-events-auto">
             <circle r={9} fill="#1e293b" stroke="#475569" strokeWidth={1} />
             <Shield size={10} x={-5} y={-5} className={tile.hasWall ? "text-orange-400" : "text-blue-400"} fill="currentColor" />
          </g>
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
    const points = useMemo(() => getHexPointsString(HEX_SIZE), []);

    if (!isVisible) return null;

    let stroke = "none";
    let strokeWidth = 0;

    if (tile.structure === StructureType.MONOLITH) { stroke = '#8b5cf6'; strokeWidth = 5; }
    if (tile.structure === StructureType.WONDER) { stroke = '#eab308'; strokeWidth = 5; }

    if (isSelected) { stroke = '#ffffff'; strokeWidth = 4; } 
    else if (isValidAttack) { stroke = '#ef4444'; strokeWidth = 4; } 
    else if (isValidMove) { stroke = '#22c55e'; strokeWidth = 4; }

    if (stroke === "none" && !isValidMove && !isValidAttack) return null;

    return (
        <g transform={`translate(${x}, ${y})`} className="pointer-events-none">
             <polygon points={points} fill="none" stroke={stroke} strokeWidth={strokeWidth} />
             {isValidMove && <circle r={HEX_SIZE * 0.3} fill="#22c55e" fillOpacity={0.4} className="animate-pulse" />}
             {isValidAttack && <circle r={HEX_SIZE * 0.3} fill="#ef4444" fillOpacity={0.4} className="animate-pulse" />}
        </g>
    );
};

// 3. Unit Renderer (Pure SVG)
const UnitToken: React.FC<{ tile: Tile; gameState: GameState; isVisible: boolean }> = ({ tile, gameState, isVisible }) => {
    if (!tile.unitId || !isVisible) return null;
    const unit = gameState.units[tile.unitId];
    if (!unit) return null;

    const { x, y } = hexToPixel(tile);
    const isMyUnit = unit.owner === gameState.players[gameState.currentPlayerIndex].color;
    const isHidden = !isMyUnit && !unit.revealed;

    const IconElement = () => {
        const props = { size: 20, x: -10, y: -10, color: "white" };
        if (isHidden) return <text x={0} y={0} textAnchor="middle" dominantBaseline="central" fill="white" fontSize={20} fontWeight="bold">?</text>;
        switch(unit.type) {
            case UnitType.SCOUT: return <Compass {...props} />;
            case UnitType.SOLDIER: return <User {...props} />;
            case UnitType.KNIGHT: return <Axe {...props} />;
            case UnitType.GENERAL: return <Crown {...props} />;
            case UnitType.GALLEY: return <Ship {...props} />;
            default: return <User {...props} />;
        }
    };

    return (
        <g transform={`translate(${x}, ${y})`} className="pointer-events-none">
            {/* Shadow */}
            <circle r={18} cx={1} cy={1} fill="black" opacity={0.4} />
            
            {/* Main Token */}
            <circle 
                r={18} 
                fill={UNIT_BG_COLORS[unit.owner]} 
                stroke="white" 
                strokeWidth={2}
                opacity={unit.movesLeft === 0 ? 0.7 : 1}
                filter={unit.movesLeft === 0 ? 'grayscale(100%)' : 'none'}
            />
            
            {/* Unit Icon */}
            <IconElement />

            {/* Badges - Pure SVG */}
            {!isHidden && (
                <>
                    {/* Attack (Bottom Left) */}
                    <circle r={7} cx={-12} cy={12} fill="#dc2626" stroke="white" strokeWidth={1} />
                    <text x={-12} y={13} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize={9} fontWeight="bold">{unit.attack}</text>

                    {/* Defense (Bottom Right) */}
                    <circle r={7} cx={12} cy={12} fill="#2563eb" stroke="white" strokeWidth={1} />
                    <text x={12} y={13} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize={9} fontWeight="bold">{unit.defense}</text>
                </>
            )}

            {/* Moves (Top Center) */}
            {isMyUnit && unit.movesLeft > 0 && (
                <>
                    <rect x={-8} y={-22} width={16} height={10} rx={5} fill="#22c55e" stroke="white" strokeWidth={1} />
                    <text x={0} y={-16} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize={9} fontWeight="bold">{unit.movesLeft}</text>
                </>
            )}
        </g>
    );
};

// 4. Tooltip Component (Pure SVG)
const Tooltip: React.FC<{ tile: Tile | null; gameState: GameState }> = ({ tile, gameState }) => {
    if (!tile) return null;
    const { x, y } = hexToPixel(tile);
    const tooltipX = x + 35; 
    const tooltipY = y - 60;
    
    const isVisible = gameState.visibleHexes ? gameState.visibleHexes.includes(tile.id) : true;
    if (!isVisible) return null;

    const unit = tile.unitId ? gameState.units[tile.unitId] : null;
    const isMyUnit = unit && unit.owner === gameState.players[gameState.currentPlayerIndex].color;
    
    if (!unit && !tile.structure && !tile.isRuins && !tile.isHQ && !tile.hasRoad) return null;

    // SVG Text Rendering helpers
    const lineHeight = 14;
    let currentY = 15;
    const padding = 8;
    const boxWidth = 140;
    
    const lines: React.ReactNode[] = [];

    // Header (Unit)
    if (unit) {
        lines.push(<text key="u-type" x={padding} y={currentY} fill={PLAYER_COLORS[unit.owner]} fontSize={11} fontWeight="bold" textTransform="uppercase">{unit.type}</text>);
        currentY += lineHeight;
        lines.push(
            <g key="u-stats" transform={`translate(${padding}, ${currentY - 4})`}>
                <text fill="#cbd5e1" fontSize={10}>ATK: <tspan fill="white" fontWeight="bold">{unit.attack}</tspan>  DEF: <tspan fill="white" fontWeight="bold">{unit.defense}</tspan></text>
            </g>
        );
        currentY += lineHeight + 4; // Divider gap
    }

    // Header (Terrain/Structure)
    const structName = tile.isHQ ? "Headquarters" : (tile.structure || (tile.isRuins ? "Ruins" : tile.resource));
    lines.push(<text key="t-name" x={padding} y={currentY} fill="white" fontWeight="bold" fontSize={11}>{structName}</text>);
    currentY += lineHeight;

    // Defense Bonus
    const defBonus = TERRAIN_DEFENSE[tile.resource] + (tile.hasWall ? 3 : 0);
    lines.push(<text key="t-def" x={padding} y={currentY} fill="#94a3b8" fontSize={10}>Def Bonus: +{defBonus}</text>);
    currentY += lineHeight;

    // Road Info
    if (tile.hasRoad) {
        lines.push(<text key="t-road" x={padding} y={currentY} fill="#e2e8f0" fontSize={10}>+ Road</text>);
        currentY += lineHeight;
    }

    const boxHeight = currentY + 4;

    return (
        <g transform={`translate(${tooltipX}, ${tooltipY})`} className="pointer-events-none z-[100]">
            {/* Tooltip Background */}
            <rect width={boxWidth} height={boxHeight} rx={6} fill="#0f172a" stroke="#475569" strokeWidth={1} fillOpacity={0.95} />
            {lines}
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
             <text key={effect.id} x={effect.x} y={effect.y} fill={effect.color} textAnchor="middle" fontSize={16} fontWeight="bold" className="animate-float-up pointer-events-none drop-shadow-md" style={{ animation: 'floatUp 2s ease-out forwards' }}>{effect.text}</text>
        ))}
        <style>{`@keyframes floatUp { 0% { opacity: 1; transform: translateY(0); } 100% { opacity: 0; transform: translateY(-40px); } } .animate-float-up { animation: floatUp 2s ease-out forwards; } .animate-spin-slow { animation: spin 8s linear infinite; } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </svg>
    </div>
  );
};