import { useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { GameState, Player, PlayerColor, Tile, Unit, UnitType, StructureType, ResourceType, FloatingText, MatchData, TechType, MapType, CombatResult, GameMode } from '../types';
import { generateGrid, getHexId, getNeighbors, calculateVisibleHexes, generateNewTile, hexToPixel } from '../utils/hexUtils';
import { BOARD_RADIUS, MAX_MAP_RADIUS, INITIAL_RESOURCES, UNIT_STATS, STRUCTURE_STATS, TERRAIN_TYPE, RESOURCES, TERRAIN_DEFENSE, TECH_STATS, WONDER_VICTORY_TURNS, MMO_CONFIG } from '../constants';
import { getAIMove, getAIPersonalityMessage } from '../services/geminiService';
import { createOnlineGame, joinOnlineGame, subscribeToMatch, updateMatchState, isFirebaseInitialized, initFirebase } from '../services/firebaseService';
import { playSound } from '../utils/soundUtils';

// ... (Other imports and constants remain the same, kept implicit)
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

// ... (Helper functions: getLocalPlayerId, ensureFrontier, createInitialState - assumed unchanged)
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

const createInitialState = (numPlayers: number, mapType: MapType = MapType.PANGAEA, humanColor: PlayerColor = PlayerColor.RED, mode: GameMode = GameMode.TURN_BASED): GameState => {
  // MMO always starts with slots for 4 players (Max) to allow joining
  const effectivePlayers = mode === GameMode.MMO ? 4 : numPlayers;
  
  let tiles = generateGrid(BOARD_RADIUS, mapType);
  const allColors = [PlayerColor.RED, PlayerColor.BLUE, PlayerColor.GREEN, PlayerColor.YELLOW];
  // Ensure the human color is first (host), then fill the rest
  const otherColors = allColors.filter(c => c !== humanColor);
  const colors = [humanColor, ...otherColors].slice(0, effectivePlayers);
  
  const players: Player[] = colors.map((c, i) => ({
    color: c,
    isAI: i !== 0,
    resources: { ...INITIAL_RESOURCES },
    activeUnits: 0,
    eliminated: false,
    techs: [],
    energy: MMO_CONFIG.MAX_ENERGY,
    maxEnergy: MMO_CONFIG.MAX_ENERGY
  }));

  const startIds = [
    getHexId(0, -3, 3),   // N
    getHexId(0, 3, -3),   // S
    getHexId(-3, 0, 3),   // NW
    getHexId(3, 0, -3)    // SE
  ];
  
  if (effectivePlayers === 3) {
      startIds[0] = getHexId(0, -3, 3);
      startIds[1] = getHexId(3, -1, -2);
      startIds[2] = getHexId(-3, 4, -1);
  }

  players.forEach((p, idx) => {
    let hqId = startIds[idx] && tiles[startIds[idx]] ? startIds[idx] : Object.keys(tiles)[idx];
    if (tiles[hqId].resource === 'WATER') {
        const neighbors = getNeighbors(tiles[hqId]);
        const landNeighbor = neighbors.find(n => tiles[getHexId(n.q, n.r, n.s)]?.resource !== 'WATER');
        if (landNeighbor) hqId = getHexId(landNeighbor.q, landNeighbor.r, landNeighbor.s);
    }
    if (tiles[hqId].resource === 'WATER') {
        tiles[hqId].resource = 'WHEAT';
        tiles[hqId].terrain = TERRAIN_TYPE['WHEAT'];
    }
    const neighbors = getNeighbors(tiles[hqId]);
    let landNeighbors = neighbors.filter(n => {
        const t = tiles[getHexId(n.q, n.r, n.s)];
        return t && t.resource !== 'WATER';
    });
    if (landNeighbors.length < 3) {
        const resourcesToInject: ResourceType[] = ['WOOD', 'BRICK', 'ORE', 'WHEAT'];
        let injectionIdx = 0;
        neighbors.forEach(n => {
            const nid = getHexId(n.q, n.r, n.s);
            if (tiles[nid] && tiles[nid].resource === 'WATER' && landNeighbors.length < 3) {
                 const newRes = resourcesToInject[injectionIdx % resourcesToInject.length];
                 tiles[nid].resource = newRes;
                 tiles[nid].terrain = TERRAIN_TYPE[newRes];
                 injectionIdx++;
                 landNeighbors.push(n);
            }
        });
    }
    if (tiles[hqId]) {
      tiles[hqId].controller = p.color;
      tiles[hqId].isHQ = true;
      tiles[hqId].structure = StructureType.SETTLEMENT;
      tiles[hqId].hasRoad = true;
    }
  });
  tiles = ensureFrontier(tiles, mapType);
  const initialState: GameState = {
    mode,
    turn: 1,
    currentPlayerIndex: 0,
    players,
    tiles,
    units: {},
    gameLog: ['Game Started.'],
    winner: null,
    selectedHexId: null,
    isProcessing: false,
    visibleHexes: [],
    effects: [],
    history: [],
    lastTick: Date.now()
  };
  initialState.visibleHexes = calculateVisibleHexes(initialState, humanColor);
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

  const gameStateRef = useRef(gameState);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  // MMO TICK LOOP
  useEffect(() => {
    if (gameState.mode !== GameMode.MMO || gameState.winner) return;
    
    // We only want ONE person to drive the database writes to avoid massive conflict.
    // In a peer-to-peer style Firebase app, usually the "host" (index 0) drives the world clock.
    // However, for local updates (animations/energy), everyone runs this.
    const isHost = isOnline ? gameState.players[0].color === localPlayerColor : true;
    
    const interval = setInterval(() => {
        const now = Date.now();
        const lastTick = gameStateRef.current.lastTick || now;
        const delta = now - lastTick;
        
        // Resource Tick (e.g. every 10s)
        if (delta >= MMO_CONFIG.RESOURCE_REGEN_INTERVAL) {
             const ticksPassed = Math.floor(delta / MMO_CONFIG.RESOURCE_REGEN_INTERVAL);
             const remainder = delta % MMO_CONFIG.RESOURCE_REGEN_INTERVAL;
             
             setGameState(prev => {
                const nextState = { ...prev, lastTick: now - remainder };
                
                // Regenerate Energy & Resources for EVERYONE
                nextState.players = nextState.players.map(p => {
                    const newEnergy = Math.min(p.maxEnergy, p.energy + (10 * ticksPassed));
                    
                    const newRes = { ...p.resources };
                    const ecoBonus = p.techs.includes(TechType.ECONOMICS) ? 1 : 0;
                    
                    (Object.values(prev.tiles) as Tile[]).forEach(t => {
                        if (t.controller === p.color) {
                            let amount = (1 + ecoBonus) * ticksPassed;
                            if (t.structure === StructureType.SETTLEMENT) amount += (1 * ticksPassed);
                            if (t.structure === StructureType.CITY) amount += (2 * ticksPassed);
                            
                            if (t.resource === 'WATER') {
                                newRes.WHEAT += amount; 
                            } else {
                                newRes[t.resource] += amount;
                            }
                        }
                    });
                    
                    return { ...p, resources: newRes, energy: newEnergy };
                });
                
                // Only host writes the world update to DB
                if (isOnline && isHost && matchId) {
                    updateMatchState(matchId, nextState);
                }
                
                return nextState;
             });
        } 
        // Energy Tick (Local Interpolation for smooth UI)
        else {
             // Just purely local UI update for smoother bars? 
             // Actually, simplest is just to let the main tick handle chunks, but we can do a small local energy drift
             // For now, let's keep it sync'd to the main tick to avoid desync
        }

    }, 1000);

    return () => clearInterval(interval);
  }, [gameState.mode, isOnline, localPlayerColor, matchId, gameState.winner]);

  // ... (Effect hooks for timers and setup - assumed unchanged)
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
  
  useEffect(() => {
      if (gameState.combatResult) {
          const timer = setTimeout(() => {
              setGameState(prev => ({ ...prev, combatResult: null }));
          }, 3500); 
          return () => clearTimeout(timer);
      }
  }, [gameState.combatResult]);

  useEffect(() => {
      if (gameState.aiTaunt) {
          const timer = setTimeout(() => {
              setGameState(prev => ({ ...prev, aiTaunt: null }));
          }, 6000);
          return () => clearTimeout(timer);
      }
  }, [gameState.aiTaunt]);

  const addEffect = useCallback((text: string, tileId: string, color: string) => {
      setGameState(prev => {
          if (prev.visibleHexes && !prev.visibleHexes.includes(tileId)) {
              return prev;
          }
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

  const startOnlineGame = async (numPlayers: number, mapType: MapType, humanColor: PlayerColor, mode: GameMode = GameMode.TURN_BASED) => {
    setGameError(null);
    if (!firebaseConfigured) { setGameError("Firebase not configured."); return; }
    setCreatingGame(true);
    try {
        const initial = createInitialState(numPlayers, mapType, humanColor, mode);
        initial.players.forEach(p => p.isAI = false); 
        const id = await createOnlineGame(initial, playerId);
        setMatchId(id);
        setLocalPlayerColor(humanColor);
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
    if (localPlayerColor) return localPlayerColor;
    return PlayerColor.RED; 
  };

  const getVisibleHexes = (state: GameState, isSpectating: boolean) => {
      if (isSpectating) return Object.keys(state.tiles);
      return calculateVisibleHexes(state, getViewerColor(state));
  };

  useEffect(() => {
    if (isOnline && matchId) {
      const unsub = subscribeToMatch(matchId, (data) => {
        setGameState(prev => {
            // MMO Catch-up Logic: If the server hasn't updated in a while (host went offline),
            // but we are loading it now, we should check if we need to simulate passed time locally
            // This is basic consistency.
            const incomingState = data.gameState;
            
            // If MMO and significant time passed since last tick in the DB state
            if (incomingState.mode === GameMode.MMO && incomingState.lastTick) {
                const now = Date.now();
                const delta = now - incomingState.lastTick;
                if (delta > MMO_CONFIG.RESOURCE_REGEN_INTERVAL * 2) {
                    // It's been a while! Let's simulate catch-up locally
                    // Note: We don't save this immediately to avoid conflicts, but if we perform an action
                    // we will essentially be writing the new state.
                    const ticksPassed = Math.floor(delta / MMO_CONFIG.RESOURCE_REGEN_INTERVAL);
                    // Cap catch-up at ~1 hour to prevent overflow
                    const safeTicks = Math.min(ticksPassed, 360); 

                    incomingState.lastTick = now - (delta % MMO_CONFIG.RESOURCE_REGEN_INTERVAL);
                    incomingState.players = incomingState.players.map(p => {
                         const newEnergy = Math.min(p.maxEnergy, p.energy + (10 * safeTicks));
                         // We could also simulate resources here, but for safety in this prototype
                         // let's just refill Energy so they can play immediately.
                         return { ...p, energy: newEnergy };
                    });
                }
            }

            const newState = {
                ...incomingState,
                selectedHexId: prev.selectedHexId,
            };
            newState.visibleHexes = getVisibleHexes(newState, false);
            return newState;
        });
      });
      return () => unsub();
    }
  }, [isOnline, matchId, localPlayerColor]);

  const startGame = (playerCount: number, mapType: MapType, humanColor: PlayerColor) => {
    setGameState(createInitialState(playerCount, mapType, humanColor));
    setLocalPlayerColor(humanColor);
    setIsOnline(false);
    setIsSpectatorMode(false);
    setSetupMode(false);
    playSound('TURN_START');
  };

  const startSpectatorGame = (playerCount: number, mapType: MapType) => {
    const initial = createInitialState(playerCount, mapType, PlayerColor.RED); 
    initial.players = initial.players.map(p => ({ ...p, isAI: true }));
    initial.visibleHexes = Object.keys(initial.tiles);
    setGameState(initial);
    setIsOnline(false);
    setLocalPlayerColor(null);
    setIsSpectatorMode(true);
    setSetupMode(false);
    playSound('TURN_START');
  };

  const getCurrentPlayer = () => gameState.players[gameState.currentPlayerIndex];

  // Turn-Based End Turn (Disabled in MMO)
  const endTurn = useCallback(() => {
    if (gameState.mode === GameMode.MMO) return;

    setGameState(prev => {
      if (isOnline && prev.players[prev.currentPlayerIndex].color !== localPlayerColor) return prev;
      let nextState = { ...prev };
      // ... (existing endTurn stats logic)
      const stats: Record<PlayerColor, { military: number, economy: number }> = {} as any;
      prev.players.forEach(p => {
         const units = (Object.values(prev.units) as Unit[]).filter(u => u.owner === p.color);
         const tiles = (Object.values(prev.tiles) as Tile[]).filter(t => t.controller === p.color);
         stats[p.color] = {
             military: units.reduce((acc, u) => acc + (u.attack + u.defense), 0),
             economy: tiles.length + (Object.values(p.resources) as number[]).reduce((a,b) => a+b, 0)
         };
      });
      nextState.history = [...(prev.history || []), { turn: prev.turn, playerStats: stats }];
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
                  newResources.WOOD += 2; newResources.BRICK += 2; newResources.WHEAT += 2; newResources.ORE += 2;
              }
              if (t.resource === 'WATER') {
                  newResources.WHEAT += 1; 
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
        isProcessing: false 
      };
      nextState.visibleHexes = getVisibleHexes(nextState, isSpectatorMode);
      if ((!isOnline && !nextPlayer.isAI) || (isOnline && nextPlayer.color === localPlayerColor)) {
          playSound('TURN_START');
      }
      if (isOnline && matchId) updateMatchState(matchId, nextState);
      return nextState;
    });
  }, [isOnline, matchId, localPlayerColor, isSpectatorMode, gameState.mode]); 

  // --- AI LOGIC LOOP (Disabled in MMO for now to avoid complexity) ---
  useEffect(() => {
    if (isOnline || gameState.mode === GameMode.MMO) return; 
    if (setupMode) return;
    if (gameState.winner) return;
    
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (currentPlayer.isAI && !currentPlayer.eliminated && !gameState.isProcessing) {
        // ... (AI logic remains the same for Turn-Based)
        setGameState(prev => ({ ...prev, isProcessing: true }));
        const processAITurn = async () => {
            await new Promise(r => setTimeout(r, 600));
            const aiPlayer = gameStateRef.current.players[gameStateRef.current.currentPlayerIndex];
            for (let i = 0; i < 3; i++) {
                if (gameStateRef.current.winner) break;
                const action = await getAIMove(gameStateRef.current, aiPlayer.color);
                if (action.action === 'PASS') break;
                 if (action.action === 'BUILD_UNIT' && action.unitType && action.buildHexId) {
                     handleConstruct(action.unitType, 'UNIT', action.buildHexId);
                 } else if (action.action === 'BUILD_STRUCTURE' && action.structureType && action.buildHexId) {
                     handleConstruct(action.structureType, 'STRUCTURE', action.buildHexId);
                 } else if (action.action === 'RESEARCH' && action.techType) {
                     handleResearch(action.techType);
                 } else if (action.action === 'MOVE' && action.fromHexId && action.toHexId) {
                     handleMove(action.fromHexId, action.toHexId);
                 }
                 await new Promise(r => setTimeout(r, 800));
            }
            endTurn();
        };
        processAITurn();
    }
  }, [gameState.currentPlayerIndex, gameState.turn, isOnline, setupMode, gameState.winner, gameState.mode]);

  // ... (Other action handlers: handleResearch, handleConstruct, handleTrade, handleMove remain unchanged)
  // Re-declare them here because we are replacing the full file content to ensure consistency.
  
  const handleResearch = useCallback((tech: TechType) => {
      if (typeof tech !== 'string') return;
      setGameState(prev => {
        const isMMO = prev.mode === GameMode.MMO;
        const player = isMMO 
             ? prev.players.find(p => p.color === localPlayerColor) || prev.players[0] 
             : prev.players[prev.currentPlayerIndex];
        
        if (isOnline && player.color !== localPlayerColor) return prev; 
        if (player.techs.includes(tech)) return prev;

        const cost = TECH_STATS[tech].cost;
        const canAfford = RESOURCES.every(r => player.resources[r] >= cost[r]);
        const energyCost = isMMO ? MMO_CONFIG.ENERGY_COST.RESEARCH : 0;
        const hasEnergy = isMMO ? player.energy >= energyCost : true;

        if (!canAfford) return { ...prev, gameLog: ["Not enough resources to research.", ...prev.gameLog] };
        if (!hasEnergy) return { ...prev, gameLog: ["Not enough energy.", ...prev.gameLog] };

        const updatedPlayers = prev.players.map(p => {
            if (p.color === player.color) {
              const newRes = { ...p.resources };
              RESOURCES.forEach(r => newRes[r] -= cost[r]);
              return { ...p, resources: newRes, techs: [...p.techs, tech], energy: p.energy - energyCost };
            }
            return p;
        });
        playSound('BUILD');
        addEffect("Researched!", prev.tiles[Object.keys(prev.tiles).find(k => prev.tiles[k].isHQ && prev.tiles[k].controller === player.color) || Object.keys(prev.tiles)[0]]?.id || "0,0,0", "#60a5fa");
        const isLocal = (!isOnline && !player.isAI) || (isOnline && player.color === localPlayerColor);
        const logMsg = isLocal ? `${player.color} researched ${TECH_STATS[tech].name}` : `${player.color} researched a Technology`;
        const nextState = { ...prev, players: updatedPlayers, gameLog: [logMsg, ...prev.gameLog] };
        if (isOnline && matchId) updateMatchState(matchId, nextState);
        return nextState;
      });
  }, [isOnline, localPlayerColor, matchId, addEffect]);

  const handleConstruct = useCallback((itemId: string, itemCategory: 'UNIT' | 'STRUCTURE', hexId: string) => {
    if (typeof itemId !== 'string' || typeof hexId !== 'string') return;
    setGameState(prev => {
        const isMMO = prev.mode === GameMode.MMO;
        const player = isMMO 
             ? prev.players.find(p => p.color === localPlayerColor) || prev.players[0]
             : prev.players[prev.currentPlayerIndex];

        if (isOnline && player.color !== localPlayerColor) return prev;
        const tile = prev.tiles[hexId];
        if (!tile) return prev;
        if (tile.controller !== player.color) return prev;
        if (itemCategory === 'UNIT' && tile.unitId) return prev;
        
        const isWater = tile.resource === 'WATER';
        const isShip = itemId === UnitType.GALLEY;
        const isPort = itemId === StructureType.PORT;
        
        if (isShip) {
            if (!player.techs.includes(TechType.SEAFARING)) return { ...prev, gameLog: ["Requires Seafaring Tech.", ...prev.gameLog] };
            if (!isWater) return { ...prev, gameLog: ["Galleys must be built on water.", ...prev.gameLog] };
            const neighbors = getNeighbors(tile);
            const adjacentPort = neighbors.some(n => {
                const nId = getHexId(n.q, n.r, n.s);
                const nTile = prev.tiles[nId];
                return nTile && nTile.controller === player.color && nTile.structure === StructureType.PORT;
            });
            if (!adjacentPort) return { ...prev, gameLog: ["Galleys must be built next to a Port.", ...prev.gameLog] };
        } else if (isPort) {
             if (!player.techs.includes(TechType.SEAFARING)) return { ...prev, gameLog: ["Requires Seafaring Tech.", ...prev.gameLog] };
             if (isWater) return { ...prev, gameLog: ["Ports must be built on land.", ...prev.gameLog] };
             const neighbors = getNeighbors(tile);
             const hasWater = neighbors.some(n => prev.tiles[getHexId(n.q, n.r, n.s)]?.resource === 'WATER');
             if (!hasWater) return { ...prev, gameLog: ["Ports must be coastal.", ...prev.gameLog] };
        }
        else if (itemCategory === 'UNIT' && isWater) return { ...prev, gameLog: ["Cannot build land units on water.", ...prev.gameLog] };
        else if (itemCategory === 'STRUCTURE' && isWater) return { ...prev, gameLog: ["Cannot build structures on water.", ...prev.gameLog] };

        let cost: Record<ResourceType, number> = itemCategory === 'UNIT' ? UNIT_STATS[itemId as UnitType].cost : STRUCTURE_STATS[itemId as StructureType].cost;
        if (player.color === PlayerColor.YELLOW && (itemId === StructureType.WALL || itemId === StructureType.CITY)) {
             const discountedCost = { ...cost };
             RESOURCES.forEach(r => { if (discountedCost[r] > 0) discountedCost[r] = Math.max(1, discountedCost[r] - 1); });
             cost = discountedCost;
        }
        
        // MMO Energy Check
        const energyCost = isMMO ? (itemCategory === 'UNIT' ? MMO_CONFIG.ENERGY_COST.BUILD_UNIT : MMO_CONFIG.ENERGY_COST.BUILD_STRUCTURE) : 0;
        const hasEnergy = isMMO ? player.energy >= energyCost : true;

        const canAfford = RESOURCES.every(r => player.resources[r] >= cost[r]);
        if (!canAfford) return { ...prev, gameLog: ["Not enough resources.", ...prev.gameLog] };
        if (!hasEnergy) return { ...prev, gameLog: ["Not enough energy.", ...prev.gameLog] };

        const updatedPlayers = prev.players.map(p => {
            if (p.color === player.color) {
              const newRes = { ...p.resources };
              RESOURCES.forEach(r => newRes[r] -= cost[r]);
              return { ...p, resources: newRes, energy: p.energy - energyCost };
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
                attack: stats.attack, defense: stats.defense, movesLeft: 0, maxMoves: stats.moves, revealed: false
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
                    newWonderState.wonderBuiltAt = prev.turn; newWonderState.wonderOwner = player.color; addEffect("WONDER STARTED", hexId, "#eab308");
                }
            }
            if (struct !== StructureType.WONDER) addEffect("Built", hexId, "#fbbf24");
        }
        updatedTiles = ensureFrontier(updatedTiles);
        playSound('BUILD');
        const isLocal = (!isOnline && !player.isAI) || (isOnline && player.color === localPlayerColor);
        let logMsg = isLocal ? `${player.color} built ${itemId}` : (itemCategory === 'UNIT' ? `${player.color} recruited a Unit` : `${player.color} constructed a Building`);
        
        let newSelectedId = prev.selectedHexId;
        if (itemCategory === 'UNIT') {
            newSelectedId = hexId;
        }

        const nextState = { ...prev, ...newWonderState, players: updatedPlayers, units: updatedUnits, tiles: updatedTiles, gameLog: [logMsg, ...prev.gameLog], selectedHexId: newSelectedId };
        nextState.visibleHexes = getVisibleHexes(nextState, isSpectatorMode);
        if (isOnline && matchId) updateMatchState(matchId, nextState);
        return nextState;
    });
  }, [isOnline, localPlayerColor, matchId, isSpectatorMode, addEffect]);
  
  const handleTrade = useCallback((giveResource: ResourceType, getResource: ResourceType) => {
    setGameState(prev => {
        const isMMO = prev.mode === GameMode.MMO;
        const player = isMMO 
             ? prev.players.find(p => p.color === localPlayerColor) || prev.players[0]
             : prev.players[prev.currentPlayerIndex];

        if (isOnline && player.color !== localPlayerColor) return prev;
        const tradeRatio = player.color === PlayerColor.BLUE ? 2 : 3;
        if (player.resources[giveResource] < tradeRatio) return { ...prev, gameLog: ["Not enough resources to trade.", ...prev.gameLog] };
        
        const updatedPlayers = prev.players.map(p => {
            if (p.color === player.color) {
              const newRes = { ...p.resources }; newRes[giveResource] -= tradeRatio; newRes[getResource] += 1;
              return { ...p, resources: newRes };
            }
            return p;
        });
        playSound('BUILD');
        const isLocal = (!isOnline && !player.isAI) || (isOnline && player.color === localPlayerColor);
        const logMsg = isLocal ? `Traded ${tradeRatio} ${giveResource} for 1 ${getResource}` : `${player.color} traded resources`;
        const nextState = { ...prev, players: updatedPlayers, gameLog: [logMsg, ...prev.gameLog] };
        if (isOnline && matchId) updateMatchState(matchId, nextState);
        return nextState;
      });
  }, [isOnline, localPlayerColor, matchId]);

  const handleMove = useCallback(async (fromHexId: string, toHexId: string) => {
    if (typeof fromHexId !== 'string' || typeof toHexId !== 'string') return;

    let newStateSnapshot: GameState | null = null;
    let geminiTrigger: { type: 'VICTORY' | 'DEFEAT' | 'EXPANSION', player: PlayerColor } | null = null;

    setGameState(prev => {
        const isMMO = prev.mode === GameMode.MMO;
        const player = isMMO 
             ? prev.players.find(p => p.color === localPlayerColor) || prev.players[0]
             : prev.players[prev.currentPlayerIndex];

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

        // MMO: Check Energy instead of MovesLeft
        const energyCost = isMMO ? MMO_CONFIG.ENERGY_COST.MOVE : 0;
        const attackEnergyCost = isMMO ? MMO_CONFIG.ENERGY_COST.ATTACK : 0;

        if (unit.owner !== player.color) return prev;
        if (!isMMO && unit.movesLeft <= 0) return prev;
        if (isMMO && player.energy < energyCost) return prev; // Basic check, detailed below
        
        const isShip = unit.type === UnitType.GALLEY;
        const targetIsWater = toTile.resource === 'WATER';
        const hasSeafaring = player.techs.includes(TechType.SEAFARING);
        
        if (isShip && !targetIsWater) return prev; 
        if (!isShip && targetIsWater && !hasSeafaring) return prev; 

        let nextState = prev;
        let newUnits = { ...prev.units };
        let newTiles = { ...prev.tiles };
        let updatedPlayers = [...prev.players];
        if (!newTiles[toHexId]) newTiles[toHexId] = toTile;

        let combatOccurred = false;

        // ... (Ruins logic same)
        if (toTile.isRuins && !isShip) {
             newTiles[toHexId] = { ...newTiles[toHexId], isRuins: false };
             const lootRoll = Math.random();
             let rewardMsg = "";
             updatedPlayers = updatedPlayers.map(p => {
                 if (p.color === player.color) {
                     if (lootRoll < 0.4) {
                         const res = { ...p.resources }; res.WOOD += 2; res.BRICK += 2;
                         rewardMsg = "Found Supplies (+2 Wood/Brick)"; addEffect("+Res", toHexId, "#fbbf24");
                         return { ...p, resources: res };
                     } else if (lootRoll < 0.7) {
                         const res = { ...p.resources }; res.ORE += 2; res.WHEAT += 2;
                         rewardMsg = "Ancient Treasure (+2 Ore/Wheat)"; addEffect("+Gold", toHexId, "#fbbf24");
                         return { ...p, resources: res };
                     } else {
                         rewardMsg = "Ancient Magic (Moves/Energy Refreshed)"; addEffect("Refresh!", toHexId, "#60a5fa");
                         if (isMMO) return { ...p, energy: p.maxEnergy };
                     }
                 }
                 return p;
             });
             if (lootRoll >= 0.7 && !isMMO) newUnits[unit.id] = { ...unit, movesLeft: unit.maxMoves };
             const isLocal = (!isOnline && !player.isAI) || (isOnline && player.color === localPlayerColor);
             const logMsg = isLocal ? `Explored Ruins: ${rewardMsg}` : `${player.color} explored Ruins`;
             nextState = { ...nextState, gameLog: [logMsg, ...prev.gameLog] };
        }

        // --- COMBAT LOGIC ---
        if (toTile.unitId) {
            // In MMO, Combat costs more energy
            if (isMMO && player.energy < attackEnergyCost) return prev;

            const targetUnit = prev.units[toTile.unitId];
            const targetPlayer = prev.players.find(p => p.color === targetUnit.owner);
            if (targetUnit.owner === player.color) return prev;
            combatOccurred = true;

            // Spy / Decoy logic...
            if (unit.type === UnitType.SPY) {
                 newUnits[targetUnit.id] = { ...targetUnit, revealed: true }; delete newUnits[unit.id]; newTiles[fromHexId] = { ...newTiles[fromHexId], unitId: null };
                 nextState = { ...nextState, combatResult: { attacker: { type: unit.type, attack: 0, owner: unit.owner }, defender: { type: targetUnit.type, defense: targetUnit.defense, owner: targetUnit.owner, bonus: 0 }, outcome: 'REVEAL', timestamp: Date.now(), tileId: toHexId }, units: newUnits, tiles: newTiles, gameLog: [`Spy revealed ${targetUnit.type}!`, ...prev.gameLog] };
                 playSound('ATTACK_WIN'); newStateSnapshot = nextState; return nextState;
            }
            if (targetUnit.type === UnitType.DECOY) {
                 delete newUnits[targetUnit.id]; newTiles[toHexId] = { ...newTiles[toHexId], unitId: unit.id, controller: unit.owner }; newTiles[fromHexId] = { ...newTiles[fromHexId], unitId: null };
                 // MMO Deduct Cost
                 if (isMMO) {
                     updatedPlayers = updatedPlayers.map(p => p.color === player.color ? { ...p, energy: p.energy - attackEnergyCost } : p);
                 } else {
                     newUnits[unit.id] = { ...unit, movesLeft: unit.movesLeft - 1 };
                 }
                 nextState = { ...nextState, units: newUnits, tiles: newTiles, players: updatedPlayers, gameLog: [`Decoy destroyed!`, ...prev.gameLog] };
                 playSound('ATTACK_WIN'); newStateSnapshot = nextState; return nextState;
            }
            
            const factionAttackBonus = player.color === PlayerColor.RED ? 1 : 0;
            const attackerBonus = (player.techs.includes(TechType.METALLURGY) ? 1 : 0) + factionAttackBonus;
            const defenderTechBonus = targetPlayer?.techs.includes(TechType.METALLURGY) ? 1 : 0;
            const totalAttack = unit.attack + attackerBonus;
            let defenseBonus = (TERRAIN_DEFENSE[toTile.resource] || 0);
            if (targetPlayer?.color === PlayerColor.GREEN && toTile.resource === 'WOOD') defenseBonus += 1;
            if (toTile.hasWall) {
                const masonryBonus = targetPlayer?.techs.includes(TechType.MASONRY) ? 5 : 3; defenseBonus += masonryBonus;
            } else if (toTile.structure === StructureType.CITY && targetPlayer?.techs.includes(TechType.MASONRY)) { defenseBonus += 1; }
            const totalDefense = targetUnit.defense + defenderTechBonus + defenseBonus;
            
            if (newUnits[unit.id]) newUnits[unit.id].revealed = true;
            if (newUnits[targetUnit.id]) newUnits[targetUnit.id].revealed = true;
            
            let outcome: 'WIN' | 'LOSS' | 'DRAW' = 'DRAW';
            if (totalAttack > totalDefense) outcome = 'WIN';
            else if (totalDefense > totalAttack) outcome = 'LOSS';
            
            nextState.combatResult = {
                attacker: { type: unit.type, attack: totalAttack, owner: unit.owner },
                defender: { type: targetUnit.type, defense: totalDefense, owner: targetUnit.owner, bonus: defenseBonus + defenderTechBonus },
                outcome, timestamp: Date.now(), tileId: toHexId
            };

            // Deduct Attack Energy (MMO)
            if (isMMO) {
                 updatedPlayers = updatedPlayers.map(p => p.color === player.color ? { ...p, energy: p.energy - attackEnergyCost } : p);
            }

            let msg = '';
            if (outcome === 'WIN') {
                msg = `${unit.owner} ${unit.type} DEFEATED ${targetUnit.owner} ${targetUnit.type}!`;
                delete newUnits[targetUnit.id]; newTiles[fromHexId] = { ...newTiles[fromHexId], unitId: null }; newTiles[toHexId] = { ...newTiles[toHexId], unitId: unit.id, controller: unit.owner };
                if (newUnits[unit.id] && !isMMO) newUnits[unit.id].movesLeft -= 1;
                playSound('ATTACK_WIN'); geminiTrigger = { type: 'VICTORY', player: player.color };
            } else if (outcome === 'LOSS') {
                msg = `${unit.owner} ${unit.type} was SLAIN by ${targetUnit.owner}!`;
                delete newUnits[unit.id]; newTiles[fromHexId] = { ...newTiles[fromHexId], unitId: null };
                playSound('ATTACK_LOSS'); geminiTrigger = { type: 'DEFEAT', player: player.color };
            } else {
                msg = `Both units destroyed!`;
                delete newUnits[unit.id]; delete newUnits[targetUnit.id]; newTiles[fromHexId] = { ...newTiles[fromHexId], unitId: null }; newTiles[toHexId] = { ...newTiles[toHexId], unitId: null };
                playSound('ATTACK_LOSS');
            }
            nextState = { ...nextState, units: newUnits, tiles: newTiles, players: updatedPlayers, gameLog: [msg, ...nextState.gameLog] };
        } else {
            // MOVE LOGIC
            const isGreenInForest = player.color === PlayerColor.GREEN && toTile.resource === 'WOOD';
            newTiles[fromHexId] = { ...newTiles[fromHexId], unitId: null };
            newTiles[toHexId] = { ...newTiles[toHexId], unitId: unit.id, controller: player.color };
            
            if (isMMO) {
                 updatedPlayers = updatedPlayers.map(p => p.color === player.color ? { ...p, energy: p.energy - energyCost } : p);
            } else {
                 if (!toTile.isRuins && !isGreenInForest) {
                    newUnits[unit.id] = { ...unit, movesLeft: unit.movesLeft - 1 };
                 }
            }
            
            const isLocal = (!isOnline && !player.isAI) || (isOnline && player.color === localPlayerColor);
            const logMsg = isLocal ? `${player.color} moved to ${toHexId}` : `${player.color} is maneuvering`;
            nextState = { ...nextState, tiles: newTiles, units: newUnits, players: updatedPlayers, gameLog: [logMsg, ...nextState.gameLog] };
            playSound('MOVE');
        }

        nextState.tiles = ensureFrontier(nextState.tiles);
        nextState.visibleHexes = getVisibleHexes(nextState, isSpectatorMode);
        if (isOnline && matchId) updateMatchState(matchId, nextState);
        newStateSnapshot = nextState;
        return nextState;
    });

    if (geminiTrigger && newStateSnapshot) {
        const player = newStateSnapshot.players.find(p => p.color === geminiTrigger!.player);
        if (player && player.isAI && !isOnline) {
             const apiKey = (process.env.API_KEY || (DEFAULT_FIREBASE_CONFIG.apiKey.startsWith("AIza") ? DEFAULT_FIREBASE_CONFIG.apiKey : ""));
             if (apiKey) {
                 const text = await getAIPersonalityMessage(newStateSnapshot, geminiTrigger.player, geminiTrigger.type, apiKey);
                 if (text) setGameState(prev => ({ ...prev, aiTaunt: { text, speaker: geminiTrigger!.player } }));
             }
        }
    }
  }, [isOnline, localPlayerColor, matchId, isSpectatorMode, addEffect]);

  return {
    gameState, setGameState, startGame, startOnlineGame, startSpectatorGame, joinGame, resumeLastGame, setupMode,
    handleConstruct, handleMove, handleTrade, handleResearch, endTurn, getCurrentPlayer, isOnline, isSpectatorMode, localPlayerColor, matchId,
    firebaseConfigured, saveFirebaseConfig, resetFirebaseConfig, savedMatchId, gameError, isCreatingGame,
    playerId, syncPlayerId
  };
};