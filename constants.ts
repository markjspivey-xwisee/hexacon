import { PlayerColor, ResourceType, UnitType, StructureType } from './types';

export const HEX_SIZE = 40;
export const BOARD_RADIUS = 5; // Increased from 3 to 5 to create a fog frontier

export const RESOURCES: ResourceType[] = ['WOOD', 'BRICK', 'WHEAT', 'ORE'];

export const UNIT_STATS: Record<UnitType, { power: number; moves: number; cost: Record<ResourceType, number> }> = {
  [UnitType.SCOUT]: { 
    power: 2, 
    moves: 2,
    cost: { WOOD: 1, BRICK: 0, WHEAT: 1, ORE: 0 } 
  },
  [UnitType.SOLDIER]: { 
    power: 4, 
    moves: 1,
    cost: { WOOD: 1, BRICK: 1, WHEAT: 1, ORE: 0 } 
  },
  [UnitType.KNIGHT]: { 
    power: 7, 
    moves: 1,
    cost: { WOOD: 0, BRICK: 2, WHEAT: 2, ORE: 1 } 
  },
  [UnitType.GENERAL]: { 
    power: 9, 
    moves: 1,
    cost: { WOOD: 0, BRICK: 0, WHEAT: 3, ORE: 3 } 
  },
};

export const STRUCTURE_STATS: Record<StructureType, { name: string; cost: Record<ResourceType, number>; description: string }> = {
  [StructureType.SETTLEMENT]: {
    name: 'Settlement',
    cost: { WOOD: 1, BRICK: 1, WHEAT: 1, ORE: 0 },
    description: '+1 Resource Yield'
  },
  [StructureType.CITY]: {
    name: 'City',
    cost: { WOOD: 0, BRICK: 0, WHEAT: 2, ORE: 3 },
    description: '+2 Yield (Replaces Settlement)'
  },
  [StructureType.WALL]: {
    name: 'Wall',
    cost: { WOOD: 0, BRICK: 2, WHEAT: 0, ORE: 0 },
    description: '+3 Defense Bonus'
  },
  [StructureType.ROAD]: {
    name: 'Road',
    cost: { WOOD: 1, BRICK: 1, WHEAT: 0, ORE: 0 },
    description: 'Start turn here for +1 Move'
  }
};

export const TERRAIN_DEFENSE: Record<ResourceType, number> = {
  WOOD: 0,    // Forest: Neutral
  BRICK: 1,   // Hills: +1 Defense
  WHEAT: 0,   // Fields: Neutral
  ORE: 2,     // Mountains: +2 Defense
};

export const INITIAL_RESOURCES: Record<ResourceType, number> = {
  WOOD: 4,
  BRICK: 4,
  WHEAT: 2,
  ORE: 2,
};

export const RESOURCE_COLORS: Record<ResourceType, string> = {
  WOOD: '#22c55e',   // green-500
  BRICK: '#ef4444',  // red-500
  WHEAT: '#eab308',  // yellow-500
  ORE: '#64748b',    // slate-500
};

export const TERRAIN_TYPE: Record<ResourceType, string> = {
  WOOD: 'Forest',
  BRICK: 'Hills',
  WHEAT: 'Fields',
  ORE: 'Mountains',
};

export const PLAYER_COLORS: Record<PlayerColor, string> = {
  [PlayerColor.RED]: '#f87171',
  [PlayerColor.BLUE]: '#60a5fa',
  [PlayerColor.GREEN]: '#4ade80',
  [PlayerColor.YELLOW]: '#facc15',
};

export const PLAYER_BG_COLORS: Record<PlayerColor, string> = {
  [PlayerColor.RED]: 'bg-red-500',
  [PlayerColor.BLUE]: 'bg-blue-500',
  [PlayerColor.GREEN]: 'bg-green-500',
  [PlayerColor.YELLOW]: 'bg-yellow-500',
};