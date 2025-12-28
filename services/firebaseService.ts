import { initializeApp, getApps, getApp, deleteApp, FirebaseApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, onSnapshot, Firestore, updateDoc, initializeFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously, Auth } from "firebase/auth";
import { GameState, MatchData, PlayerColor } from "../types";

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;

export const initFirebase = (config: any) => {
  try {
    const apps = getApps();
    if (apps.length > 0) {
      const existingApp = getApp();
      // Check if config matches existing app options to avoid unnecessary re-init
      if (existingApp.options.apiKey !== config.apiKey || existingApp.options.projectId !== config.projectId) {
        console.log("[Firebase] Config mismatch detected. Replacing app instance...");
        // Attempt to delete properly
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

    // Use initializeFirestore to allow undefined properties (prevents 400 "Invalid Argument" errors on save)
    try {
        db = initializeFirestore(app, { ignoreUndefinedProperties: true });
    } catch (e) {
        // If already initialized, fallback to getFirestore
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
      
      // Detailed logging for common 400 errors in Auth
      if (code === 'auth/operation-not-allowed') {
          console.warn("Hint: Enable 'Anonymous' sign-in provider in Firebase Console > Authentication > Sign-in method.");
      }
      if (code === 'auth/configuration-not-found') {
          console.warn("Hint: Check your API Key and Project ID. Identity Platform might not be enabled.");
      }

      // Return null to allow Firestore access if rules are open
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

  // Host is always RED
  const matchData: MatchData = {
    gameState: { ...initialState, matchId },
    playerIds: { [hostPlayerId]: PlayerColor.RED },
    createdAt: Date.now()
  };

  try {
    await setDoc(matchRef, matchData);
  } catch (e: any) {
    console.error("Firestore Write Error:", e);
    // Explicitly handle the "undefined" field error if it somehow slips through config
    if (e.message && e.message.includes("undefined")) {
        throw new Error("Game data contained undefined fields. Please refresh and try again.");
    }
    if (e.code === 'permission-denied') {
        throw new Error("Database permission denied. Enable Anonymous Auth in Firebase Console OR set Firestore Rules to test mode.");
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
    
    // 1. Check if player already in game (Re-joining async)
    if (data.playerIds[playerId]) {
        return { success: true, color: data.playerIds[playerId] };
    }

    // 2. Find open slot
    const occupiedColors = Object.values(data.playerIds);
    const allColors = [PlayerColor.RED, PlayerColor.BLUE, PlayerColor.GREEN, PlayerColor.YELLOW];
    const maxPlayers = data.gameState.players.length;
    const availableColors = allColors.slice(0, maxPlayers).filter(c => !occupiedColors.includes(c));

    if (availableColors.length === 0) {
        return { success: false, color: null, msg: "Game is full" };
    }

    const assignedColor = availableColors[0];
    
    // 3. Register player
    await updateDoc(matchRef, {
        [`playerIds.${playerId}`]: assignedColor
    });

    return { success: true, color: assignedColor };
  } catch (e: any) {
      console.error("Firestore Error:", e);
      if (e.code === 'permission-denied') {
          return { success: false, color: null, msg: "Database permission denied. Check Firebase Rules." };
      }
      return { success: false, color: null, msg: e.message || "Join failed" };
  }
};

export const subscribeToMatch = (matchId: string, onUpdate: (data: MatchData) => void) => {
  if (!db) return () => {};
  // Returns unsubscribe function
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
    await updateDoc(matchRef, {
      gameState: newState
    });
  } catch (e: any) {
    // Suppress logs for expected permission issues to avoid console spam
    if (e.code !== 'permission-denied') {
        console.error("Failed to update match state:", e.message);
    }
  }
};