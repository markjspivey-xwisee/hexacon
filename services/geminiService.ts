import { GameState, AIAction, PlayerColor, UnitType, StructureType, TechType } from '../types';
import { UNIT_STATS, STRUCTURE_STATS, TERRAIN_DEFENSE, RESOURCES, TECH_STATS } from '../constants';
import { getNeighbors, getHexId, dist } from '../utils/hexUtils';

/**
 * Heuristic AI Engine - Enhanced
 * Includes threat assessment, resource prioritization, coordinated defense, and TECH/WONDER strategies.
 */
export const getAIMove = async (gameState: GameState, playerColor: PlayerColor): Promise<AIAction> => {
  // Add a small delay to simulate "thinking"
  await new Promise(resolve => setTimeout(resolve, 800));

  const player = gameState.players.find(p => p.color === playerColor);
  if (!player) return { action: 'PASS', reasoning: 'Player not found' };

  const myUnits = Object.values(gameState.units).filter(u => u.owner === playerColor);
  const myTiles = Object.values(gameState.tiles).filter(t => t.controller === playerColor);
  const myHQ = myTiles.find(t => t.isHQ);

  // --- STRATEGY 0: WONDER VICTORY CHECK ---
  if (!gameState.wonderOwner) {
       const wonderCost = STRUCTURE_STATS[StructureType.WONDER].cost;
       const canAffordWonder = Object.entries(wonderCost).every(([r, amt]) => player.resources[r as any] >= amt);
       
       if (canAffordWonder) {
           let bestSpot = myHQ;
           if (!bestSpot || bestSpot.structure) {
               bestSpot = myTiles.filter(t => !t.structure && !t.isHQ && t.resource !== 'WATER').sort((a,b) => {
                   return 0; // Random valid
               })[0];
           }
           
           if (bestSpot) {
               return {
                   action: 'BUILD_STRUCTURE',
                   structureType: StructureType.WONDER,
                   buildHexId: bestSpot.id,
                   reasoning: 'ATTEMPTING WONDER VICTORY'
               };
           }
       }
  }

  // --- STRATEGY 1: RESEARCH (TECH BOOM) ---
  const hasMetallurgy = player.techs.includes(TechType.METALLURGY);
  const hasEconomics = player.techs.includes(TechType.ECONOMICS);
  const hasSeafaring = player.techs.includes(TechType.SEAFARING);
  
  // Prioritize Seafaring if we are near water
  const adjacentToWater = myTiles.some(t => getNeighbors(t).some(n => gameState.tiles[getHexId(n.q,n.r,n.s)]?.resource === 'WATER'));
  if (adjacentToWater && !hasSeafaring) {
      const cost = TECH_STATS[TechType.SEAFARING].cost;
      if (Object.entries(cost).every(([r, amt]) => player.resources[r as any] >= amt)) {
          return { action: 'RESEARCH', techType: TechType.SEAFARING, reasoning: 'Unlocking Navy' };
      }
  }

  if (!hasEconomics) {
      const cost = TECH_STATS[TechType.ECONOMICS].cost;
      if (Object.entries(cost).every(([r, amt]) => player.resources[r as any] >= amt)) {
          return { action: 'RESEARCH', techType: TechType.ECONOMICS, reasoning: 'Booming Economy' };
      }
  }

  if (myUnits.length > 2 && !hasMetallurgy) {
       const cost = TECH_STATS[TechType.METALLURGY].cost;
       if (Object.entries(cost).every(([r, amt]) => player.resources[r as any] >= amt)) {
          return { action: 'RESEARCH', techType: TechType.METALLURGY, reasoning: 'Upgrading Army Power' };
      }
  }

  // --- STRATEGY 2: OFFENSE & EXPANSION (Move/Attack) ---
  
  // Prioritize moving strong units that haven't moved yet
  const movableUnits = myUnits
    .filter(u => u.movesLeft > 0)
    .sort((a, b) => b.attack - a.attack);

  for (const unit of movableUnits) {
    const unitTile = Object.values(gameState.tiles).find(t => t.unitId === unit.id);
    if (!unitTile) continue;

    const neighbors = getNeighbors(unitTile);
    let bestMove: { id: string; score: number } | null = null;

    for (const n of neighbors) {
      const nId = getHexId(n.q, n.r, n.s);
      const targetTile = gameState.tiles[nId];
      if (!targetTile) continue;

      // Terrain check
      const isShip = unit.type === UnitType.GALLEY;
      const isWater = targetTile.resource === 'WATER';
      if (isShip && !isWater) continue;
      if (!isShip && isWater) continue;

      let score = -1000;

      // Case A: Enemy Unit on Tile (Combat)
      if (targetTile.unitId) {
        const targetUnit = gameState.units[targetTile.unitId];
        if (targetUnit.owner !== playerColor) {
           const defBonus = (TERRAIN_DEFENSE[targetTile.resource] || 0) + (targetTile.hasWall ? 3 : 0);
           const estimatedDefense = targetUnit.revealed ? targetUnit.defense : 3; // Estimate low def if unknown
           const defense = estimatedDefense + defBonus;
           const myAttack = unit.attack + (hasMetallurgy ? 1 : 0);
           
           if (myAttack > defense) {
             score = 100 + (targetUnit.attack * 10);
             if (targetTile.isHQ) score += 500;
             if (targetTile.structure === StructureType.MONOLITH) score += 400;
             if (targetTile.structure === StructureType.WONDER) score += 1000;
           } else if (myAttack === defense) {
             score = myAttack < 4 ? 20 : -20; 
           } else {
             score = -500;
           }
        } else {
            score = -9999;
        }
      } 
      // Case B: Empty/Structure Tile (Movement)
      else {
          score = 10;
          if (targetTile.controller !== playerColor) {
              score += 20;
              if (targetTile.resource !== 'WATER' && player.resources[targetTile.resource] < 2) score += 25;
              if (targetTile.structure) score += 50; 
              if (targetTile.isHQ) score += 300; 
              if (targetTile.isRuins) score += 200;
              if (targetTile.structure === StructureType.MONOLITH) score += 600;
              if (targetTile.structure === StructureType.WONDER) score += 1000;
          } else {
              if (targetTile.structure === StructureType.MONOLITH) score += 10; 
              if (targetTile.structure === StructureType.WONDER) score += 50; 
          }
          const targetNeighbors = getNeighbors(targetTile);
          let threatPenalty = 0;
          for (const tn of targetNeighbors) {
              const tnId = getHexId(tn.q, tn.r, tn.s);
              const neighborUnit = gameState.units[gameState.tiles[tnId]?.unitId || ''];
              if (neighborUnit && neighborUnit.owner !== playerColor) {
                  const myDefense = unit.defense + (hasMetallurgy ? 1 : 0);
                  if (neighborUnit.attack > myDefense) threatPenalty += 60; 
                  else if (neighborUnit.attack === myDefense) threatPenalty += 10;
              }
          }
          score -= threatPenalty;
          
          if (myHQ) {
              const distToHQ = dist(targetTile, myHQ);
              if (distToHQ < 3) score += 5; // Patrol home
          }
          
          const distToCenter = Math.max(Math.abs(targetTile.q), Math.abs(targetTile.r), Math.abs(targetTile.s));
          score -= distToCenter * 5;
      }

      if (score > (bestMove?.score || -9999)) {
        bestMove = { id: nId, score };
      }
    }

    if (bestMove && bestMove.score > -50) {
      return {
        action: 'MOVE',
        fromHexId: unitTile.id,
        toHexId: bestMove.id,
        reasoning: `Score: ${bestMove.score}`
      };
    }
  }

  // --- STRATEGY 3: RECRUITMENT ---
  
  if (myUnits.length < 10) {
     const recruitOrder = [UnitType.GENERAL, UnitType.KNIGHT, UnitType.SOLDIER, UnitType.SCOUT];
     
     // Try to build Ship if possible
     if (hasSeafaring) {
         const cost = UNIT_STATS[UnitType.GALLEY].cost;
         if (Object.entries(cost).every(([r, amt]) => player.resources[r as any] >= amt)) {
             // Find water tile adjacent to my coastal structures
             let waterTile = null;
             for (const t of myTiles) {
                 if (t.structure && t.resource !== 'WATER') {
                     const ns = getNeighbors(t);
                     const w = ns.find(n => {
                         const tid = getHexId(n.q,n.r,n.s);
                         const tile = gameState.tiles[tid];
                         return tile && tile.resource === 'WATER' && !tile.unitId;
                     });
                     if (w) {
                         waterTile = gameState.tiles[getHexId(w.q,w.r,w.s)];
                         break;
                     }
                 }
             }
             if (waterTile) {
                 return { action: 'BUILD_UNIT', unitType: UnitType.GALLEY, buildHexId: waterTile.id, reasoning: 'Building Navy' };
             }
         }
     }

     for (const type of recruitOrder) {
         const cost = UNIT_STATS[type].cost;
         const canAfford = Object.entries(cost).every(([r, amt]) => player.resources[r as any] >= amt);
         if (canAfford) {
             const spawnCandidates = myTiles.filter(t => !t.unitId && t.structure !== StructureType.MONOLITH && t.structure !== StructureType.WONDER && t.resource !== 'WATER');
             spawnCandidates.sort((a, b) => dist(a, {q:0,r:0,s:0}) - dist(b, {q:0,r:0,s:0})); // Spawn closer to center
             
             if (spawnCandidates.length > 0) {
                 return {
                     action: 'BUILD_UNIT',
                     unitType: type,
                     buildHexId: spawnCandidates[0].id,
                     reasoning: `Recruiting ${type}`
                 };
             }
         }
     }
  }

  // --- STRATEGY 4: ECONOMY & INFRASTRUCTURE ---
  
  // Roads
  const roadCost = STRUCTURE_STATS[StructureType.ROAD].cost;
  if (Object.entries(roadCost).every(([r, amt]) => player.resources[r as any] >= amt)) {
      // Find tiles I own without road that connect 2 tiles with things?
      // Simple: Build road on any owned tile without road that has a unit or structure
      const roadCandidates = myTiles.filter(t => !t.hasRoad && t.resource !== 'WATER');
      if (roadCandidates.length > 0) {
          return {
              action: 'BUILD_STRUCTURE',
              structureType: StructureType.ROAD,
              buildHexId: roadCandidates[0].id,
              reasoning: 'Infrastructure'
          };
      }
  }

  if (player.resources.WHEAT >= 2 && player.resources.ORE >= 3) {
      const settlement = myTiles.find(t => t.structure === StructureType.SETTLEMENT);
      if (settlement) {
          return {
              action: 'BUILD_STRUCTURE',
              structureType: StructureType.CITY,
              buildHexId: settlement.id,
              reasoning: 'Upgrading to City'
          };
      }
  }

  if (player.resources.WOOD >= 1 && player.resources.BRICK >= 1 && player.resources.WHEAT >= 1) {
      const spot = myTiles.find(t => !t.structure && !t.isHQ && t.structure !== StructureType.MONOLITH && t.structure !== StructureType.WONDER && t.resource !== 'WATER');
      if (spot) {
           return {
              action: 'BUILD_STRUCTURE',
              structureType: StructureType.SETTLEMENT,
              buildHexId: spot.id,
              reasoning: 'Expanding Economy'
          };
      }
  }

  return { action: 'PASS', reasoning: 'Done' };
};