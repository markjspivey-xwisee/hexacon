import { HexCoordinate, Tile, GameState, PlayerColor, ResourceType } from '../types';
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

export const generateNewTile = (q: number, r: number, s: number): Tile => {
    const id = getHexId(q, r, s);
    const rand = Math.random();
    let res: ResourceType = 'WOOD';
    if (rand > 0.75) res = 'ORE';
    else if (rand > 0.5) res = 'WHEAT';
    else if (rand > 0.25) res = 'BRICK';

    return {
        id, q, r, s,
        resource: res,
        terrain: TERRAIN_TYPE[res],
        controller: null,
        unitId: null,
        isHQ: false,
        structure: null,
        hasWall: false,
        hasRoad: false
    };
};

export const generateGrid = (radius: number): Record<string, Tile> => {
  const tiles: Record<string, Tile> = {};
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) {
      const s = -q - r;
      tiles[getHexId(q, r, s)] = generateNewTile(q, r, s);
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
  
  // 1. All tiles owned by player are visible
  // 2. All tiles with player's units are visible
  // 3. All neighbors of the above are visible
  
  Object.values(gameState.tiles).forEach(tile => {
    let isSource = false;
    
    // Territory ownership
    if (tile.controller === playerColor) isSource = true;
    
    // Unit presence
    if (tile.unitId && gameState.units[tile.unitId]?.owner === playerColor) isSource = true;

    if (isSource) {
      visible.add(tile.id);
      const neighbors = getNeighbors(tile);
      neighbors.forEach(n => visible.add(getHexId(n.q, n.r, n.s)));
    }
  });

  return Array.from(visible);
};