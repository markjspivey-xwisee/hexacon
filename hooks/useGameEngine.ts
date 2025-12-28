import { useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { GameState, Player, PlayerColor, Tile, Unit, UnitType, StructureType, ResourceType, MatchData } from '../types';
import { generateGrid, getHexId, getNeighbors, calculateVisibleHexes, generateNewTile } from '../utils/hexUtils';
import { BOARD_RADIUS, INITIAL_RESOURCES, UNIT_STATS, STRUCTURE_STATS, TERRAIN_TYPE, RESOURCES, TERRAIN_DEFENSE } from '../constants';
import { getAIMove } from '../services/geminiService';
import { createOnlineGame, joinOnlineGame, subscribeToMatch, updateMatchState, isFirebaseInitialized, initFirebase } from '../services/firebaseService';

const LOCAL_STORAGE_PLAYER_ID_KEY = 'hex_player_id';
const LOCAL_STORAGE_FB_CONFIG_KEY = 'hex_firebase_config';
const LOCAL_STORAGE_MATCH_ID_KEY = 'hex_match_id';

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyDXQ5E9E-rcXYauP9o72AJ_OFAxzpt6mZE",
  authDomain: "hexconquest-b04a1.firebaseapp.com",
  projectId: "hexconquest-b04a1",
  storageBucket: "hexconquest-b04a1.firebasestorage.app",
  messagingSenderId: "1083378229404",
  appId: "1:1083378229404:web:10f03b9eac487ca855cd59",
  measurementId: "G-TGVZS60TJ5"
};

const getLocalPlayerId = () => {
  let id = localStorage.getItem(LOCAL_STORAGE_PLAYER_ID_KEY);
  if (!id) {
    id = uuidv4();
    localStorage.setItem(LOCAL_STORAGE_PLAYER_ID_KEY, id);
  }
  return id;
};

// Helper to expand map: ensures all tiles with units/ownership have neighbors existing in the grid
const ensureFrontier = (tiles: Record<string, Tile>): Record<string, Tile> => {
    const newTiles = { ...tiles };
    let changed = false;
    
    // Convert to array to avoid issues while mutating
    Object.values(tiles).forEach(tile => {
        // If tile has a unit or is controlled, ensuring neighbors exist
        if (tile.unitId || tile.controller) {
            const neighbors = getNeighbors(tile);
            neighbors.forEach(n => {
                const nId = getHexId(n.q, n.r, n.s);
                if (!newTiles[nId]) {
                    newTiles[nId] = generateNewTile(n.q, n.r, n.s);
                    changed = true;
                }
            });
        }
    });

    return changed ? newTiles : tiles;
};

const createInitialState = (numPlayers: number): GameState => {
  let tiles = generateGrid(BOARD_RADIUS);
  
  const colors = [PlayerColor.RED, PlayerColor.BLUE, PlayerColor.GREEN, PlayerColor.YELLOW].slice(0, numPlayers);
  const players: Player[] = colors.map((c, i) => ({
    color: c,
    isAI: i !== 0,
    resources: { ...INITIAL_RESOURCES },
    activeUnits: 0,
    eliminated: false
  }));

  const startIds = [
    getHexId(0, -3, 3), 
    getHexId(0, 3, -3), 
    getHexId(-3, 0, 3), 
    getHexId(3, 0, -3)
  ];

  players.forEach((p, idx) => {
    const hqId = startIds[idx] || Object.keys(tiles)[idx]; 
    if (tiles[hqId]) {
      tiles[hqId].controller = p.color;
      tiles[hqId].isHQ = true;
      tiles[hqId].structure = StructureType.SETTLEMENT;
    }
  });
  
  // Expand frontier immediately for starting positions
  tiles = ensureFrontier(tiles);

  const initialState: GameState = {
    turn: 1,
    currentPlayerIndex: 0,
    players,
    tiles,
    units: {},
    gameLog: ['Game Started. Red to move.'],
    winner: null,
    selectedHexId: null,
    isProcessing: false,
    visibleHexes: []
  };

  initialState.visibleHexes = calculateVisibleHexes(initialState, PlayerColor.RED);

  return initialState;
};

export const useGameEngine = () => {
  const [gameState, setGameState] = useState<GameState>(() => createInitialState(2));
  const [setupMode, setSetupMode] = useState(true);
  const [isOnline, setIsOnline] = useState(false);
  const [localPlayerColor, setLocalPlayerColor] = useState<PlayerColor | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [firebaseConfigured, setFirebaseConfigured] = useState(false);
  const [savedMatchId, setSavedMatchId] = useState<string | null>(null);
  const [gameError, setGameError] = useState<string | null>(null);
  const [isCreatingGame, setCreatingGame] = useState(false);
  const [playerId, setPlayerId] = useState(getLocalPlayerId());

  const gameStateRef = useRef(gameState);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  const syncPlayerId = (newId: string) => {
    if (newId && newId.length > 10) {
      localStorage.setItem(LOCAL_STORAGE_PLAYER_ID_KEY, newId);
      setPlayerId(newId);
      return true;
    }
    return false;
  };

  useEffect(() => {
    let configToUse = DEFAULT_FIREBASE_CONFIG;
    const isDefaultValid = DEFAULT_FIREBASE_CONFIG.apiKey && DEFAULT_FIREBASE_CONFIG.apiKey.startsWith("AIza");

    if (isDefaultValid) {
        configToUse = DEFAULT_FIREBASE_CONFIG;
    } else {
        const savedConfigStr = localStorage.getItem(LOCAL_STORAGE_FB_CONFIG_KEY);
        if (savedConfigStr) {
            try {
                const parsed = JSON.parse(savedConfigStr);
                if (parsed && parsed.apiKey) configToUse = parsed;
            } catch (e) { console.error(e); }
        }
    }

    try {
        initFirebase(configToUse);
        setFirebaseConfigured(true);
    } catch (e) {
        console.error("Firebase init failed:", e);
    }

    const savedMatch = localStorage.getItem(LOCAL_STORAGE_MATCH_ID_KEY);
    if (savedMatch) setSavedMatchId(savedMatch);
  }, []);

  const saveFirebaseConfig = (configStr: string) => {
    try {
      const config = JSON.parse(configStr);
      initFirebase(config);
      localStorage.setItem(LOCAL_STORAGE_FB_CONFIG_KEY, configStr);
      setFirebaseConfigured(true);
      return true;
    } catch (e) { return false; }
  };

  const resetFirebaseConfig = () => {
      localStorage.removeItem(LOCAL_STORAGE_FB_CONFIG_KEY);
      initFirebase(DEFAULT_FIREBASE_CONFIG);
      setFirebaseConfigured(true);
  };

  const startOnlineGame = async (numPlayers: number) => {
    setGameError(null);
    if (!firebaseConfigured) { setGameError("Firebase not configured."); return; }
    setCreatingGame(true);
    try {
        const initial = createInitialState(numPlayers);
        initial.players.forEach(p => p.isAI = false); 
        const id = await createOnlineGame(initial, playerId);
        setMatchId(id);
        setLocalPlayerColor(PlayerColor.RED);
        setIsOnline(true);
        setGameState({ ...initial, matchId: id });
        setSetupMode(false);
        localStorage.setItem(LOCAL_STORAGE_MATCH_ID_KEY, id);
        setSavedMatchId(id);
    } catch (e: any) {
        setGameError(e.message || "Failed to create game.");
    } finally { setCreatingGame(false); }
  };

  const joinGame = async (id: string) => {
    if (!firebaseConfigured) return { success: false, msg: "Configure Firebase first" };
    try {
        const result = await joinOnlineGame(id, playerId);
        if (result.success && result.color) {
            setMatchId(id);
            setLocalPlayerColor(result.color);
            setIsOnline(true);
            setSetupMode(false);
            localStorage.setItem(LOCAL_STORAGE_MATCH_ID_KEY, id);
            setSavedMatchId(id);
            return { success: true };
        } else {
            return { success: false, msg: result.msg || "Failed to join" };
        }
    } catch (e: any) {
        return { success: false, msg: e.message || "Error joining game" };
    }
  };

  const resumeLastGame = async () => {
      if (savedMatchId) {
          const res = await joinGame(savedMatchId);
          if (!res.success) setGameError(`Could not resume: ${res.msg}`);
      }
  };

  // Camera/Visibility Helper
  const getViewerColor = (state: GameState) => {
    if (isOnline) return localPlayerColor || PlayerColor.RED;
    const activePlayer = state.players[state.currentPlayerIndex];
    if (activePlayer.isAI) return PlayerColor.RED; // Keep camera on human during AI turn
    return activePlayer.color;
  };

  useEffect(() => {
    if (isOnline && matchId) {
      const unsub = subscribeToMatch(matchId, (data) => {
        setGameState(prev => {
            const newState = {
                ...data.gameState,
                selectedHexId: prev.selectedHexId,
            };
            newState.visibleHexes = calculateVisibleHexes(newState, getViewerColor(newState));
            return newState;
        });
      });
      return () => unsub();
    }
  }, [isOnline, matchId, localPlayerColor]);

  const startGame = (playerCount: number) => {
    setGameState(createInitialState(playerCount));
    setIsOnline(false);
    setSetupMode(false);
  };

  const getCurrentPlayer = () => gameState.players[gameState.currentPlayerIndex];

  const canAct = () => {
    if (isOnline) return getCurrentPlayer().color === localPlayerColor;
    return true;
  };

  const endTurn = useCallback(() => {
    setGameState(prev => {
      if (isOnline && prev.players[prev.currentPlayerIndex].color !== localPlayerColor) return prev;

      let nextIndex = (prev.currentPlayerIndex + 1) % prev.players.length;
      let nextPlayer = prev.players[nextIndex];
      let loops = 0;
      while (nextPlayer.eliminated && loops < prev.players.length) {
        nextIndex = (nextIndex + 1) % prev.players.length;
        nextPlayer = prev.players[nextIndex];
        loops++;
      }
      const nextTurn = nextIndex === 0 ? prev.turn + 1 : prev.turn;
      
      const updatedPlayers = prev.players.map(p => {
        if (p.color === nextPlayer.color) {
          const newResources = { ...p.resources };
          (Object.values(prev.tiles) as Tile[]).forEach(t => {
            if (t.controller === p.color) {
              let amount = 1;
              if (t.structure === StructureType.SETTLEMENT) amount += 1;
              if (t.structure === StructureType.CITY) amount += 2;
              newResources[t.resource] += amount;
            }
          });
          return { ...p, resources: newResources };
        }
        return p;
      });

      const updatedUnits = { ...prev.units };
      Object.keys(updatedUnits).forEach(unitId => {
        const unit = updatedUnits[unitId];
        if (unit.owner === nextPlayer.color) {
           let moves = unit.maxMoves;
           const tile = (Object.values(prev.tiles) as Tile[]).find(t => t.unitId === unitId);
           if (tile && tile.hasRoad) moves += 1;
           updatedUnits[unitId] = { ...unit, movesLeft: moves };
        }
      });
      
      const nextState = {
        ...prev,
        currentPlayerIndex: nextIndex,
        turn: nextTurn,
        players: updatedPlayers,
        units: updatedUnits,
        selectedHexId: null,
        gameLog: [`Turn ${nextTurn}: ${nextPlayer.color}'s turn.`, ...prev.gameLog].slice(0, 50),
        isProcessing: false
      };
      
      nextState.visibleHexes = calculateVisibleHexes(nextState, getViewerColor(nextState));
      
      if (isOnline && matchId) updateMatchState(matchId, nextState);
      return nextState;
    });
  }, [isOnline, matchId, localPlayerColor]); 

  const handleConstruct = useCallback((itemId: string, itemCategory: 'UNIT' | 'STRUCTURE', hexId: string) => {
    setGameState(prev => {
        const player = prev.players[prev.currentPlayerIndex];
        if (isOnline && player.color !== localPlayerColor) return prev;
        
        const tile = prev.tiles[hexId];
        if (!tile) return prev;
        
        let cost: Record<ResourceType, number> = itemCategory === 'UNIT' ? UNIT_STATS[itemId as UnitType].cost : STRUCTURE_STATS[itemId as StructureType].cost;
        const canAfford = RESOURCES.every(r => player.resources[r] >= cost[r]);
        if (!canAfford) return { ...prev, gameLog: ["Not enough resources.", ...prev.gameLog] };

        const updatedPlayers = prev.players.map(p => {
            if (p.color === player.color) {
              const newRes = { ...p.resources };
              RESOURCES.forEach(r => newRes[r] -= cost[r]);
              return { ...p, resources: newRes };
            }
            return p;
        });
        
        let updatedTiles = { ...prev.tiles };
        let updatedUnits = { ...prev.units };
        
        if (itemCategory === 'UNIT') {
            const newUnitId = uuidv4();
            const stats = UNIT_STATS[itemId as UnitType];
            updatedUnits[newUnitId] = {
                id: newUnitId, owner: player.color, type: itemId as UnitType,
                power: stats.power, movesLeft: 0, maxMoves: stats.moves, revealed: false
            };
            updatedTiles[hexId] = { ...updatedTiles[hexId], unitId: newUnitId };
        } else {
            const struct = itemId as StructureType;
            if (struct === StructureType.WALL) updatedTiles[hexId] = { ...updatedTiles[hexId], hasWall: true };
            else if (struct === StructureType.ROAD) updatedTiles[hexId] = { ...updatedTiles[hexId], hasRoad: true };
            else updatedTiles[hexId] = { ...updatedTiles[hexId], structure: struct };
        }
        
        // Ensure frontier expands if building unit or gaining territory (not applicable to unit build directly unless it claims, but safe to run)
        updatedTiles = ensureFrontier(updatedTiles);

        const nextState = { ...prev, players: updatedPlayers, units: updatedUnits, tiles: updatedTiles, gameLog: [`${player.color} built ${itemId}`, ...prev.gameLog] };
        nextState.visibleHexes = calculateVisibleHexes(nextState, getViewerColor(nextState));
        
        if (isOnline && matchId) updateMatchState(matchId, nextState);
        return nextState;
    });
  }, [isOnline, localPlayerColor, matchId]);

  const handleTrade = useCallback((giveResource: ResourceType, getResource: ResourceType) => {
    setGameState(prev => {
        const player = prev.players[prev.currentPlayerIndex];
        const tradeRate = 3;
        if (player.resources[giveResource] < tradeRate) return prev;

        const updatedPlayers = prev.players.map(p => {
            if (p.color === player.color) {
                const newRes = { ...p.resources };
                newRes[giveResource] -= tradeRate;
                newRes[getResource] += 1;
                return { ...p, resources: newRes };
            }
            return p;
        });

        const nextState = { ...prev, players: updatedPlayers, gameLog: [`Traded ${tradeRate} ${giveResource} for 1 ${getResource}.`, ...prev.gameLog] };
        if (isOnline && matchId) updateMatchState(matchId, nextState);
        return nextState;
    });
  }, [isOnline, localPlayerColor, matchId]);

  const handleMove = useCallback((fromHexId: string, toHexId: string) => {
    setGameState(prev => {
        const player = prev.players[prev.currentPlayerIndex];
        if (isOnline && player.color !== localPlayerColor) return prev;
        
        const fromTile = prev.tiles[fromHexId];
        // Allow moving to a tile that doesn't exist yet (frontier) by checking ID or Tile
        // BUT for UI interaction, toHexId comes from existing tiles. 
        // For AI, it might try to move to a non-existent neighbor.
        // We must check if toHexId is a valid neighbor coordinate even if not in tiles.
        
        // Actually, easiest way is to trust `ensureFrontier` has populated neighbors.
        let toTile = prev.tiles[toHexId];
        
        // Auto-generation fallback (should be covered by ensureFrontier but safety first)
        if (!toTile) {
             // Re-construct coord from ID
             const parts = toHexId.split(',').map(Number);
             if (parts.length === 3) {
                 // Check adjacency
                 const dist = (Math.abs(fromTile.q - parts[0]) + Math.abs(fromTile.q + fromTile.r - parts[0] - parts[1]) + Math.abs(fromTile.r - parts[1])) / 2;
                 if (dist === 1) {
                     toTile = generateNewTile(parts[0], parts[1], parts[2]);
                     // We will add it to updatedTiles later
                 }
             }
        }

        if (!fromTile || !toTile) return prev;
        
        const unitId = fromTile.unitId;
        if (!unitId) return prev;
        const unit = prev.units[unitId];
        
        if (unit.owner !== player.color || unit.movesLeft <= 0) return prev;
        
        // Combat Logic
        let nextState = prev;
        let newUnits = { ...prev.units };
        let newTiles = { ...prev.tiles };
        // If we generated a temp toTile, ensure it's in newTiles
        if (!newTiles[toHexId]) newTiles[toHexId] = toTile;

        if (toTile.unitId) {
            const targetUnit = prev.units[toTile.unitId];
            if (targetUnit.owner === player.color) return prev;
            
            let defenderTotalPower = targetUnit.power + (TERRAIN_DEFENSE[toTile.resource] || 0) + (toTile.hasWall ? 3 : 0);
            
            if (newUnits[unit.id]) newUnits[unit.id].revealed = true;
            if (newUnits[targetUnit.id]) newUnits[targetUnit.id].revealed = true;
            
            let msg = '';
            if (unit.power > defenderTotalPower) {
                msg = `${unit.owner} ${unit.type} DEFEATED ${targetUnit.owner} ${targetUnit.type}!`;
                delete newUnits[targetUnit.id];
                newTiles[fromHexId] = { ...newTiles[fromHexId], unitId: null };
                newTiles[toHexId] = { ...newTiles[toHexId], unitId: unit.id, controller: unit.owner };
                if (newUnits[unit.id]) newUnits[unit.id].movesLeft -= 1;
            } else if (defenderTotalPower > unit.power) {
                msg = `${unit.owner} ${unit.type} was SLAIN by ${targetUnit.owner}!`;
                delete newUnits[unit.id];
                newTiles[fromHexId] = { ...newTiles[fromHexId], unitId: null };
            } else {
                msg = `Both units destroyed!`;
                delete newUnits[unit.id]; delete newUnits[targetUnit.id];
                newTiles[fromHexId] = { ...newTiles[fromHexId], unitId: null }; 
                newTiles[toHexId] = { ...newTiles[toHexId], unitId: null };
            }
            nextState = { ...prev, units: newUnits, tiles: newTiles, gameLog: [msg, ...prev.gameLog] };
        } else {
            // Move Logic
            newTiles[fromHexId] = { ...newTiles[fromHexId], unitId: null };
            newTiles[toHexId] = { ...newTiles[toHexId], unitId: unit.id, controller: player.color };
            newUnits[unit.id] = { ...unit, movesLeft: unit.movesLeft - 1 };
            nextState = { ...prev, tiles: newTiles, units: newUnits, gameLog: [`${player.color} moved to ${toHexId}`, ...prev.gameLog] };
        }

        // AUTO EXPAND FRONTIER after any move/combat
        nextState.tiles = ensureFrontier(nextState.tiles);

        nextState.visibleHexes = calculateVisibleHexes(nextState, getViewerColor(nextState));

        if (isOnline && matchId) updateMatchState(matchId, nextState);
        return nextState;
    });
  }, [isOnline, localPlayerColor, matchId]);

  // AI Turn Logic
  useEffect(() => {
    const player = gameState.players[gameState.currentPlayerIndex];
    
    if (!isOnline && player.isAI && !gameState.winner && !gameState.isProcessing) {
        
        const performAITurn = async () => {
            setGameState(prev => ({ ...prev, isProcessing: true }));
            
            try {
                await new Promise(resolve => setTimeout(resolve, 1500));
                
                const aiAction = await getAIMove(gameStateRef.current, player.color);
                console.log("AI Action:", aiAction);

                if (aiAction.action === 'MOVE' && aiAction.fromHexId && aiAction.toHexId) {
                    handleMove(aiAction.fromHexId, aiAction.toHexId);
                } 
                else if (aiAction.action === 'BUILD_UNIT' && aiAction.unitType) {
                    let targetId = aiAction.buildHexId;
                    if (!targetId) {
                        const validTiles = (Object.values(gameStateRef.current.tiles) as Tile[]).filter(t => 
                            t.controller === player.color && !t.unitId
                        );
                        const hq = validTiles.find(t => t.isHQ);
                        if (hq) targetId = hq.id;
                        else if (validTiles.length > 0) targetId = validTiles[0].id;
                    }
                    if (targetId) handleConstruct(aiAction.unitType, 'UNIT', targetId);
                } 
                else if (aiAction.action === 'BUILD_STRUCTURE' && aiAction.structureType) {
                    let targetId = aiAction.buildHexId;
                    if (!targetId) {
                         const validTiles = (Object.values(gameStateRef.current.tiles) as Tile[]).filter(t => t.controller === player.color);
                         if (validTiles.length > 0) targetId = validTiles[0].id;
                    }
                    if (targetId) handleConstruct(aiAction.structureType, 'STRUCTURE', targetId);
                }
            } catch (e) {
                console.error("AI Turn Failed:", e);
            } finally {
                 // ALWAYS end turn to prevent getting stuck
                 setTimeout(() => {
                    endTurn();
                 }, 500);
            }
        };
        performAITurn();
    }
  }, [gameState.currentPlayerIndex, gameState.turn, isOnline, gameState.winner, gameState.isProcessing, handleMove, handleConstruct, endTurn]);

  return {
    gameState, setGameState, startGame, startOnlineGame, joinGame, resumeLastGame, setupMode,
    handleConstruct, handleMove, handleTrade, endTurn, getCurrentPlayer, isOnline, localPlayerColor, matchId,
    firebaseConfigured, saveFirebaseConfig, resetFirebaseConfig, savedMatchId, gameError, isCreatingGame,
    playerId, syncPlayerId
  };
};