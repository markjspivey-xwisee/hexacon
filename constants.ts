
import { PlayerColor, ResourceType, UnitType, StructureType, TechType } from './types';

export const HEX_SIZE = 40;
export const BOARD_RADIUS = 5; // Initial starting size
export const MAX_MAP_RADIUS = 9; // The hard limit for the world size (The Arena)
export const WONDER_VICTORY_TURNS = 5;

// Only these are tradeable/spendable in the UI
export const RESOURCES: ResourceType[] = ['WOOD', 'BRICK', 'WHEAT', 'ORE'];

export const FACTION_INFO: Record<PlayerColor, { name: string, description: string, bonus: string }> = {
  [PlayerColor.RED]: {
    name: "The Imperium",
    description: "Conquerors who value strength above all.",
    bonus: "+1 Power when Attacking"
  },
  [PlayerColor.BLUE]: {
    name: "The Cartel",
    description: "Wealthy merchants controlling the trade routes.",
    bonus: "Trade ratio is 2:1 (instead of 3:1)"
  },
  [PlayerColor.GREEN]: {
    name: "The Sylvari",
    description: "Guerilla fighters at home in the wild.",
    bonus: "+1 Move Speed through Forests"
  },
  [PlayerColor.YELLOW]: {
    name: "The Masons",
    description: "Master architects and siege engineers.",
    bonus: "Walls/Cities cost 1 less resource"
  }
};

export const UNIT_STATS: Record<UnitType, { power: number; moves: number; cost: Record<ResourceType, number> }> = {
  [UnitType.SCOUT]: { 
    power: 2, 
    moves: 2,
    cost: { WOOD: 1, BRICK: 0, WHEAT: 1, ORE: 0, WATER: 0 } 
  },
  [UnitType.SOLDIER]: { 
    power: 4, 
    moves: 1,
    cost: { WOOD: 1, BRICK: 1, WHEAT: 1, ORE: 0, WATER: 0 } 
  },
  [UnitType.KNIGHT]: { 
    power: 7, 
    moves: 1,
    cost: { WOOD: 0, BRICK: 2, WHEAT: 2, ORE: 1, WATER: 0 } 
  },
  [UnitType.GENERAL]: { 
    power: 9, 
    moves: 1,
    cost: { WOOD: 0, BRICK: 0, WHEAT: 3, ORE: 3, WATER: 0 } 
  },
  [UnitType.GALLEY]: { 
    power: 5, 
    moves: 3,
    cost: { WOOD: 2, BRICK: 0, WHEAT: 1, ORE: 0, WATER: 0 } 
  },
};

export const STRUCTURE_STATS: Record<StructureType, { name: string; cost: Record<ResourceType, number>; description: string }> = {
  [StructureType.SETTLEMENT]: {
    name: 'Settlement',
    cost: { WOOD: 1, BRICK: 1, WHEAT: 1, ORE: 0, WATER: 0 },
    description: '+1 Resource Yield'
  },
  [StructureType.CITY]: {
    name: 'City',
    cost: { WOOD: 0, BRICK: 0, WHEAT: 2, ORE: 3, WATER: 0 },
    description: '+2 Yield (Replaces Settlement)'
  },
  [StructureType.WALL]: {
    name: 'Wall',
    cost: { WOOD: 0, BRICK: 2, WHEAT: 0, ORE: 0, WATER: 0 },
    description: '+3 Defense Bonus'
  },
  [StructureType.ROAD]: {
    name: 'Road',
    cost: { WOOD: 1, BRICK: 1, WHEAT: 0, ORE: 0, WATER: 0 },
    description: 'Start turn here for +1 Move'
  },
  [StructureType.PORT]: {
    name: 'Port',
    cost: { WOOD: 2, BRICK: 0, WHEAT: 0, ORE: 1, WATER: 0 },
    description: 'Build on coast. +1 Trade value.'
  },
  [StructureType.MONOLITH]: {
    name: 'Monolith',
    cost: { WOOD: 99, BRICK: 99, WHEAT: 99, ORE: 99, WATER: 0 },
    description: 'Ancient Landmark'
  },
  [StructureType.WONDER]: {
    name: 'Wonder',
    cost: { WOOD: 8, BRICK: 8, WHEAT: 8, ORE: 8, WATER: 0 },
    description: `Win game if held for ${WONDER_VICTORY_TURNS} turns`
  }
};

export const TECH_STATS: Record<TechType, { name: string; cost: Record<ResourceType, number>; description: string }> = {
  [TechType.METALLURGY]: {
    name: 'Metallurgy',
    cost: { WOOD: 0, BRICK: 0, WHEAT: 0, ORE: 5, WATER: 0 },
    description: '+1 Power to ALL units'
  },
  [TechType.MASONRY]: {
    name: 'Masonry',
    cost: { WOOD: 0, BRICK: 4, WHEAT: 0, ORE: 2, WATER: 0 },
    description: 'Walls give +5 DEF instead of +3'
  },
  [TechType.LOGISTICS]: {
    name: 'Logistics',
    cost: { WOOD: 2, BRICK: 0, WHEAT: 4, ORE: 0, WATER: 0 },
    description: '+1 Move to Soldiers & Knights'
  },
  [TechType.ECONOMICS]: {
    name: 'Economics',
    cost: { WOOD: 3, BRICK: 3, WHEAT: 3, ORE: 0, WATER: 0 },
    description: 'Global +1 to all Resource Yields'
  },
  [TechType.SEAFARING]: {
    name: 'Seafaring',
    cost: { WOOD: 4, BRICK: 0, WHEAT: 2, ORE: 0, WATER: 0 },
    description: 'Unlock Galleys and Ports'
  }
};

export const TERRAIN_DEFENSE: Record<ResourceType, number> = {
  WOOD: 0,    // Forest
  BRICK: 1,   // Hills
  WHEAT: 0,   // Fields
  ORE: 2,     // Mountains
  WATER: -1,  // Water (Vulnerable?)
};

export const INITIAL_RESOURCES: Record<ResourceType, number> = {
  WOOD: 4,
  BRICK: 4,
  WHEAT: 2,
  ORE: 2,
  WATER: 0,
};

export const RESOURCE_COLORS: Record<ResourceType, string> = {
  WOOD: '#14532d',   // green-900 (Forest)
  BRICK: '#7f1d1d',  // red-900 (Hills/Badlands)
  WHEAT: '#854d0e',  // yellow-800 (Fields/Dunes)
  ORE: '#334155',    // slate-700 (Mountain)
  WATER: '#1e3a8a',  // blue-900 (Deep Ocean)
};

export const TERRAIN_TYPE: Record<ResourceType, string> = {
  WOOD: 'Forest',
  BRICK: 'Hills',
  WHEAT: 'Fields',
  ORE: 'Mountains',
  WATER: 'Ocean',
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
