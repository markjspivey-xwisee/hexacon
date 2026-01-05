import React, { useMemo, useState, useRef } from 'react';
import { GameState, PlayerColor, Tile, StructureType, UnitType, Unit } from '../types';
import { hexToPixel, getNeighbors, getHexId } from '../utils/hexUtils';
import { HEX_SIZE, RESOURCE_COLORS, PLAYER_COLORS, TERRAIN_DEFENSE, MAX_MAP_RADIUS } from '../constants';
import { Trees, Mountain, Wheat, BrickWall, Castle, User, EyeOff, Shield, Home, Building2, Anchor, Gem, Sparkles, Star, Sword, Crown, Compass, Axe, Ship } from 'lucide-react';

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

// Helper to generate hex points string
const getHexPointsString = (radius: number) => {
    const angles = [0, 60, 120, 180, 240, 300];
    return angles.map(angle => {
      const rad = Math.PI / 180 * angle;
      return `${radius * Math.cos(rad)},${radius * Math.sin(rad)}`;
    }).join(' ');
};

// Helper to get raw vertices for manual line drawing
const getHexVertices = (radius: number) => {
    const angles = [0, 60, 120, 180, 240, 300];
    return angles.map(angle => {
      const rad = Math.PI / 180 * angle;
      return { x: radius * Math.cos(rad), y: radius * Math.sin(rad) };
    });
};

// 1. Base Tile Renderer (Background + Content)
const HexTileBase: React.FC<{
  tile: Tile;
  neighbors: (Tile | null)[]; 
  isVisible: boolean;
  defenseBonus: number;
  onClick: () => void;
  cursorClass: string;
  onHover: (tileId: string | null) => void;
}> = ({ tile, neighbors, isVisible, defenseBonus, onClick, cursorClass, onHover }) => {
  const { x, y } = hexToPixel(tile);
  
  const points = useMemo(() => getHexPointsString(HEX_SIZE), []);
  const outerVertices = useMemo(() => getHexVertices(HEX_SIZE), []);
  const wallVertices = useMemo(() => getHexVertices(HEX_SIZE - 8), []); 

  let fillColor = RESOURCE_COLORS[tile.resource] || '#94a3b8';
  // Default stroke for unowned/grid lines
  let stroke = '#1e293b'; 
  let strokeWidth = 2;

  if (tile.structure === StructureType.MONOLITH) fillColor = '#0f172a';
  if (tile.structure === StructureType.WONDER) fillColor = '#422006';

  if (!isVisible) {
      fillColor = '#020617'; 
      stroke = '#0f172a';
  }

  // --- Dynamic Road Rendering ---
  const RoadNetwork = () => {
      if (!isVisible || (!tile.hasRoad && !tile.structure && !tile.isHQ)) return null;
      if (!tile.hasRoad && tile.structure === StructureType.MONOLITH) return null; 

      const roadEndPoints = [
          { x: HEX_SIZE * 0.75, y: HEX_SIZE * 0.433 },
          { x: HEX_SIZE * 0.75, y: -HEX_SIZE * 0.433 },
          { x: 0, y: -HEX_SIZE * 0.866 },
          { x: -HEX_SIZE * 0.75, y: -HEX_SIZE * 0.433 },
          { x: -HEX_SIZE * 0.75, y: HEX_SIZE * 0.433 },
          { x: 0, y: HEX_SIZE * 0.866 },
      ];

      const connections = neighbors.map((n, idx) => {
          if (!n) return null;
          const connect = n.hasRoad || (n.structure && n.structure !== StructureType.MONOLITH) || n.isHQ;
          if (connect) {
             const pt = roadEndPoints[idx];
             return <line key={`road-${idx}`} x1={0} y1={0} x2={pt.x} y2={pt.y} stroke="#f1f5f9" strokeWidth="8" strokeLinecap="round" opacity={0.7} />;
          }
          return null;
      });

      return (
          <g className="pointer-events-none">
              {connections}
              <circle r={7} fill="#f1f5f9" opacity={0.7} />
          </g>
      );
  };

  // --- Dynamic Wall Rendering ---
  const WallPerimeter = () => {
      if (!isVisible || !tile.hasWall) return null;
      const edgeToNeighborIndex = [0, 5, 4, 3, 2, 1];

      return (
          <g className="pointer-events-none">
              {wallVertices.map((v, i) => {
                  const nextV = wallVertices[(i + 1) % 6];
                  const neighborIdx = edgeToNeighborIndex[i];
                  const neighbor = neighbors[neighborIdx];
                  const isInterior = neighbor && neighbor.hasWall && neighbor.controller === tile.controller;

                  if (!isInterior) {
                      return (
                          <line key={`wall-${i}`} x1={v.x} y1={v.y} x2={nextV.x} y2={nextV.y} stroke="#94a3b8" strokeWidth="6" strokeLinecap="round" className="drop-shadow-sm" />
                      );
                  }
                  return null;
              })}
              
              {wallVertices.map((v, i) => {
                   const prevEdgeIdx = (i === 0) ? 5 : i - 1;
                   const currEdgeIdx = i;
                   const prevNeighborIdx = edgeToNeighborIndex[prevEdgeIdx];
                   const currNeighborIdx = edgeToNeighborIndex[currEdgeIdx];
                   const prevNeighbor = neighbors[prevNeighborIdx];
                   const currNeighbor = neighbors[currNeighborIdx];
                   const prevHasWall = prevNeighbor && prevNeighbor.hasWall && prevNeighbor.controller === tile.controller;
                   const currHasWall = currNeighbor && currNeighbor.hasWall && currNeighbor.controller === tile.controller;

                   if (prevHasWall !== currHasWall) {
                        return (
                            <line key={`spoke-${i}`} x1={v.x} y1={v.y} x2={outerVertices[i].x} y2={outerVertices[i].y} stroke="#94a3b8" strokeWidth="6" strokeLinecap="round" />
                        );
                   }
                   return null;
              })}

              {wallVertices.map((v, i) => {
                   const prevEdgeIdx = (i === 0) ? 5 : i - 1;
                   const currEdgeIdx = i;
                   const prevNeighborIdx = edgeToNeighborIndex[prevEdgeIdx];
                   const currNeighborIdx = edgeToNeighborIndex[currEdgeIdx];
                   const prevNeighbor = neighbors[prevNeighborIdx];
                   const currNeighbor = neighbors[currNeighborIdx];
                   const prevHasWall = prevNeighbor && prevNeighbor.hasWall && prevNeighbor.controller === tile.controller;
                   const currHasWall = currNeighbor && currNeighbor.hasWall && currNeighbor.controller === tile.controller;

                   if (!(prevHasWall && currHasWall)) {
                       return <circle key={`post-${i}`} cx={v.x} cy={v.y} r={5} fill="#475569" stroke="#cbd5e1" strokeWidth={2} />;
                   }
                   return null;
              })}
          </g>
      );
  };

  const TerrainIconElement = () => {
    if (!isVisible) return <EyeOff size={20} x={-10} y={-10} className="text-slate-700 opacity-20" />;
    
    if (tile.structure === StructureType.MONOLITH) return <Gem size={32} x={-16} y={-16} className="text-violet-400 drop-shadow-[0_0_15px_rgba(167,139,250,0.6)]" />;
    if (tile.structure === StructureType.WONDER) return <Star size={32} x={-16} y={-16} className="text-yellow-400 drop-shadow-[0_0_15px_rgba(234,179,8,0.8)]" fill="currentColor" />;
    
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
      <RoadNetwork />
      <WallPerimeter />
      {!isVisible && <polygon points={points} fill="url(#fogPattern)" fillOpacity={0.4} className="pointer-events-none" />}
      <g className="pointer-events-none"><TerrainIconElement /></g>

      {/* Structures */}
      {isVisible && (tile.structure || tile.hasRoad) && tile.structure !== StructureType.MONOLITH && tile.structure !== StructureType.WONDER && (
         <g transform="translate(0, -20)" className="pointer-events-none">
             {tile.isHQ && <Castle size={20} x={-10} y={-10} className="text-white drop-shadow-md" fill={PLAYER_COLORS[tile.controller!]} />}
             {!tile.isHQ && tile.structure === StructureType.SETTLEMENT && <Home size={20} x={-10} y={-10} className="text-white drop-shadow-md" fill={PLAYER_COLORS[tile.controller!]} />}
             {!tile.isHQ && tile.structure === StructureType.CITY && <Building2 size={24} x={-12} y={-12} className="text-white drop-shadow-md" fill={PLAYER_COLORS[tile.controller!]} />}
             {tile.structure === StructureType.PORT && <Anchor size={20} x={-10} y={-10} className="text-white drop-shadow-md" />}
         </g>
      )}

      {/* Ruins */}
      {isVisible && tile.isRuins && !tile.structure && !tile.unitId && (
          <g className="pointer-events-none"><Sparkles size={20} x={-10} y={-10} className="text-yellow-400 drop-shadow-md animate-pulse" /></g>
      )}

      {/* Terrain Defense Shield (Tile property) */}
      {isVisible && (defenseBonus > 0 || tile.hasWall) && (
          <g transform="translate(10, -22)" className="pointer-events-auto">
             <circle r={9} fill="#1e293b" stroke="#475569" strokeWidth={1} />
             <Shield size={10} x={-5} y={-5} className={tile.hasWall ? "text-orange-400" : "text-blue-400"} fill="currentColor" />
          </g>
      )}
    </g>
  );
};

export const HexGrid: React.FC<HexGridProps> = ({ gameState, onTileClick, validMoves = [], validAttacks = [] }) => {
    const [, setHoveredTileId] = useState<string | null>(null);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const svgRef = useRef<SVGSVGElement>(null);
    const isDragging = useRef(false);
    const lastPos = useRef({ x: 0, y: 0 });
  
    const pixelRadius = (MAX_MAP_RADIUS + 2) * HEX_SIZE * 2;
  
    const handleWheel = (e: React.WheelEvent) => {
      setZoom(z => Math.max(0.2, Math.min(2.5, z - e.deltaY * 0.001)));
    };
  
    const handleMouseDown = (e: React.MouseEvent) => {
        isDragging.current = true;
        lastPos.current = { x: e.clientX, y: e.clientY };
    };
  
    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging.current) return;
        const dx = (e.clientX - lastPos.current.x) / zoom;
        const dy = (e.clientY - lastPos.current.y) / zoom;
        setPan(p => ({ x: p.x - dx, y: p.y - dy }));
        lastPos.current = { x: e.clientX, y: e.clientY };
    };
  
    const handleMouseUp = () => { isDragging.current = false; };
    
    const width = pixelRadius * 2 / zoom;
    const height = pixelRadius * 2 / zoom;
    const vbX = -width / 2 + pan.x;
    const vbY = -height / 2 + pan.y;
    const viewBox = `${vbX} ${vbY} ${width} ${height}`;

    return (
      <div className="w-full h-full bg-slate-950 overflow-hidden cursor-move relative">
         <svg 
            ref={svgRef}
            viewBox={viewBox} 
            className="w-full h-full touch-none select-none"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
         >
           <defs>
             <pattern id="fogPattern" patternUnits="userSpaceOnUse" width="20" height="20" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="20" stroke="#0f172a" strokeWidth="10" />
             </pattern>
           </defs>
           <g>
             {/* 1. Base Layer: Tiles & Content */}
             {Object.values(gameState.tiles).map((tile: Tile) => {
               const neighbors = getNeighbors(tile).map(n => gameState.tiles[getHexId(n.q, n.r, n.s)] || null);
               const isVisible = gameState.visibleHexes?.includes(tile.id) ?? false;
               
               let cursorClass = "cursor-default";
               if (isVisible) {
                   if (validMoves.includes(tile.id)) cursorClass = "cursor-pointer hover:brightness-110";
                   else if (validAttacks.includes(tile.id)) cursorClass = "cursor-crosshair hover:brightness-110";
                   else if (gameState.selectedHexId === tile.id) cursorClass = "cursor-pointer brightness-110";
                   else if (tile.unitId && gameState.units[tile.unitId].owner === gameState.players[gameState.currentPlayerIndex].color) cursorClass = "cursor-pointer";
                   else cursorClass = "cursor-pointer";
               }
  
               let defenseBonus = TERRAIN_DEFENSE[tile.resource] || 0;
               if (tile.hasWall) defenseBonus += 3; 
  
               return (
                 <HexTileBase 
                   key={tile.id}
                   tile={tile}
                   neighbors={neighbors}
                   isVisible={isVisible}
                   defenseBonus={defenseBonus}
                   onClick={() => onTileClick(tile.id)}
                   cursorClass={cursorClass}
                   onHover={setHoveredTileId}
                 />
               );
             })}

             {/* 2. Overlay Layer: Territory Borders (Draw AFTER tiles to prevent clipping) */}
             {Object.values(gameState.tiles).map((tile: Tile) => {
                const isVisible = gameState.visibleHexes?.includes(tile.id) ?? false;
                if (!isVisible || !tile.controller) return null;
                const { x, y } = hexToPixel(tile);
                const points = getHexPointsString(HEX_SIZE);
                return (
                    <polygon 
                        key={`border-${tile.id}`}
                        points={points}
                        transform={`translate(${x}, ${y})`}
                        fill="none"
                        stroke={PLAYER_COLORS[tile.controller]}
                        strokeWidth="3.5"
                        strokeLinejoin="round"
                        className="pointer-events-none"
                    />
                );
             })}
             
             {/* 3. Highlights: Selection, Moves, Attacks */}
             {Object.values(gameState.tiles).map((tile: Tile) => {
                 if (!gameState.visibleHexes?.includes(tile.id)) return null;
                 const { x, y } = hexToPixel(tile);
                 const isSelected = gameState.selectedHexId === tile.id;
                 const isValidMove = validMoves.includes(tile.id);
                 const isValidAttack = validAttacks.includes(tile.id);
                 
                 if (isSelected) {
                     return <polygon key={`sel-${tile.id}`} points={getHexPointsString(HEX_SIZE - 2)} transform={`translate(${x},${y})`} fill="none" stroke="white" strokeWidth="3" className="animate-pulse" pointerEvents="none" />;
                 }
                 if (isValidMove) {
                     return <circle key={`mov-${tile.id}`} cx={x} cy={y} r={8} fill="rgba(255,255,255,0.3)" pointerEvents="none" />;
                 }
                 if (isValidAttack) {
                     return <path key={`atk-${tile.id}`} d={`M${x-10},${y-10} L${x+10},${y+10} M${x+10},${y-10} L${x-10},${y+10}`} stroke="red" strokeWidth="4" pointerEvents="none" />;
                 }
                 return null;
             })}
  
             {/* 4. Units Layer */}
              {Object.values(gameState.units).map((unit: Unit) => {
                  const tile = (Object.values(gameState.tiles) as Tile[]).find(t => t.unitId === unit.id);
                  if (!tile || !gameState.visibleHexes?.includes(tile.id)) return null;
                  const { x, y } = hexToPixel(tile);
                  
                  const Icon = unit.type === UnitType.SCOUT ? Compass :
                               unit.type === UnitType.SOLDIER ? User :
                               unit.type === UnitType.KNIGHT ? Axe :
                               unit.type === UnitType.GENERAL ? Crown :
                               unit.type === UnitType.GALLEY ? Ship : User;
                  
                  const isMyUnit = unit.owner === gameState.players[gameState.currentPlayerIndex].color;
                  const showDetails = unit.revealed || isMyUnit;

                  return (
                      <g key={unit.id} transform={`translate(${x}, ${y})`} className="pointer-events-none transition-all duration-300">
                          {/* Unit Circle */}
                          <circle r={14} fill={UNIT_BG_COLORS[unit.owner]} stroke="white" strokeWidth={2} className="drop-shadow-md" />
                          <Icon size={16} x={-8} y={-8} className="text-white" />
                          
                          {/* Badge: Attack (Bottom Left, Red) */}
                          {(showDetails || unit.attack >= 5) && (
                              <g title="Attack Power">
                                  <circle cx={-10} cy={10} r={6} fill="#ef4444" stroke="white" strokeWidth={1} />
                                  <text x={-10} y={11} fontSize="9" fontWeight="bold" textAnchor="middle" dominantBaseline="middle" fill="white">
                                      {unit.attack}
                                  </text>
                              </g>
                          )}
                          
                          {/* Badge: Moves (Bottom Right, Green) */}
                          {unit.movesLeft < unit.maxMoves && (
                              <g title="Moves Left">
                                  <circle cx={10} cy={10} r={6} fill="#22c55e" stroke="white" strokeWidth={1} />
                                  <text x={10} y={11} fontSize="9" fontWeight="bold" textAnchor="middle" dominantBaseline="middle" fill="white">
                                      {unit.movesLeft}
                                  </text>
                              </g>
                          )}

                           {/* Badge: Defense (Top, Blue) */}
                           {showDetails && (
                              <g title="Defense">
                                  <circle cx={0} cy={-13} r={6} fill="#3b82f6" stroke="white" strokeWidth={1} />
                                  <text x={0} y={-12} fontSize="9" fontWeight="bold" textAnchor="middle" dominantBaseline="middle" fill="white">
                                      {unit.defense}
                                  </text>
                              </g>
                          )}
                      </g>
                  );
              })}
  
             {gameState.effects.map(effect => (
                 <text key={effect.id} x={effect.x} y={effect.y} fill={effect.color} fontSize="14" fontWeight="bold" textAnchor="middle" className="pointer-events-none animate-bounce" style={{ textShadow: '0px 2px 2px rgba(0,0,0,0.8)' }}>
                     {effect.text}
                 </text>
             ))}
  
           </g>
         </svg>
      </div>
    );
  };