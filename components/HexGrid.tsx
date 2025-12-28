import React, { useMemo } from 'react';
import { GameState, HexCoordinate, PlayerColor, Tile, StructureType } from '../types';
import { hexToPixel } from '../utils/hexUtils';
import { HEX_SIZE, RESOURCE_COLORS, PLAYER_COLORS, TERRAIN_DEFENSE } from '../constants';
import { Trees, Mountain, Wheat, BrickWall, Castle, User, EyeOff, Shield, Home, Building2, Milestone } from 'lucide-react';

interface HexGridProps {
  gameState: GameState;
  onTileClick: (tileId: string) => void;
  validMoves?: string[]; // IDs of tiles valid for moving to
  validAttacks?: string[]; // IDs of tiles valid for attacking
}

const HexTile: React.FC<{
  tile: Tile;
  gameState: GameState;
  onClick: () => void;
  isSelected: boolean;
  isValidMove: boolean;
  isValidAttack: boolean;
  isVisible: boolean;
  defenseBonus: number;
}> = ({ tile, gameState, onClick, isSelected, isValidMove, isValidAttack, isVisible, defenseBonus }) => {
  const { x, y } = hexToPixel(tile);
  const points = useMemo(() => {
    const angles = [0, 60, 120, 180, 240, 300];
    return angles.map(angle => {
      const rad = Math.PI / 180 * angle;
      return `${HEX_SIZE * Math.cos(rad)},${HEX_SIZE * Math.sin(rad)}`;
    }).join(' ');
  }, []);

  // Visual Styling Logic
  let fillColor = RESOURCE_COLORS[tile.resource] || '#94a3b8';
  let stroke = '#1e293b'; 
  let strokeWidth = 2;
  let cursorClass = "cursor-default";

  if (!isVisible) {
      fillColor = '#1e293b'; // Dark color for fog
      stroke = '#0f172a';
  }

  if (isSelected) {
    stroke = '#ffffff';
    strokeWidth = 4;
    cursorClass = "cursor-pointer";
  } else if (isValidAttack) {
    stroke = '#ef4444'; // Red for attack
    strokeWidth = 4;
    cursorClass = "cursor-pointer";
  } else if (isValidMove) {
    stroke = '#22c55e'; // Green for move
    strokeWidth = 4;
    cursorClass = "cursor-pointer";
  } else if (isVisible && tile.controller) {
    stroke = PLAYER_COLORS[tile.controller];
    strokeWidth = 4;
  }

  // Interaction Check
  const hasMyUnit = tile.unitId && gameState.units[tile.unitId]?.owner === gameState.players[gameState.currentPlayerIndex].color;
  const isMyTurn = !gameState.players[gameState.currentPlayerIndex].isAI;
  
  if (isVisible && (hasMyUnit || tile.controller === gameState.players[gameState.currentPlayerIndex].color) && isMyTurn) {
      cursorClass = "cursor-pointer hover:opacity-90";
  }

  const unit = tile.unitId ? gameState.units[tile.unitId] : null;
  const isMyUnit = unit?.owner === gameState.players[gameState.currentPlayerIndex].color;
  
  const isUnitHidden = unit && !isMyUnit && !unit.revealed;

  // Render terrain icon
  const TerrainIcon = () => {
    if (!isVisible) return <EyeOff size={16} className="text-slate-700 opacity-50" />;
    
    const iconProps = { size: 16, className: "opacity-40 text-black" };
    switch (tile.resource) {
      case 'WOOD': return <Trees {...iconProps} />;
      case 'ORE': return <Mountain {...iconProps} />;
      case 'WHEAT': return <Wheat {...iconProps} />;
      case 'BRICK': return <BrickWall {...iconProps} />;
      default: return null;
    }
  };

  return (
    <g transform={`translate(${x}, ${y})`} onClick={onClick} className={`${cursorClass} transition-all duration-200`}>
      {/* Hexagon Shape */}
      <polygon points={points} fill={fillColor} stroke={stroke} strokeWidth={strokeWidth} />
      
      {/* Wall Overlay */}
      {isVisible && tile.hasWall && (
           <polygon points={points} fill="none" stroke="#334155" strokeWidth="6" className="opacity-80" />
      )}

      {/* Road Indicator (Dashed border inside) */}
      {isVisible && tile.hasRoad && (
           <polygon points={points} fill="none" stroke="#f1f5f9" strokeWidth="2" strokeDasharray="4 2" className="opacity-60" transform="scale(0.85)" />
      )}
      
      {/* Fog Overlay Pattern */}
      {!isVisible && (
          <polygon points={points} fill="url(#fogPattern)" fillOpacity={0.4} className="pointer-events-none" />
      )}

      {/* Action Indicator Overlays */}
      {isValidMove && (
         <circle r={HEX_SIZE * 0.3} fill="#22c55e" fillOpacity={0.4} className="animate-pulse pointer-events-none" />
      )}
      {isValidAttack && (
         <circle r={HEX_SIZE * 0.3} fill="#ef4444" fillOpacity={0.4} className="animate-pulse pointer-events-none" />
      )}

      {/* Terrain Icon (Background) */}
      <foreignObject x={-10} y={-10} width={20} height={20} className="pointer-events-none">
         <div className="flex justify-center items-center h-full">
            <TerrainIcon />
         </div>
      </foreignObject>
    
      {/* Defense Shield Indicator (Terrain + Wall) */}
      {isVisible && (defenseBonus > 0 || tile.hasWall) && (
          <foreignObject x={8} y={-24} width={20} height={20} className="pointer-events-auto">
             <div className="flex items-center justify-center bg-slate-800 rounded-full w-5 h-5 border border-slate-600 shadow-md cursor-help" 
                  title={`Defense: ${defenseBonus} (Terrain) ${tile.hasWall ? '+3 (Wall)' : ''}`}>
                <Shield size={10} className={tile.hasWall ? "text-orange-400" : "text-blue-400"} fill="currentColor" />
             </div>
          </foreignObject>
      )}

      {/* Buildings */}
      {isVisible && tile.structure && (
         <foreignObject x={-20} y={-28} width={40} height={24} className="pointer-events-none">
            <div className="flex justify-center items-center gap-1">
               {tile.isHQ && <Castle size={16} className="text-white drop-shadow-md" fill={PLAYER_COLORS[tile.controller!]} />}
               {!tile.isHQ && tile.structure === StructureType.SETTLEMENT && <Home size={16} className="text-white drop-shadow-md" fill={PLAYER_COLORS[tile.controller!]} />}
               {!tile.isHQ && tile.structure === StructureType.CITY && <Building2 size={20} className="text-white drop-shadow-md" fill={PLAYER_COLORS[tile.controller!]} />}
            </div>
         </foreignObject>
      )}

      {/* Unit Rendering */}
      {unit && isVisible && (
        <foreignObject x={-16} y={-12} width={32} height={32} className="pointer-events-none">
          <div 
            className={`w-8 h-8 rounded-full flex items-center justify-center border-2 bg-white shadow-lg ${unit.movesLeft === 0 ? 'grayscale opacity-70' : ''}`}
            style={{ borderColor: PLAYER_COLORS[unit.owner] }}
          >
            {isUnitHidden ? (
                // Hidden Enemy Unit
                <span className="text-lg font-bold text-slate-400">?</span>
            ) : (
                // Revealed / Owned Unit
                <div className="flex flex-col items-center leading-none">
                    <span className="text-[8px] font-bold text-slate-800">{unit.type.slice(0,2)}</span>
                    <span className="text-xs font-extrabold text-slate-900">{unit.power}</span>
                </div>
            )}
          </div>
          {/* Movement Indicator for Own Units */}
          {isMyUnit && unit.movesLeft > 0 && (
             <div className="absolute -bottom-1 -right-1 bg-green-500 text-[8px] text-white rounded-full w-3 h-3 flex items-center justify-center border border-white">
                {unit.movesLeft}
             </div>
          )}
        </foreignObject>
      )}
    </g>
  );
};

export const HexGrid: React.FC<HexGridProps> = ({ gameState, onTileClick, validMoves = [], validAttacks = [] }) => {
  // Dynamic ViewBox Calculation
  // We need to find the bounds of all currently existing tiles to set the camera.
  const tiles = Object.values(gameState.tiles) as Tile[];
  
  const bounds = useMemo(() => {
    if (tiles.length === 0) return { minX: 0, minY: 0, width: 800, height: 700 };

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    tiles.forEach(tile => {
        const { x, y } = hexToPixel(tile);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    });

    // Add padding
    const padding = 100;
    minX -= padding;
    maxX += padding;
    minY -= padding;
    maxY += padding;

    // Minimum size to prevent zooming in too much on a single tile
    const width = Math.max(800, maxX - minX);
    const height = Math.max(700, maxY - minY);

    // Re-center if the map is smaller than min dimensions
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    return {
        minX: centerX - width / 2,
        minY: centerY - height / 2,
        width,
        height
    };
  }, [tiles.length]); // Recalculate when tile count changes

  return (
    <div className="w-full h-full overflow-hidden flex justify-center items-center bg-slate-900 rounded-xl shadow-2xl border border-slate-800 relative">
        {/* Simple background texture/gradient */}
        <div className="absolute inset-0 opacity-20 pointer-events-none" 
             style={{backgroundImage: 'radial-gradient(circle at 2px 2px, #334155 1px, transparent 0)', backgroundSize: '24px 24px'}}>
        </div>

      <svg width="100%" height="100%" viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`} className="w-full h-full transition-all duration-500 ease-in-out">
        <defs>
            <pattern id="fogPattern" width="4" height="4" patternUnits="userSpaceOnUse">
                <path d="M-1,1 l2,-2 M0,4 l4,-4 M3,5 l2,-2" stroke="#0f172a" strokeWidth="1" />
            </pattern>
        </defs>
        <g>
          {tiles.map((tile: Tile) => {
             // Default to visible if visibleHexes is undefined (e.g. spectator or old state)
             const isVisible = gameState.visibleHexes ? gameState.visibleHexes.includes(tile.id) : true;
             
             return (
                <HexTile 
                key={tile.id} 
                tile={tile} 
                gameState={gameState} 
                onClick={() => onTileClick(tile.id)}
                isSelected={gameState.selectedHexId === tile.id}
                isValidMove={validMoves.includes(tile.id)}
                isValidAttack={validAttacks.includes(tile.id)}
                isVisible={isVisible}
                defenseBonus={TERRAIN_DEFENSE[tile.resource] || 0}
                />
            );
          })}
        </g>
      </svg>
    </div>
  );
};