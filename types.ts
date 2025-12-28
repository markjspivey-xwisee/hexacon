export type ResourceType = 'WOOD' | 'BRICK' | 'WHEAT' | 'ORE';

export enum PlayerColor {
  RED = 'RED', // Human usually
  BLUE = 'BLUE',
  GREEN = 'GREEN',
  YELLOW = 'YELLOW'
}

export enum UnitType {
  SCOUT = 'SCOUT', // Moves 2, weak
  SOLDIER = 'SOLDIER', // Standard
  KNIGHT = 'KNIGHT', // Strong, expensive
  GENERAL = 'GENERAL' // Strongest
}

export enum StructureType {
  SETTLEMENT = 'SETTLEMENT',
  CITY = 'CITY',
  WALL = 'WALL',
  ROAD = 'ROAD'
}

export interface Unit {
  id: string;
  owner: PlayerColor;
  type: UnitType;
  power: number; 
  movesLeft: number; // Changed from hasMoved to support multiple moves
  maxMoves: number;
  revealed: boolean; // Stratego: true if it has engaged in combat
}

export interface HexCoordinate {
  q: number;
  r: number;
  s: number;
}

export interface Tile {
  id: string;
  q: number;
  r: number;
  s: number;
  resource: ResourceType;
  terrain: string; 
  controller: PlayerColor | null;
  unitId: string | null;
  isHQ: boolean;
  structure: StructureType | null; // Settlement or City
  hasWall: boolean;
  hasRoad: boolean;
}

export interface Player {
  color: PlayerColor;
  isAI: boolean;
  resources: Record<ResourceType, number>;
  activeUnits: number;
  eliminated: boolean;
  id?: string; 
}

export interface GameState {
  turn: number;
  currentPlayerIndex: number;
  players: Player[];
  tiles: Record<string, Tile>;
  units: Record<string, Unit>;
  gameLog: string[];
  winner: PlayerColor | null;
  selectedHexId: string | null;
  isProcessing: boolean;
  matchId?: string;
  lastUpdated?: number;
  visibleHexes?: string[]; // IDs of hexes visible to the local player/current player
}

export interface AIAction {
  action: 'MOVE' | 'BUILD_UNIT' | 'BUILD_STRUCTURE' | 'PASS';
  fromHexId?: string;
  toHexId?: string;
  unitType?: UnitType;
  structureType?: StructureType;
  buildHexId?: string;
  reasoning?: string;
}

export interface MatchData {
  gameState: GameState;
  playerIds: Record<string, PlayerColor>;
  createdAt: number;
}