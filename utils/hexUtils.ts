import { HexCoordinate, Tile, GameState, PlayerColor, ResourceType, StructureType, MapType } from '../types';
import { HEX_SIZE, TERRAIN_TYPE } from '../constants';

export const getHexId = (q: number, r: number, s: number) => `${q},${r},${s}`;

export const hexToPixel = (hex: HexCoordinate): { x: number; y: number } => {
  const x = HEX_SIZE * (3 / 2 * hex.q);
  const y = HEX_SIZE * (Math.sqrt(3) / 2 * hex.q + Math.sqrt(3) * hex.r);
  return { x, y };
};

export const getNeighbors = (hex: HexCoordinate): HexCoordinate[] => {
  const directions = [
    { q: 1, r: 0, s: -1 }, { q: 1, r: -1, s: 0 }, { q: 0, r: -1, s: 1 },
    { q: -1, r: 0, s: 1 }, { q: -1, r: 1, s: 0 }, { q: 0, r: 1, s: -1 }
  ];
  return directions.map(d => ({ q: hex.q + d.q, r: hex.r + d.r, s: hex.s + d.s }));
};

// Improved Terrain Generation
export const generateNewTile = (q: number, r: number, s: number, mapType: MapType = MapType.PANGAEA): Tile => {
    const id = getHexId(q, r, s);
    
    // The Monolith: Absolute Center
    if (q === 0 && r === 0 && s === 0) {
        return {
            id, q, r, s,
            resource: 'ORE',
            terrain: 'Monolith',
            controller: null,
            unitId: null,
            isHQ: false,
            isRuins: false,
            structure: StructureType.MONOLITH,
            hasWall: false,
            hasRoad: false
        };
    }

    // Pseudo-random noise
    let noise = Math.sin(q * 0.8) + Math.cos(r * 0.7) + Math.sin(s * 0.3);
    const dist = Math.max(Math.abs(q), Math.abs(r), Math.abs(s));

    let res: ResourceType = 'WOOD';
    
    if (mapType === MapType.ARCHIPELAGO) {
        // High water presence
        if (Math.sin(q * 0.5) * Math.cos(r * 0.5) > 0.1) {
             res = 'WATER';
        } else {
             if (noise > 1.2) res = 'ORE';
             else if (noise > 0.4) res = 'BRICK';
             else if (noise > -0.5) res = 'WOOD';
             else res = 'WHEAT';
        }
    } else if (mapType === MapType.VOLCANIC) {
        if (noise > 0.8) res = 'ORE';
        else if (noise > 0.0) res = 'BRICK';
        else if (noise > -0.5) res = 'WOOD';
        else res = 'WHEAT';
        // Some water lakes
        if (noise < -1.5) res = 'WATER';
    } else {
        // Pangaea
        if (noise > 1.2) res = 'ORE';
        else if (noise > 0.4) res = 'BRICK';
        else if (noise > -0.5) res = 'WOOD';
        else res = 'WHEAT';
        
        // Ocean edges
        if (dist > 6 && Math.random() > 0.7) res = 'WATER';
    }

    // Ruins: only on land
    const isRuins = res !== 'WATER' && dist > 2 && Math.random() < 0.08;

    return {
        id, q, r, s,
        resource: res,
        terrain: TERRAIN_TYPE[res],
        controller: null,
        unitId: null,
        isHQ: false,
        isRuins,
        structure: null,
        hasWall: false,
        hasRoad: false
    };
};

export const generateGrid = (radius: number, mapType: MapType = MapType.PANGAEA): Record<string, Tile> => {
  const tiles: Record<string, Tile> = {};
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) {
      const s = -q - r;
      tiles[getHexId(q, r, s)] = generateNewTile(q, r, s, mapType);
    }
  }
  return tiles;
};

export const dist = (a: HexCoordinate, b: HexCoordinate): number => {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
};

// Fog of War: Returns IDs of all tiles visible to the player
export const calculateVisibleHexes = (gameState: GameState, playerColor: PlayerColor): string[] => {
  const visible = new Set<string>();
  
  Object.values(gameState.tiles).forEach(tile => {
    let isSource = false;
    if (tile.controller === playerColor) isSource = true;
    if (tile.unitId && gameState.units[tile.unitId]?.owner === playerColor) isSource = true;

    if (isSource) {
      visible.add(tile.id);
      const neighbors = getNeighbors(tile);
      neighbors.forEach(n => visible.add(getHexId(n.q, n.r, n.s)));
    }
  });
  
  visible.add("0,0,0");
  return Array.from(visible);
};