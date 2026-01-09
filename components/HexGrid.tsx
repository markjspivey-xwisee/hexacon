import React, { useMemo, useState, useRef } from 'react';
import { GameState, PlayerColor, Tile, StructureType, UnitType, Unit } from '../types';
import { hexToPixel, getNeighbors, getHexId } from '../utils/hexUtils';
import { HEX_SIZE, RESOURCE_COLORS, PLAYER_COLORS, TERRAIN_DEFENSE, MAX_MAP_RADIUS, STRUCTURE_STATS, TERRAIN_TYPE, UNIT_STATS } from '../constants';
import { Trees, Mountain, Wheat, BrickWall, Castle, User, EyeOff, Shield, Home, Building2, Anchor, Gem, Sparkles, Star, Sword, Crown, Compass, Axe, Ship, Eye, UserX } from 'lucide-react';

interface HexGridProps {
  gameState: GameState;
  onTileClick: (tileId: string) => void;
  validMoves?: string[]; 
  validAttacks?: string[];
  localPlayerColor?: PlayerColor | null;
}

interface TooltipData {
    title: string;
    desc?: string;
    sub?: string;
}

// Map PlayerColor to specific Hex codes for SVG fills (Tailwind 500 equivalent)
const UNIT_BG_COLORS: Record<PlayerColor, string> = {
  [PlayerColor.RED]: '#ef4444',
  [PlayerColor.BLUE]: '#3b82f6',
  [PlayerColor.GREEN]: '#22c55e',
  [PlayerColor.YELLOW]: '#eab308',
};

const getHexPointsString = (radius: number) => {
    const angles = [0, 60, 120, 180, 240, 300];
    return angles.map(angle => {
      const rad = Math.PI / 180 * angle;
      return `${radius * Math.cos(rad)},${radius * Math.sin(rad)}`;
    }).join(' ');
};

const getHexVertices = (radius: number) => {
    const angles = [0, 60, 120, 180, 240, 300];
    return angles.map(angle => {
      const rad = Math.PI / 180 * angle;
      return { x: radius * Math.cos(rad), y: radius * Math.sin(rad) };
    });
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const getInsetVertex = (v: {x: number, y: number}, factor: number) => ({
    x: lerp(v.x, 0, factor),
    y: lerp(v.y, 0, factor)
});

// --- Wall Overlay ---
const WallOverlay: React.FC<{
  tile: Tile;
  neighbors: (Tile | null)[]; 
  isVisible: boolean;
  onHover: (data: TooltipData | null) => void;
}> = ({ tile, neighbors, isVisible, onHover }) => {
    const { x, y } = hexToPixel(tile);
    const hexVertices = useMemo(() => getHexVertices(HEX_SIZE), []);
    const insetWallVertices = useMemo(() => getHexVertices(HEX_SIZE).map(v => getInsetVertex(v, 0.15)), []);
    const edgeToNeighborIndex = [0, 5, 4, 3, 2, 1];

    if (!isVisible || !tile.hasWall) return null;

    return (
        <g transform={`translate(${x}, ${y})`} className="pointer-events-auto"
           onMouseEnter={() => onHover({ title: "Fortified Wall", desc: "+3 Defense Bonus" })}
           onMouseLeave={() => onHover(null)}
        >
            {[0, 1, 2, 3, 4, 5].map((i) => {
                const edgeIndex = i;
                const neighborIdx = edgeToNeighborIndex[edgeIndex];
                const neighbor = neighbors[neighborIdx];
                const isWallEdge = !neighbor || !neighbor.hasWall || neighbor.controller !== tile.controller;

                if (isWallEdge) {
                    const pStart = insetWallVertices[edgeIndex];
                    const pEnd = insetWallVertices[(edgeIndex + 1) % 6];
                    const lines = [];

                    // Thick transparent stroke for easier hovering
                    lines.push(<line key={`hit-${i}`} x1={pStart.x} y1={pStart.y} x2={pEnd.x} y2={pEnd.y} stroke="transparent" strokeWidth="12" />);

                    lines.push(
                        <line 
                            key={`wall-edge-${i}`}
                            x1={pStart.x} y1={pStart.y} 
                            x2={pEnd.x} y2={pEnd.y}
                            stroke="#94a3b8"
                            strokeWidth="6" 
                            strokeLinecap="round"
                            className="drop-shadow-sm"
                        />
                    );

                    const prevNeighborEdgeIndex = (i + 5) % 6;
                    const prevNeighborIdx = edgeToNeighborIndex[prevNeighborEdgeIndex];
                    const prevNeighbor = neighbors[prevNeighborIdx];
                    const isPrevFriendlyWall = prevNeighbor && prevNeighbor.hasWall && prevNeighbor.controller === tile.controller;

                    if (isPrevFriendlyWall) {
                        const nCenter = hexToPixel(prevNeighbor);
                        const diffX = nCenter.x - x;
                        const diffY = nCenter.y - y;
                        const vertex = hexVertices[edgeIndex]; 
                        const pBridge = { x: vertex.x * 0.85 + diffX * 0.15, y: vertex.y * 0.85 + diffY * 0.15 };
                        
                        lines.push(
                            <line key={`wall-bridge-${i}`} x1={pStart.x} y1={pStart.y} x2={pBridge.x} y2={pBridge.y} stroke="#94a3b8" strokeWidth="6" strokeLinecap="round" />
                        );
                    }
                    return lines;
                }
                return null;
            })}
        </g>
    );
};

// --- Top Layer Overlay (Structure + Icons + Roads) ---
const TopLayerOverlay: React.FC<{
    tile: Tile;
    neighbors: (Tile | null)[];
    isVisible: boolean;
    defenseBonus: number;
    onHover: (data: TooltipData | null) => void;
}> = ({ tile, neighbors, isVisible, defenseBonus, onHover }) => {
    const { x, y } = hexToPixel(tile);
    if (!isVisible) return null;

    const handleStructureHover = () => {
        if (!tile.structure) return;
        const info = STRUCTURE_STATS[tile.structure];
        onHover({ title: info.name, desc: info.description });
    };

    const handleDefHover = () => {
        const wallBonus = tile.hasWall ? " (+3 Wall)" : "";
        onHover({ title: "Defense Bonus", desc: `+${defenseBonus} Defense${wallBonus}` });
    };

    // --- Road Logic (Restricted to same controller) ---
    const RoadNetwork = () => {
        if ((!tile.hasRoad && !tile.structure && !tile.isHQ)) return null;
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
            // Only connect road if neighbor belongs to same player
            const isFriendly = n.controller === tile.controller;
            const hasInfrastructure = n.hasRoad || (n.structure && n.structure !== StructureType.MONOLITH) || n.isHQ;
            
            if (isFriendly && hasInfrastructure) {
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

    // --- Terrain Icon ---
    const TerrainIconElement = () => {
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
        <g transform={`translate(${x}, ${y})`} className="pointer-events-none">
             
             {/* 1. Roads (Bottom of Top Layer) */}
             <RoadNetwork />

             {/* 2. Terrain Icons */}
             <g className="pointer-events-none">
                <TerrainIconElement />
             </g>

             {/* 3. Structures - Enable pointer events for hover */}
             {(tile.structure || tile.hasRoad) && tile.structure !== StructureType.MONOLITH && tile.structure !== StructureType.WONDER && (
                <g transform="translate(0, -20)" className="pointer-events-auto" onMouseEnter={handleStructureHover} onMouseLeave={() => onHover(null)}>
                    {tile.isHQ && <Castle size={20} x={-10} y={-10} className="text-white drop-shadow-md" fill={PLAYER_COLORS[tile.controller!]} />}
                    {!tile.isHQ && tile.structure === StructureType.SETTLEMENT && <Home size={20} x={-10} y={-10} className="text-white drop-shadow-md" fill={PLAYER_COLORS[tile.controller!]} />}
                    {!tile.isHQ && tile.structure === StructureType.CITY && <Building2 size={24} x={-12} y={-12} className="text-white drop-shadow-md" fill={PLAYER_COLORS[tile.controller!]} />}
                    {tile.structure === StructureType.PORT && <Anchor size={20} x={-10} y={-10} className="text-white drop-shadow-md" />}
                    {tile.structure && <circle r={12} fill="transparent" />} 
                </g>
             )}

             {tile.isRuins && !tile.structure && !tile.unitId && (
                 <g className="pointer-events-auto" onMouseEnter={() => onHover({title: "Ancient Ruins", desc: "Explore for rewards"})} onMouseLeave={() => onHover(null)}>
                     <Sparkles size={20} x={-10} y={-10} className="text-yellow-400 drop-shadow-md animate-pulse" />
                     <circle r={12} fill="transparent" />
                 </g>
             )}

             {/* 4. Terrain Defense Shield (Tile property) */}
             {(defenseBonus > 0 || tile.hasWall) && (
                 <g transform="translate(10, -22)" className="pointer-events-auto" onMouseEnter={handleDefHover} onMouseLeave={() => onHover(null)}>
                    <circle r={9} fill="#1e293b" stroke="#475569" strokeWidth={1} />
                    <Shield size={10} x={-5} y={-5} className={tile.hasWall ? "text-orange-400" : "text-blue-400"} fill="currentColor" />
                 </g>
             )}
        </g>
    );
};

// 1. Base Tile Renderer (Simplified)
const HexTileBase: React.FC<{
  tile: Tile;
  isVisible: boolean;
  onClick: () => void;
  cursorClass: string;
  isCombating: boolean;
  onHover: (data: TooltipData | null) => void;
}> = ({ tile, isVisible, onClick, cursorClass, isCombating, onHover }) => {
  const { x, y } = hexToPixel(tile);
  const points = useMemo(() => getHexPointsString(HEX_SIZE), []);
  
  let fillColor = RESOURCE_COLORS[tile.resource] || '#94a3b8';
  let stroke = '#1e293b'; 
  let strokeWidth = 2;

  if (tile.structure === StructureType.MONOLITH) fillColor = '#0f172a';
  if (tile.structure === StructureType.WONDER) fillColor = '#422006';

  if (!isVisible) {
      fillColor = '#020617'; 
      stroke = '#0f172a';
  }

  const handleTileHover = () => {
      if (!isVisible) return;
      const def = TERRAIN_DEFENSE[tile.resource] || 0;
      const baseInfo = { 
          title: TERRAIN_TYPE[tile.resource], 
          desc: `Yields ${tile.resource}`,
          sub: def !== 0 ? `${def > 0 ? '+' : ''}${def} Defense` : undefined
      };
      
      if (tile.structure === StructureType.MONOLITH) {
          baseInfo.title = "The Monolith";
          baseInfo.desc = "Control for massive resources";
      } else if (tile.structure === StructureType.WONDER) {
          baseInfo.title = "Ancient Wonder";
          baseInfo.desc = "Victory Condition";
      }
      onHover(baseInfo);
  };

  return (
    <g transform={`translate(${x}, ${y})`} 
       onClick={onClick} 
       onMouseEnter={handleTileHover} 
       onMouseLeave={() => onHover(null)} 
       className={`${cursorClass} transition-all duration-200 ${isCombating ? 'shake-animation' : ''}`}
    >
      <polygon points={points} fill={fillColor} stroke={stroke} strokeWidth={strokeWidth} />
      {isVisible && tile.resource === 'WATER' && (
          <g className="water-anim pointer-events-none opacity-30">
              <path d="M-10,-5 Q0,5 10,-5" stroke="white" fill="none" strokeWidth="2" />
              <path d="M-10,5 Q0,15 10,5" stroke="white" fill="none" strokeWidth="2" />
          </g>
      )}
      
      {!isVisible && (
          <g>
            <polygon points={points} fill="url(#fogCloud)" fillOpacity={0.6} className="pointer-events-none" />
            <EyeOff size={20} x={-10} y={-10} className="text-slate-700 opacity-20 pointer-events-none" />
          </g>
      )}
    </g>
  );
};

export const HexGrid: React.FC<HexGridProps> = ({ gameState, onTileClick, validMoves = [], validAttacks = [], localPlayerColor }) => {
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const svgRef = useRef<SVGSVGElement>(null);
    const isDragging = useRef(false);
    const lastPos = useRef({ x: 0, y: 0 });
    const tooltipRef = useRef<HTMLDivElement>(null);
    const [tooltipContent, setTooltipContent] = useState<TooltipData | null>(null);
  
    const pixelRadius = (MAX_MAP_RADIUS + 10) * HEX_SIZE * 2;
  
    const handleWheel = (e: React.WheelEvent) => {
      setZoom(z => Math.max(0.2, Math.min(2.5, z - e.deltaY * 0.001)));
    };
  
    const handleMouseDown = (e: React.MouseEvent) => {
        isDragging.current = true;
        lastPos.current = { x: e.clientX, y: e.clientY };
    };
  
    const handleMouseMove = (e: React.MouseEvent) => {
        // Tooltip Following
        if (tooltipRef.current) {
             tooltipRef.current.style.transform = `translate(${e.clientX + 15}px, ${e.clientY + 15}px)`;
        }

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

    const hexVertices = useMemo(() => getHexVertices(HEX_SIZE), []);
    const insetHexVertices = useMemo(() => getHexVertices(HEX_SIZE).map(v => getInsetVertex(v, 0.08)), []);
    const edgeToNeighborIndex = [0, 5, 4, 3, 2, 1];

    const handleSetTooltip = (data: TooltipData | null) => {
        if (!data) {
            setTooltipContent(null);
            return;
        }
        setTooltipContent(data);
    };

    return (
      <div className="w-full h-full bg-slate-950 overflow-hidden cursor-move relative">
         {/* HTML Tooltip Overlay */}
         <div 
            ref={tooltipRef}
            className={`fixed top-0 left-0 pointer-events-none z-50 transition-opacity duration-150 ${tooltipContent ? 'opacity-100' : 'opacity-0'}`}
         >
             {tooltipContent && (
                 <div className="bg-slate-800/90 text-white p-3 rounded-xl border border-slate-600 shadow-xl backdrop-blur-sm min-w-[140px]">
                     <h4 className="font-bold text-sm uppercase text-indigo-200">{tooltipContent.title}</h4>
                     {tooltipContent.desc && <p className="text-xs text-slate-300 mt-1">{tooltipContent.desc}</p>}
                     {tooltipContent.sub && <p className="text-[10px] text-green-400 font-bold mt-1 uppercase">{tooltipContent.sub}</p>}
                 </div>
             )}
         </div>

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
             <pattern id="fogCloud" patternUnits="userSpaceOnUse" width="100" height="100">
                <rect width="100" height="100" fill="#0f172a" />
                <circle cx="20" cy="20" r="20" fill="#1e293b" opacity="0.5" />
                <circle cx="80" cy="80" r="30" fill="#1e293b" opacity="0.5" />
                <circle cx="50" cy="50" r="25" fill="#334155" opacity="0.3" />
             </pattern>
           </defs>
           <g>
             {/* 1. Base Layer: Tiles Only */}
             {Object.values(gameState.tiles).map((tile: Tile) => {
               const isVisible = gameState.visibleHexes?.includes(tile.id) ?? false;
               
               let cursorClass = "cursor-default";
               if (isVisible) {
                   if (validMoves.includes(tile.id)) cursorClass = "cursor-pointer hover:brightness-110";
                   else if (validAttacks.includes(tile.id)) cursorClass = "cursor-crosshair hover:brightness-110";
                   else if (gameState.selectedHexId === tile.id) cursorClass = "cursor-pointer brightness-110";
                   else if (tile.unitId && gameState.units[tile.unitId].owner === gameState.players[gameState.currentPlayerIndex].color) cursorClass = "cursor-pointer";
                   else cursorClass = "cursor-pointer";
               }
               const isCombating = gameState.combatResult?.tileId === tile.id;

               return (
                 <HexTileBase 
                   key={tile.id}
                   tile={tile}
                   isVisible={isVisible}
                   onClick={() => onTileClick(tile.id)}
                   cursorClass={cursorClass}
                   isCombating={isCombating}
                   onHover={handleSetTooltip}
                 />
               );
             })}

            {/* 2. Walls Layer */}
            {Object.values(gameState.tiles).map((tile: Tile) => {
                const neighbors = getNeighbors(tile).map(n => gameState.tiles[getHexId(n.q, n.r, n.s)] || null);
                const isVisible = gameState.visibleHexes?.includes(tile.id) ?? false;
                return <WallOverlay key={`wall-${tile.id}`} tile={tile} neighbors={neighbors} isVisible={isVisible} onHover={handleSetTooltip} />;
            })}

             {/* 3. Middle Layer: Borders */}
             {Object.values(gameState.tiles).map((tile: Tile) => {
                const isVisible = gameState.visibleHexes?.includes(tile.id) ?? false;
                if (!isVisible || !tile.controller) return null;
                const { x, y } = hexToPixel(tile);
                const neighbors = getNeighbors(tile).map(n => gameState.tiles[getHexId(n.q, n.r, n.s)] || null);
                
                return (
                    <g key={`border-group-${tile.id}`} transform={`translate(${x}, ${y})`} className="pointer-events-none">
                        {[0, 1, 2, 3, 4, 5].map((i) => {
                            const edgeIndex = i;
                            const neighborIdx = edgeToNeighborIndex[edgeIndex];
                            const neighbor = neighbors[neighborIdx];
                            const isEdgeBorder = !neighbor || neighbor.controller !== tile.controller;

                            if (isEdgeBorder) {
                                const pStart = insetHexVertices[edgeIndex];
                                const pEnd = insetHexVertices[(edgeIndex + 1) % 6];
                                const lines = [];

                                lines.push(<line key={`edge-${i}`} x1={pStart.x} y1={pStart.y} x2={pEnd.x} y2={pEnd.y} stroke={PLAYER_COLORS[tile.controller!]} strokeWidth="4" strokeLinecap="round" className="drop-shadow-sm" />);

                                const prevNeighborEdgeIndex = (i + 5) % 6;
                                const prevNeighborIdx = edgeToNeighborIndex[prevNeighborEdgeIndex];
                                const prevNeighbor = neighbors[prevNeighborIdx];
                                const isPrevFriendly = prevNeighbor && prevNeighbor.controller === tile.controller;

                                if (isPrevFriendly) {
                                    const nCenter = hexToPixel(prevNeighbor);
                                    const diffX = nCenter.x - x;
                                    const diffY = nCenter.y - y;
                                    const vertex = hexVertices[edgeIndex]; 
                                    const pBridge = { x: vertex.x * 0.92 + diffX * 0.08, y: vertex.y * 0.92 + diffY * 0.08 };
                                    lines.push(<line key={`bridge-${i}`} x1={pStart.x} y1={pStart.y} x2={pBridge.x} y2={pBridge.y} stroke={PLAYER_COLORS[tile.controller!]} strokeWidth="4" strokeLinecap="round" />);
                                }
                                return lines;
                            }
                            return null;
                        })}
                    </g>
                );
             })}
             
             {/* 4. Top Layer: Structures, Roads, Icons (Above Borders) */}
             {Object.values(gameState.tiles).map((tile: Tile) => {
                 const neighbors = getNeighbors(tile).map(n => gameState.tiles[getHexId(n.q, n.r, n.s)] || null);
                 const isVisible = gameState.visibleHexes?.includes(tile.id) ?? false;
                 let defenseBonus = TERRAIN_DEFENSE[tile.resource] || 0;
                 if (tile.hasWall) defenseBonus += 3;

                 return (
                     <TopLayerOverlay 
                        key={`struct-${tile.id}`} 
                        tile={tile} 
                        neighbors={neighbors}
                        isVisible={isVisible} 
                        defenseBonus={defenseBonus}
                        onHover={handleSetTooltip}
                     />
                 );
             })}

             {/* 5. Highlights */}
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
  
             {/* 6. Units Layer */}
              {Object.values(gameState.units).map((unit: Unit) => {
                  const tile = (Object.values(gameState.tiles) as Tile[]).find(t => t.unitId === unit.id);
                  if (!tile || !gameState.visibleHexes?.includes(tile.id)) return null;
                  const { x, y } = hexToPixel(tile);
                  
                  const Icon = unit.type === UnitType.SCOUT ? Compass :
                               unit.type === UnitType.SOLDIER ? User :
                               unit.type === UnitType.KNIGHT ? Axe :
                               unit.type === UnitType.GENERAL ? Crown :
                               unit.type === UnitType.GALLEY ? Ship : 
                               unit.type === UnitType.SPY ? Eye :
                               unit.type === UnitType.DECOY ? UserX : User;
                  
                  const isMyUnit = localPlayerColor ? unit.owner === localPlayerColor : false;
                  const showDetails = unit.revealed || isMyUnit;
                  const moveColor = "#22c55e"; 

                  return (
                      <g key={unit.id} transform={`translate(${x}, ${y})`} className="pointer-events-none transition-all duration-300">
                          {/* Unit Circle - Enable pointer for hover AND click */}
                          <g className="pointer-events-auto cursor-pointer" 
                             onClick={(e) => {
                                 e.stopPropagation();
                                 onTileClick(tile.id);
                             }}
                             onMouseEnter={() => handleSetTooltip({ title: unit.type, desc: `${unit.owner} Faction`, sub: isMyUnit ? "Your Unit" : "Enemy Unit" })}
                             onMouseLeave={() => handleSetTooltip(null)}
                          >
                             <circle r={14} fill={UNIT_BG_COLORS[unit.owner]} stroke="white" strokeWidth={2} className="drop-shadow-md" />
                             <Icon size={16} x={-8} y={-8} className="text-white" />
                          </g>
                          
                          {/* Badge: Attack */}
                          {(showDetails || unit.attack >= 5) && (
                              <g className="pointer-events-auto" 
                                 onMouseEnter={() => handleSetTooltip({ title: "Attack Power", desc: `Deals ${unit.attack} damage` })}
                                 onMouseLeave={() => handleSetTooltip(null)}
                              >
                                  <circle cx={-10} cy={10} r={6} fill="#ef4444" stroke="white" strokeWidth={1} />
                                  <text x={-10} y={11} fontSize="9" fontWeight="bold" textAnchor="middle" dominantBaseline="middle" fill="white">
                                      {unit.attack}
                                  </text>
                              </g>
                          )}
                          
                          {/* Badge: Moves */}
                          <g className="pointer-events-auto"
                             onMouseEnter={() => handleSetTooltip({ title: "Moves Remaining", desc: `${unit.movesLeft} / ${unit.maxMoves} Moves` })}
                             onMouseLeave={() => handleSetTooltip(null)}
                          >
                              <circle cx={10} cy={10} r={6} fill={moveColor} stroke="white" strokeWidth={1} />
                              <text x={10} y={11} fontSize="9" fontWeight="bold" textAnchor="middle" dominantBaseline="middle" fill="white">
                                  {unit.movesLeft}
                              </text>
                          </g>

                           {/* Badge: Defense */}
                           {showDetails && (
                              <g className="pointer-events-auto"
                                 onMouseEnter={() => handleSetTooltip({ title: "Base Defense", desc: `Base defense: ${unit.defense}` })}
                                 onMouseLeave={() => handleSetTooltip(null)}
                              >
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
                 <text key={effect.id} x={effect.x} y={effect.y} fill={effect.color} fontSize="14" fontWeight="bold" textAnchor="middle" className="pointer-events-none animate-float" style={{ textShadow: '0px 2px 2px rgba(0,0,0,0.8)' }}>
                     {effect.text}
                 </text>
             ))}
  
           </g>
         </svg>
      </div>
    );
  };