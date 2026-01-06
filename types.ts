export type ResourceType = 'WOOD' | 'BRICK' | 'WHEAT' | 'ORE' | 'WATER';

export enum PlayerColor {
  RED = 'RED', // The Imperium
  BLUE = 'BLUE', // The Cartel
  GREEN = 'GREEN', // The Sylvari
  YELLOW = 'YELLOW' // The Masons
}

export enum MapType {
  PANGAEA = 'PANGAEA', // One big landmass
  ARCHIPELAGO = 'ARCHIPELAGO', // Many islands
  VOLCANIC = 'VOLCANIC' // High Ore, lots of mountains
}

export enum UnitType {
  SCOUT = 'SCOUT', // Moves 2, weak
  SOLDIER = 'SOLDIER', // Standard
  KNIGHT = 'KNIGHT', // Strong, expensive
  GENERAL = 'GENERAL', // Strongest
  GALLEY = 'GALLEY', // Naval unit
  SPY = 'SPY', // New: Revelas info, dies on attack
  DECOY = 'DECOY' // New: Looks like a unit, dies instantly
}

export enum StructureType {
  SETTLEMENT = 'SETTLEMENT',
  CITY = 'CITY',
  WALL = 'WALL',
  ROAD = 'ROAD',
  PORT = 'PORT', // Naval building
  MONOLITH = 'MONOLITH', // King of the Hill
  WONDER = 'WONDER' // Age of Empires Victory Condition
}

export enum TechType {
  METALLURGY = 'METALLURGY', // +1 Combat Power to all units
  MASONRY = 'MASONRY', // Walls +5 Def instead of +3, Cities +1 Def
  LOGISTICS = 'LOGISTICS', // +1 Move to Soldiers/Knights
  ECONOMICS = 'ECONOMICS', // +1 Gold/Resource per turn base
  SEAFARING = 'SEAFARING' // Allows building Ports/Galleys
}

export interface Unit {
  id: string;
  owner: PlayerColor;
  type: UnitType;
  attack: number;
  defense: number; 
  movesLeft: number; 
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
  isRuins: boolean; // New exploration feature
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
  techs: TechType[]; // New Tech Tree
  id?: string; 
}

export interface FloatingText {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  createdAt: number;
}

export interface CombatResult {
  attacker: { type: UnitType, attack: number, owner: PlayerColor };
  defender: { type: UnitType, defense: number, owner: PlayerColor, bonus: number };
  outcome: 'WIN' | 'LOSS' | 'DRAW' | 'REVEAL';
  timestamp: number;
  tileId: string; // Used for shake effect location
}

export interface HistoryPoint {
  turn: number;
  playerStats: Record<PlayerColor, { military: number, economy: number }>;
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
  effects: FloatingText[]; // Visual only
  wonderBuiltAt?: number; // Turn number when Wonder was finished
  wonderOwner?: PlayerColor; // Who built it
  combatResult?: CombatResult | null; // Trigger for cinematic
  history: HistoryPoint[]; // For end game graph
  aiTaunt?: { text: string, speaker: PlayerColor } | null; // Gemini personality
}

export interface AIAction {
  action: 'MOVE' | 'BUILD_UNIT' | 'BUILD_STRUCTURE' | 'RESEARCH' | 'PASS';
  fromHexId?: string;
  toHexId?: string;
  unitType?: UnitType;
  structureType?: StructureType;
  techType?: TechType;
  buildHexId?: string;
  reasoning?: string;
}

export interface MatchData {
  gameState: GameState;
  playerIds: Record<string, PlayerColor>;
  createdAt: number;
}