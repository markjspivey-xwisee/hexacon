import { GoogleGenAI, Type } from "@google/genai";
import { GameState, AIAction, PlayerColor } from '../types';
import { UNIT_STATS, STRUCTURE_STATS } from '../constants';

const apiKey = typeof process !== 'undefined' && process.env ? process.env.API_KEY : undefined;
const ai = new GoogleGenAI({ apiKey: apiKey });

const modelName = 'gemini-3-flash-preview';

export const getAIMove = async (gameState: GameState, playerColor: PlayerColor): Promise<AIAction> => {
  if (!apiKey) {
    console.error("Gemini API Key is missing. AI cannot play.");
    return { action: 'PASS', reasoning: 'Missing API Key' };
  }

  const player = gameState.players.find(p => p.color === playerColor);
  if (!player) throw new Error("AI Player not found");

  // Filter Tiles: Only show tiles that are owned, have units, or are neighbors to those.
  const relevantTileIds = new Set<string>();
  Object.values(gameState.tiles).forEach(t => {
      if (t.controller === playerColor || (t.unitId && gameState.units[t.unitId]?.owner === playerColor)) {
          relevantTileIds.add(t.id);
          // Add neighbors
          const parts = t.id.split(',').map(Number);
          const neighbors = [
            [1,0,-1],[1,-1,0],[0,-1,1],[-1,0,1],[-1,1,0],[0,1,-1]
          ];
          neighbors.forEach(n => {
              relevantTileIds.add(`${parts[0]+n[0]},${parts[1]+n[1]},${parts[2]+n[2]}`);
          });
      }
  });

  Object.values(gameState.units).forEach(u => {
      if (u.owner !== playerColor) {
           const tile = Object.values(gameState.tiles).find(t => t.unitId === u.id);
           if (tile) relevantTileIds.add(tile.id);
      }
  });

  const filteredTiles = Object.values(gameState.tiles).filter(t => relevantTileIds.has(t.id)).map(t => {
      // Create a clean object to avoid any potential circular references from the raw state
      const tileData: any = { id: t.id, type: t.resource };
      if (t.controller) tileData.owner = t.controller;
      if (t.structure) tileData.bldg = t.structure;
      if (t.hasWall) tileData.wall = true;
      if (t.unitId && gameState.units[t.unitId]) {
        const u = gameState.units[t.unitId];
        tileData.unit = { owner: u.owner, type: u.type, pwr: u.power };
      }
      return tileData;
  });

  const simplifiedState = {
    turn: gameState.turn,
    myResources: { ...player.resources }, // Shallow copy to ensure plain object
    tiles: filteredTiles,
    enemies: gameState.players
        .filter(p => p.color !== playerColor && !p.eliminated)
        .map(p => ({
            color: p.color,
            score: Object.values(gameState.tiles).reduce((acc, t) => t.controller === p.color ? acc + 1 : acc, 0)
        }))
  };

  const systemInstruction = `
    Play as ${playerColor} in HexConquest.
    Rules:
    - Build Settlements (Wood+Brick+Wheat+Ore) for income.
    - Build Units to conquer tiles. High Power wins.
    - Move to adjacent tiles to attack/occupy.
    
    Goal: Expand territory.
    Priorities:
    1. If you have no units, BUILD_UNIT.
    2. If you have resources, BUILD_STRUCTURE (Settlement/City) to increase income.
    3. Attack weaker enemy units nearby.
    4. Move towards empty resource tiles.
    
    Stats: ${JSON.stringify(UNIT_STATS)}
  `;

  let stateString = "";
  try {
      stateString = JSON.stringify(simplifiedState);
  } catch (e) {
      console.error("Error serializing game state for AI:", e);
      return { action: 'PASS', reasoning: 'State serialization error' };
  }

  const prompt = `
    State: ${stateString}
    Select best move. Return JSON.
    CRITICAL: 
    - If action is 'BUILD_UNIT' or 'BUILD_STRUCTURE', you MUST provide 'buildHexId'.
    - If action is 'MOVE', you MUST provide 'fromHexId' and 'toHexId'.
  `;

  try {
    const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("Gemini Request Timed Out")), 25000)
    );

    const apiCallPromise = ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            action: { type: Type.STRING, enum: ['MOVE', 'BUILD_UNIT', 'BUILD_STRUCTURE', 'PASS'] },
            fromHexId: { type: Type.STRING },
            toHexId: { type: Type.STRING },
            unitType: { type: Type.STRING, enum: ['SCOUT', 'SOLDIER', 'KNIGHT', 'GENERAL'] },
            structureType: { type: Type.STRING, enum: ['SETTLEMENT', 'CITY', 'WALL', 'ROAD'] },
            buildHexId: { type: Type.STRING },
            reasoning: { type: Type.STRING }
          },
          required: ['action', 'reasoning']
        }
      }
    });

    const response: any = await Promise.race([apiCallPromise, timeoutPromise]);

    let text = response.text;
    if (!text) return { action: 'PASS', reasoning: 'AI failed to generate response' };

    text = text.trim();
    if (text.startsWith('```json')) text = text.replace(/^```json/, '').replace(/```$/, '');
    else if (text.startsWith('```')) text = text.replace(/^```/, '').replace(/```$/, '');

    return JSON.parse(text) as AIAction;

  } catch (error: any) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Gemini AI Error:", msg);
    return { action: 'PASS', reasoning: 'AI Error encountered' };
  }
};