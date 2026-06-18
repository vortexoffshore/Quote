import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import firebaseConfig from "./firebase-applet-config.json";

// Verify if the config has been populated with valid keys
export const isFirebaseConfigured = 
  firebaseConfig && 
  firebaseConfig.apiKey && 
  firebaseConfig.apiKey !== "stub-api-key" &&
  !firebaseConfig.apiKey.startsWith("YOUR_");

let appInstance;
let firestoreInstance: any = null;

if (isFirebaseConfigured) {
  try {
    appInstance = initializeApp(firebaseConfig);
    const dbId = (firebaseConfig as any).firestoreDatabaseId || "(default)";
    firestoreInstance = getFirestore(appInstance, dbId);
    
    // Quick validation log
    console.log("Firebase initialized successfully with project ID:", firebaseConfig.projectId, "and DB:", dbId);
  } catch (error) {
    console.error("Firebase initialization failed:", error);
  }
} else {
  console.warn("Firebase is using a stub config. Auto-sync will run in LocalStorage fallback mode until Firebase settings are completed.");
}

export const db = firestoreInstance;

// Error structures as mandated
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null,
      email: null
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
