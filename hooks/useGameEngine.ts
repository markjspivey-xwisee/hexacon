import { useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { GameState, Player, PlayerColor, Tile, Unit, UnitType, StructureType, ResourceType, FloatingText, MatchData, TechType, MapType, CombatResult } from '../types';
import { generateGrid, getHexId, getNeighbors, calculateVisibleHexes, generateNewTile, hexToPixel } from '../utils/hexUtils';
import { BOARD_RADIUS, MAX_MAP_RADIUS, INITIAL_RESOURCES, UNIT_STATS, STRUCTURE_STATS, TERRAIN_TYPE, RESOURCES, TERRAIN_DEFENSE, TECH_STATS, WONDER_VICTORY_TURNS } from '../constants';
import { getAIMove } from '../services/geminiService';
import { createOnlineGame, joinOnlineGame, subscribeToMatch, updateMatchState, isFirebaseInitialized, initFirebase } from '../services/firebaseService';
import { playSound } from '../utils/soundUtils';

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

const ensureFrontier = (tiles: Record<string, Tile>, mapType: MapType = MapType.PANGAEA): Record<string, Tile> => {
    const newTiles = { ...tiles };
    let changed = false;
    
    Object.values(tiles).forEach(tile => {
        if (tile.unitId || tile.controller) {
            const neighbors = getNeighbors(tile);
            neighbors.forEach(n => {
                const nId = getHexId(n.q, n.r, n.s);
                const distFromCenter = Math.max(Math.abs(n.q), Math.abs(n.r), Math.abs(n.s));
                
                if (!newTiles[nId] && distFromCenter <= MAX_MAP_RADIUS) {
                    newTiles[nId] = generateNewTile(n.q, n.r, n.s, mapType);
                    changed = true;
                }
            });
        }
    });

    return changed ? newTiles : tiles;
};

const createInitialState = (numPlayers: number, mapType: MapType = MapType.PANGAEA): GameState => {
  let tiles = generateGrid(BOARD_RADIUS, mapType);
  
  const colors = [PlayerColor.RED, PlayerColor.BLUE, PlayerColor.GREEN, PlayerColor.YELLOW].slice(0, numPlayers);
  const players: Player[] = colors.map((c, i) => ({
    color: c,
    isAI: i !== 0,
    resources: { ...INITIAL_RESOURCES },
    activeUnits: 0,
    eliminated: false,
    techs: []
  }));

  const startIds = [
    getHexId(0, -3, 3),   // N
    getHexId(0, 3, -3),   // S
    getHexId(-3, 0, 3),   // NW
    getHexId(3, 0, -3)    // SE
  ];
  
  if (numPlayers === 3) {
      startIds[0] = getHexId(0, -3, 3);
      startIds[1] = getHexId(3, -1, -2);
      startIds[2] = getHexId(-3, 4, -1);
  }

  players.forEach((p, idx) => {
    let hqId = startIds[idx] && tiles[startIds[idx]] ? startIds[idx] : Object.keys(tiles)[idx];
    // Ensure HQ is on Land
    if (tiles[hqId].resource === 'WATER') {
        const neighbors = getNeighbors(tiles[hqId]);
        const landNeighbor = neighbors.find(n => tiles[getHexId(n.q, n.r, n.s)]?.resource !== 'WATER');
        if (landNeighbor) hqId = getHexId(landNeighbor.q, landNeighbor.r, landNeighbor.s);
        else tiles[hqId].resource = 'WHEAT'; // Force land
    }

    if (tiles[hqId]) {
      tiles[hqId].controller = p.color;
      tiles[hqId].isHQ = true;
      tiles[hqId].structure = StructureType.SETTLEMENT;
    }
  });
  
  tiles = ensureFrontier(tiles, mapType);

  const initialState: GameState = {
    turn: 1,
    currentPlayerIndex: 0,
    players,
    tiles,
    units: {},
    gameLog: ['Game Started. Research Seafaring to explore the ocean!'],
    winner: null,
    selectedHexId: null,
    isProcessing: false,
    visibleHexes: [],
    effects: []
  };

  initialState.visibleHexes = calculateVisibleHexes(initialState, PlayerColor.RED);

  return initialState;
};

export const useGameEngine = () => {
  const [gameState, setGameState] = useState<GameState>(() => createInitialState(2));
  const [setupMode, setSetupMode] = useState(true);
  const [isOnline, setIsOnline] = useState(false);
  const [isSpectatorMode, setIsSpectatorMode] = useState(false);
  const [localPlayerColor, setLocalPlayerColor] = useState<PlayerColor | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [firebaseConfigured, setFirebaseConfigured] = useState(false);
  const [savedMatchId, setSavedMatchId] = useState<string | null>(null);
  const [gameError, setGameError] = useState<string | null>(null);
  const [isCreatingGame, setCreatingGame] = useState(false);
  const [playerId, setPlayerId] = useState(getLocalPlayerId());

  // Ref to always get current state in async AI functions
  const gameStateRef = useRef(gameState);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  // Effect cleanup
  useEffect(() => {
    if (gameState.effects.length > 0) {
        const timer = setTimeout(() => {
            setGameState(prev => ({
                ...prev,
                effects: prev.effects.filter(e => Date.now() - e.createdAt < 2000)
            }));
        }, 2000);
        return () => clearTimeout(timer);
    }
  }, [gameState.effects.length]);
  
  // Combat cleanup
  useEffect(() => {
      if (gameState.combatResult) {
          const timer = setTimeout(() => {
              setGameState(prev => ({ ...prev, combatResult: null }));
          }, 3500); 
          return () => clearTimeout(timer);
      }
  }, [gameState.combatResult]);

  const addEffect = useCallback((text: string, tileId: string, color: string) => {
      setGameState(prev => {
          const tile = prev.tiles[tileId];
          if (!tile) return prev;
          const { x, y } = hexToPixel(tile);
          const newEffect: FloatingText = {
              id: uuidv4(),
              x: x + (Math.random() * 20 - 10),
              y: y - 20,
              text,
              color,
              createdAt: Date.now()
          };
          return { ...prev, effects: [...prev.effects, newEffect] };
      });
  }, []);

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

  const startOnlineGame = async (numPlayers: number, mapType: MapType) => {
    setGameError(null);
    if (!firebaseConfigured) { setGameError("Firebase not configured."); return; }
    setCreatingGame(true);
    try {
        const initial = createInitialState(numPlayers, mapType);
        initial.players.forEach(p => p.isAI = false); 
        const id = await createOnlineGame(initial, playerId);
        setMatchId(id);
        setLocalPlayerColor(PlayerColor.RED);
        setIsOnline(true);
        setIsSpectatorMode(false);
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
            setIsSpectatorMode(false);
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

  const getViewerColor = (state: GameState) => {
    if (isOnline) return localPlayerColor || PlayerColor.RED;
    const activePlayer = state.players[state.currentPlayerIndex];
    if (activePlayer.isAI) return PlayerColor.RED; 
    return activePlayer.color;
  };

  const getVisibleHexes = (state: GameState, isSpectating: boolean) => {
      if (isSpectating) return Object.keys(state.tiles);
      return calculateVisibleHexes(state, getViewerColor(state));
  };

  useEffect(() => {
    if (isOnline && matchId) {
      const unsub = subscribeToMatch(matchId, (data) => {
        setGameState(prev => {
            const newState = {
                ...data.gameState,
                selectedHexId: prev.selectedHexId,
            };
            newState.visibleHexes = getVisibleHexes(newState, false);
            return newState;
        });
      });
      return () => unsub();
    }
  }, [isOnline, matchId, localPlayerColor]);

  const startGame = (playerCount: number, mapType: MapType) => {
    setGameState(createInitialState(playerCount, mapType));
    setIsOnline(false);
    setIsSpectatorMode(false);
    setSetupMode(false);
    playSound('TURN_START');
  };

  const startSpectatorGame = (playerCount: number, mapType: MapType) => {
    const initial = createInitialState(playerCount, mapType);
    initial.players = initial.players.map(p => ({ ...p, isAI: true }));
    initial.visibleHexes = Object.keys(initial.tiles);
    
    setGameState(initial);
    setIsOnline(false);
    setIsSpectatorMode(true);
    setSetupMode(false);
    playSound('TURN_START');
  };

  const getCurrentPlayer = () => gameState.players[gameState.currentPlayerIndex];

  const canAct = () => {
    if (isOnline) return getCurrentPlayer().color === localPlayerColor;
    if (isSpectatorMode) return false;
    return true;
  };

  const endTurn = useCallback(() => {
    setGameState(prev => {
      if (isOnline && prev.players[prev.currentPlayerIndex].color !== localPlayerColor) return prev;
      
      let nextState = { ...prev };

      // CHECK FOR WONDER VICTORY
      if (prev.wonderOwner && prev.wonderBuiltAt) {
          const wonderTile = (Object.values(prev.tiles) as Tile[]).find(t => t.structure === StructureType.WONDER);
          if (wonderTile && wonderTile.controller === prev.wonderOwner) {
              const turnsHeld = prev.turn - prev.wonderBuiltAt;
              if (turnsHeld >= WONDER_VICTORY_TURNS) {
                  return { ...prev, winner: prev.wonderOwner, gameLog: [`${prev.wonderOwner} has achieved a Wonder Victory!`, ...prev.gameLog] };
              }
          } else {
              nextState.wonderBuiltAt = undefined;
              nextState.wonderOwner = undefined;
              nextState.gameLog = ["The Wonder has fallen! Victory timer reset.", ...prev.gameLog];
          }
      }

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
          const ecoBonus = p.techs.includes(TechType.ECONOMICS) ? 1 : 0;
          
          (Object.values(prev.tiles) as Tile[]).forEach(t => {
            if (t.controller === p.color) {
              let amount = 1 + ecoBonus;
              if (t.structure === StructureType.SETTLEMENT) amount += 1;
              if (t.structure === StructureType.CITY) amount += 2;
              
              if (t.structure === StructureType.MONOLITH) {
                  newResources.WOOD += 2;
                  newResources.BRICK += 2;
                  newResources.WHEAT += 2;
                  newResources.ORE += 2;
              }
              // Water tiles yield WHEAT if controlled (fishing)
              if (t.resource === 'WATER') {
                  newResources.WHEAT += 1; // Basic fishing
              } else {
                  newResources[t.resource] += amount;
              }
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
           const ownerPlayer = prev.players.find(p => p.color === unit.owner);
           
           if (ownerPlayer?.techs.includes(TechType.LOGISTICS) && (unit.type === UnitType.SOLDIER || unit.type === UnitType.KNIGHT)) {
               moves += 1;
           }

           const tile = (Object.values(prev.tiles) as Tile[]).find(t => t.unitId === unitId);
           if (tile && tile.hasRoad) moves += 1;
           updatedUnits[unitId] = { ...unit, movesLeft: moves };
        }
      });
      
      nextState = {
        ...nextState,
        currentPlayerIndex: nextIndex,
        turn: nextTurn,
        players: updatedPlayers,
        units: updatedUnits,
        selectedHexId: null,
        gameLog: [`Turn ${nextTurn}: ${nextPlayer.color}'s turn.`, ...nextState.gameLog].slice(0, 50),
        isProcessing: false // Ensure AI flag is reset for new player
      };
      
      nextState.visibleHexes = getVisibleHexes(nextState, isSpectatorMode);
      
      if ((!isOnline && !nextPlayer.isAI) || (isOnline && nextPlayer.color === localPlayerColor)) {
          playSound('TURN_START');
      }

      if (isOnline && matchId) updateMatchState(matchId, nextState);
      return nextState;
    });
  }, [isOnline, matchId, localPlayerColor, isSpectatorMode]); 

  // --- AI LOGIC LOOP (Fixed) ---
  useEffect(() => {
    // Only run if offline game or I am the host/local and it's AI turn (for simplicity in local vs AI)
    // Actually, for local play: logic runs on client.
    if (isOnline) return; // Online AI handling is complex, assume handled by host or disabled for now in this scope
    if (setupMode) return;
    if (gameState.winner) return;
    
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (currentPlayer.isAI && !currentPlayer.eliminated && !gameState.isProcessing) {
        
        // Flag processing to prevent double-execution
        setGameState(prev => ({ ...prev, isProcessing: true }));

        const processAITurn = async () => {
            // Wait a beat for UI update
            await new Promise(r => setTimeout(r, 600));

            const aiPlayer = gameStateRef.current.players[gameStateRef.current.currentPlayerIndex];
            
            // AI Action Loop
            for (let i = 0; i < 3; i++) {
                if (gameStateRef.current.winner) break;

                const action = await getAIMove(gameStateRef.current, aiPlayer.color);
                
                if (action.action === 'PASS') break;

                // Execute Action
                 if (action.action === 'BUILD_UNIT' && action.unitType && action.buildHexId) {
                     handleConstruct(action.unitType, 'UNIT', action.buildHexId);
                 } else if (action.action === 'BUILD_STRUCTURE' && action.structureType && action.buildHexId) {
                     handleConstruct(action.structureType, 'STRUCTURE', action.buildHexId);
                 } else if (action.action === 'RESEARCH' && action.techType) {
                     handleResearch(action.techType);
                 } else if (action.action === 'MOVE' && action.fromHexId && action.toHexId) {
                     handleMove(action.fromHexId, action.toHexId);
                 }
                 
                 // Artificial delay between AI moves
                 await new Promise(r => setTimeout(r, 800));
            }
            
            // End turn
            endTurn();
        };

        processAITurn();
    }
  }, [gameState.currentPlayerIndex, gameState.turn, isOnline, setupMode, gameState.winner]);


  const handleResearch = useCallback((tech: TechType) => {
      setGameState(prev => {
        const player = prev.players[prev.currentPlayerIndex];
        // Allow AI to research or current player
        if (isOnline && player.color !== localPlayerColor) return prev; 
        if (player.techs.includes(tech)) return prev;

        const cost = TECH_STATS[tech].cost;
        const canAfford = RESOURCES.every(r => player.resources[r] >= cost[r]);
        if (!canAfford) return { ...prev, gameLog: ["Not enough resources to research.", ...prev.gameLog] };

        const updatedPlayers = prev.players.map(p => {
            if (p.color === player.color) {
              const newRes = { ...p.resources };
              RESOURCES.forEach(r => newRes[r] -= cost[r]);
              return { ...p, resources: newRes, techs: [...p.techs, tech] };
            }
            return p;
        });

        playSound('BUILD');
        addEffect("Researched!", prev.tiles[Object.keys(prev.tiles).find(k => prev.tiles[k].isHQ && prev.tiles[k].controller === player.color) || Object.keys(prev.tiles)[0]]?.id || "0,0,0", "#60a5fa");

        const nextState = { ...prev, players: updatedPlayers, gameLog: [`${player.color} researched ${TECH_STATS[tech].name}`, ...prev.gameLog] };
        if (isOnline && matchId) updateMatchState(matchId, nextState);
        return nextState;
      });
  }, [isOnline, localPlayerColor, matchId, addEffect]);

  const handleConstruct = useCallback((itemId: string, itemCategory: 'UNIT' | 'STRUCTURE', hexId: string) => {
    setGameState(prev => {
        const player = prev.players[prev.currentPlayerIndex];
        // AI check or Local player check
        if (isOnline && player.color !== localPlayerColor) return prev;
        
        const tile = prev.tiles[hexId];
        if (!tile) return prev;
        
        // General checks
        if (tile.controller !== player.color) return prev;
        if (itemCategory === 'UNIT' && tile.unitId) return prev;
        if (itemCategory === 'STRUCTURE' && itemId === StructureType.ROAD && tile.hasRoad) return prev;
        
        if (tile.structure === StructureType.MONOLITH || tile.structure === StructureType.WONDER) {
             return { ...prev, gameLog: ["Cannot build here.", ...prev.gameLog] };
        }
        
        // --- NAVAL RULES ENFORCEMENT ---
        const isWater = tile.resource === 'WATER';
        const isShip = itemId === UnitType.GALLEY;
        const isPort = itemId === StructureType.PORT;
        
        if (isShip) {
            // Rule 1: Must have Seafaring
            if (!player.techs.includes(TechType.SEAFARING)) {
                return { ...prev, gameLog: ["Requires Seafaring Tech.", ...prev.gameLog] };
            }
            // Rule 2: Must be on water
            if (!isWater) return { ...prev, gameLog: ["Galleys must be built on water.", ...prev.gameLog] };
            
            // Rule 3: Must be adjacent to a PORT owned by player
            const neighbors = getNeighbors(tile);
            const adjacentPort = neighbors.some(n => {
                const nId = getHexId(n.q, n.r, n.s);
                const nTile = prev.tiles[nId];
                return nTile && nTile.controller === player.color && nTile.structure === StructureType.PORT;
            });
            
            if (!adjacentPort) return { ...prev, gameLog: ["Galleys must be built next to a Port.", ...prev.gameLog] };
            
        } 
        else if (isPort) {
            // Rule 1: Requires Seafaring
            if (!player.techs.includes(TechType.SEAFARING)) return { ...prev, gameLog: ["Requires Seafaring Tech.", ...prev.gameLog] };
            
            // Rule 2: Must be on land
            if (isWater) return { ...prev, gameLog: ["Ports must be built on land.", ...prev.gameLog] };
            
            // Rule 3: Must be adjacent to water
            const neighbors = getNeighbors(tile);
            const hasWater = neighbors.some(n => prev.tiles[getHexId(n.q, n.r, n.s)]?.resource === 'WATER');
            if (!hasWater) return { ...prev, gameLog: ["Ports must be coastal.", ...prev.gameLog] };
        }
        else if (itemCategory === 'UNIT') {
            // Land units cannot be built on water
            if (isWater) return { ...prev, gameLog: ["Cannot build land units on water.", ...prev.gameLog] };
        }
        else if (itemCategory === 'STRUCTURE' && isWater) {
             return { ...prev, gameLog: ["Cannot build structures on water.", ...prev.gameLog] };
        }

        let cost: Record<ResourceType, number> = itemCategory === 'UNIT' ? UNIT_STATS[itemId as UnitType].cost : STRUCTURE_STATS[itemId as StructureType].cost;
        
        // Masons Discount
        if (player.color === PlayerColor.YELLOW) {
            if (itemId === StructureType.WALL || itemId === StructureType.CITY) {
                const discountedCost = { ...cost };
                RESOURCES.forEach(r => {
                    if (discountedCost[r] > 0) discountedCost[r] = Math.max(1, discountedCost[r] - 1);
                });
                cost = discountedCost;
            }
        }

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
        let newWonderState = { wonderBuiltAt: prev.wonderBuiltAt, wonderOwner: prev.wonderOwner };

        if (itemCategory === 'UNIT') {
            const newUnitId = uuidv4();
            const stats = UNIT_STATS[itemId as UnitType];
            updatedUnits[newUnitId] = {
                id: newUnitId, owner: player.color, type: itemId as UnitType,
                power: stats.power, movesLeft: 0, maxMoves: stats.moves, revealed: false
            };
            updatedTiles[hexId] = { ...updatedTiles[hexId], unitId: newUnitId, controller: player.color };
            addEffect("Unit Ready", hexId, "#4ade80");
        } else {
            const struct = itemId as StructureType;
            if (struct === StructureType.WALL) updatedTiles[hexId] = { ...updatedTiles[hexId], hasWall: true };
            else if (struct === StructureType.ROAD) updatedTiles[hexId] = { ...updatedTiles[hexId], hasRoad: true };
            else {
                updatedTiles[hexId] = { ...updatedTiles[hexId], structure: struct };
                if (struct === StructureType.WONDER) {
                    newWonderState.wonderBuiltAt = prev.turn;
                    newWonderState.wonderOwner = player.color;
                    addEffect("WONDER STARTED", hexId, "#eab308");
                }
            }
            if (struct !== StructureType.WONDER) addEffect("Built", hexId, "#fbbf24");
        }
        
        updatedTiles = ensureFrontier(updatedTiles);
        playSound('BUILD');

        const nextState = { ...prev, ...newWonderState, players: updatedPlayers, units: updatedUnits, tiles: updatedTiles, gameLog: [`${player.color} built ${itemId}`, ...prev.gameLog] };
        nextState.visibleHexes = getVisibleHexes(nextState, isSpectatorMode);
        
        if (isOnline && matchId) updateMatchState(matchId, nextState);
        return nextState;
    });
  }, [isOnline, localPlayerColor, matchId, isSpectatorMode, addEffect]);

  const handleMove = useCallback((fromHexId: string, toHexId: string) => {
    setGameState(prev => {
        const player = prev.players[prev.currentPlayerIndex];
        if (isOnline && player.color !== localPlayerColor) return prev;
        
        const fromTile = prev.tiles[fromHexId];
        let toTile = prev.tiles[toHexId];
        
        if (!toTile) {
             const parts = toHexId.split(',').map(Number);
             if (parts.length === 3) {
                 const dist = Math.max(Math.abs(parts[0]), Math.abs(parts[1]), Math.abs(parts[2]));
                 if (dist <= MAX_MAP_RADIUS) {
                      toTile = generateNewTile(parts[0], parts[1], parts[2]);
                 }
             }
        }

        if (!fromTile || !toTile) return prev;
        const unitId = fromTile.unitId;
        if (!unitId) return prev;
        const unit = prev.units[unitId];
        if (unit.owner !== player.color || unit.movesLeft <= 0) return prev;
        
        // TERRAIN RESTRICTIONS
        const isShip = unit.type === UnitType.GALLEY;
        const targetIsWater = toTile.resource === 'WATER';
        
        if (isShip && !targetIsWater) return prev; // Ships only on water
        if (!isShip && targetIsWater) return prev; // Land units only on land (unless Transport added later)

        let nextState = prev;
        let newUnits = { ...prev.units };
        let newTiles = { ...prev.tiles };
        let updatedPlayers = [...prev.players];
        if (!newTiles[toHexId]) newTiles[toHexId] = toTile;

        // RUINS
        if (toTile.isRuins && !isShip) {
             newTiles[toHexId] = { ...newTiles[toHexId], isRuins: false };
             const lootRoll = Math.random();
             let rewardMsg = "";
             updatedPlayers = updatedPlayers.map(p => {
                 if (p.color === player.color) {
                     if (lootRoll < 0.4) {
                         const res = { ...p.resources };
                         res.WOOD += 2; res.BRICK += 2;
                         rewardMsg = "Found Supplies (+2 Wood/Brick)";
                         addEffect("+Res", toHexId, "#fbbf24");
                         return { ...p, resources: res };
                     } else if (lootRoll < 0.7) {
                         const res = { ...p.resources };
                         res.ORE += 2; res.WHEAT += 2;
                         rewardMsg = "Ancient Treasure (+2 Ore/Wheat)";
                         addEffect("+Gold", toHexId, "#fbbf24");
                         return { ...p, resources: res };
                     } else {
                         rewardMsg = "Ancient Magic (Moves Refreshed)";
                         addEffect("Refresh!", toHexId, "#60a5fa");
                     }
                 }
                 return p;
             });
             if (lootRoll >= 0.7) newUnits[unit.id] = { ...unit, movesLeft: unit.maxMoves };
             nextState = { ...nextState, gameLog: [`Explored Ruins: ${rewardMsg}`, ...prev.gameLog] };
        }

        if (toTile.unitId) {
            // Combat
            const targetUnit = prev.units[toTile.unitId];
            const targetPlayer = prev.players.find(p => p.color === targetUnit.owner);
            
            if (targetUnit.owner === player.color) return prev;
            
            const factionAttackBonus = player.color === PlayerColor.RED ? 1 : 0;
            const attackerBonus = (player.techs.includes(TechType.METALLURGY) ? 1 : 0) + factionAttackBonus;
            const defenderTechBonus = targetPlayer?.techs.includes(TechType.METALLURGY) ? 1 : 0;
            
            const attackerPower = unit.power + attackerBonus;
            
            let defenseBonus = (TERRAIN_DEFENSE[toTile.resource] || 0);
            
            if (targetPlayer?.color === PlayerColor.GREEN && toTile.resource === 'WOOD') {
                defenseBonus += 1;
            }

            if (toTile.hasWall) {
                const masonryBonus = targetPlayer?.techs.includes(TechType.MASONRY) ? 5 : 3;
                defenseBonus += masonryBonus;
            } else if (toTile.structure === StructureType.CITY && targetPlayer?.techs.includes(TechType.MASONRY)) {
                defenseBonus += 1;
            }

            const defenderPower = targetUnit.power + defenderTechBonus + defenseBonus;
            
            if (newUnits[unit.id]) newUnits[unit.id].revealed = true;
            if (newUnits[targetUnit.id]) newUnits[targetUnit.id].revealed = true;
            
            let outcome: 'WIN' | 'LOSS' | 'DRAW' = 'DRAW';
            if (attackerPower > defenderPower) outcome = 'WIN';
            else if (defenderPower > attackerPower) outcome = 'LOSS';
            
            nextState.combatResult = {
                attacker: { type: unit.type, power: attackerPower, owner: unit.owner },
                defender: { type: targetUnit.type, power: defenderPower, owner: targetUnit.owner, bonus: defenseBonus + defenderTechBonus },
                outcome,
                timestamp: Date.now()
            };

            let msg = '';
            if (outcome === 'WIN') {
                msg = `${unit.owner} ${unit.type} DEFEATED ${targetUnit.owner} ${targetUnit.type}!`;
                delete newUnits[targetUnit.id];
                newTiles[fromHexId] = { ...newTiles[fromHexId], unitId: null };
                newTiles[toHexId] = { ...newTiles[toHexId], unitId: unit.id, controller: unit.owner };
                if (newUnits[unit.id]) newUnits[unit.id].movesLeft -= 1;
                playSound('ATTACK_WIN');
            } else if (outcome === 'LOSS') {
                msg = `${unit.owner} ${unit.type} was SLAIN by ${targetUnit.owner}!`;
                delete newUnits[unit.id];
                newTiles[fromHexId] = { ...newTiles[fromHexId], unitId: null };
                playSound('ATTACK_LOSS');
            } else {
                msg = `Both units destroyed!`;
                delete newUnits[unit.id]; delete newUnits[targetUnit.id];
                newTiles[fromHexId] = { ...newTiles[fromHexId], unitId: null }; 
                newTiles[toHexId] = { ...newTiles[toHexId], unitId: null };
                playSound('ATTACK_LOSS');
            }
            nextState = { ...nextState, units: newUnits, tiles: newTiles, players: updatedPlayers, gameLog: [msg, ...nextState.gameLog] };
        } else {
            // Move
            const isGreenInForest = player.color === PlayerColor.GREEN && toTile.resource === 'WOOD';

            newTiles[fromHexId] = { ...newTiles[fromHexId], unitId: null };
            newTiles[toHexId] = { ...newTiles[toHexId], unitId: unit.id, controller: player.color };
            
            if (!toTile.isRuins && !isGreenInForest) {
                 newUnits[unit.id] = { ...unit, movesLeft: unit.movesLeft - 1 };
            }
            nextState = { ...nextState, tiles: newTiles, units: newUnits, players: updatedPlayers, gameLog: [`${player.color} moved to ${toHexId}`, ...nextState.gameLog] };
            playSound('MOVE');
        }

        nextState.tiles = ensureFrontier(nextState.tiles);
        nextState.visibleHexes = getVisibleHexes(nextState, isSpectatorMode);
        if (isOnline && matchId) updateMatchState(matchId, nextState);
        return nextState;
    });
  }, [isOnline, localPlayerColor, matchId, isSpectatorMode, addEffect]);

  const handleTrade = useCallback((give: ResourceType, get: ResourceType) => {
    setGameState(prev => {
        const player = prev.players[prev.currentPlayerIndex];
        if (isOnline && player.color !== localPlayerColor) return prev;
        
        let cost = 3;
        // Faction Bonus: Blue (Cartel) trades at 2:1
        if (player.color === PlayerColor.BLUE) cost = 2;
        
        // Port Bonus: -1 to trade cost (min 1)
        const hasPort = (Object.values(prev.tiles) as Tile[]).some(t => t.controller === player.color && t.structure === StructureType.PORT);
        if (hasPort) cost = Math.max(1, cost - 1);

        if (player.resources[give] < cost) {
             return { ...prev, gameLog: [`Need ${cost} ${give} to trade for ${get}.`, ...prev.gameLog] };
        }

        const updatedPlayers = prev.players.map(p => {
            if (p.color === player.color) {
              const newRes = { ...p.resources };
              newRes[give] -= cost;
              newRes[get] += 1;
              return { ...p, resources: newRes };
            }
            return p;
        });

        playSound('BUILD');
        const nextState = { ...prev, players: updatedPlayers, gameLog: [`Traded ${cost} ${give} for 1 ${get}`, ...prev.gameLog] };
        
        if (isOnline && matchId) updateMatchState(matchId, nextState);
        return nextState;
    });
  }, [isOnline, localPlayerColor, matchId]);

  return {
    gameState, setGameState, startGame, startOnlineGame, startSpectatorGame, joinGame, resumeLastGame, setupMode,
    handleConstruct, handleMove, handleTrade, handleResearch, endTurn, getCurrentPlayer, isOnline, isSpectatorMode, localPlayerColor, matchId,
    firebaseConfigured, saveFirebaseConfig, resetFirebaseConfig, savedMatchId, gameError, isCreatingGame,
    playerId, syncPlayerId
  };
};