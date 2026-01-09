import { initializeApp, getApps, getApp, deleteApp, FirebaseApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, onSnapshot, Firestore, updateDoc, initializeFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously, Auth } from "firebase/auth";
import { GameState, MatchData, PlayerColor } from "../types";

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;

// Deep sanitize function to remove circular references, functions, and undefined values
const deepSanitize = (obj: any, seen = new WeakSet()): any => {
    if (obj === undefined) return undefined;
    if (obj === null || typeof obj !== 'object') return obj;
    
    // Break circular references
    if (seen.has(obj)) return null; 
    seen.add(obj);

    if (Array.isArray(obj)) {
        return obj.map(v => deepSanitize(v, seen));
    }

    const res: any = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const val = deepSanitize(obj[key], seen);
            if (val !== undefined) {
                res[key] = val;
            }
        }
    }
    return res;
};

export const initFirebase = (config: any) => {
  try {
    const apps = getApps();
    if (apps.length > 0) {
      const existingApp = getApp();
      // Check if config matches existing app options to avoid unnecessary re-init
      if (existingApp.options.apiKey !== config.apiKey || existingApp.options.projectId !== config.projectId) {
        console.log("[Firebase] Config mismatch detected. Replacing app instance...");
        deleteApp(existingApp).catch(err => console.warn("Warning deleting stale app:", err.message));
        try {
            app = initializeApp(config);
        } catch(e) {
            console.warn("Re-init collision, using existing.", e);
            app = existingApp;
        }
      } else {
        console.log("[Firebase] Re-using existing app instance:", existingApp.options.projectId);
        app = existingApp;
      }
    } else {
      console.log("[Firebase] Initializing new app instance.");
      app = initializeApp(config);
    }

    try {
        db = initializeFirestore(app, { ignoreUndefinedProperties: true });
    } catch (e) {
        db = getFirestore(app);
    }
    
    auth = getAuth(app);
  } catch (e: any) {
    console.error("Firebase Initialization Error:", e.message || e);
  }
  return app;
};

const ensureAuth = async () => {
  if (!auth) return null; 
  if (!auth.currentUser) {
    try {
      console.log("[Firebase] Attempting anonymous sign-in...");
      await signInAnonymously(auth);
      console.log("[Firebase] Sign-in successful.");
    } catch (error: any) {
      const code = error.code;
      console.warn(`[Firebase] Auth failed (${code}). Proceeding unauthenticated (Test Mode).`);
      return null;
    }
  }
  return auth.currentUser;
};

export const isFirebaseInitialized = () => !!db;

export const createOnlineGame = async (initialState: GameState, hostPlayerId: string): Promise<string> => {
  if (!db) throw new Error("Firebase not initialized");
  await ensureAuth();
  
  const matchId = Math.random().toString(36).substring(2, 8).toUpperCase();
  const matchRef = doc(db, "matches", matchId);
  const hostColor = initialState.players[0].color;

  const matchData: MatchData = {
    gameState: { ...initialState, matchId },
    playerIds: { [hostPlayerId]: hostColor },
    createdAt: Date.now()
  };

  try {
    const cleanData = deepSanitize(matchData);
    await setDoc(matchRef, cleanData);
  } catch (e: any) {
    console.error("Firestore Write Error:", e);
    if (e.message && e.message.includes("undefined")) {
        throw new Error("Game data contained undefined fields.");
    }
    if (e.code === 'permission-denied') {
        throw new Error("Database permission denied. Check Rules.");
    }
    throw e;
  }
  return matchId;
};

export const joinOnlineGame = async (matchId: string, playerId: string): Promise<{ color: PlayerColor | null; success: boolean, msg?: string }> => {
  if (!db) throw new Error("Firebase not initialized");
  await ensureAuth();

  const matchRef = doc(db, "matches", matchId);
  try {
    const snap = await getDoc(matchRef);

    if (!snap.exists()) return { success: false, color: null, msg: "Game not found" };

    const data = snap.data() as MatchData;
    
    if (data.playerIds[playerId]) {
        return { success: true, color: data.playerIds[playerId] };
    }

    const occupiedColors = Object.values(data.playerIds);
    const allColors = data.gameState.players.map(p => p.color);
    const availableColors = allColors.filter(c => !occupiedColors.includes(c));

    if (availableColors.length === 0) {
        return { success: false, color: null, msg: "Game is full" };
    }

    const assignedColor = availableColors[0];
    
    await updateDoc(matchRef, {
        [`playerIds.${playerId}`]: assignedColor
    });

    return { success: true, color: assignedColor };
  } catch (e: any) {
      console.error("Firestore Error:", e);
      return { success: false, color: null, msg: e.message || "Join failed" };
  }
};

export const subscribeToMatch = (matchId: string, onUpdate: (data: MatchData) => void) => {
  if (!db) return () => {};
  return onSnapshot(doc(db, "matches", matchId), (doc) => {
    if (doc.exists()) {
      onUpdate(doc.data() as MatchData);
    }
  }, (error) => {
      console.warn("Match subscription warning:", error.message);
  });
};

export const updateMatchState = async (matchId: string, newState: GameState) => {
  if (!db) return;
  const matchRef = doc(db, "matches", matchId);
  try {
    const cleanState = deepSanitize(newState);
    await updateDoc(matchRef, {
      gameState: cleanState
    });
  } catch (e: any) {
    if (e.code !== 'permission-denied') {
        console.error("Failed to update match state:", e.message);
    }
  }
};