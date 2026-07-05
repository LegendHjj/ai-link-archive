import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type Auth,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  setDoc,
  where,
  writeBatch,
  type Firestore,
} from "firebase/firestore";

import type { AppSettings, LinkItem, RemoteSyncState, UserProfile } from "../types";
import { DEFAULT_PROFILE_ID } from "./localStore";
import { DEFAULT_SETTINGS } from "./syncUtils";

const firebaseApiKey =
  import.meta.env.VITE_FIREBASE_API_KEY ||
  `${import.meta.env.VITE_FIREBASE_API_KEY_PART_1 ?? ""}${
    import.meta.env.VITE_FIREBASE_API_KEY_PART_2 ?? ""
  }`;

const firebaseConfig = {
  apiKey: firebaseApiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseEnabled = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId,
);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let persistenceReady: Promise<void> | null = null;

function ensureFirebase() {
  if (!firebaseEnabled) return null;
  if (!app) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    persistenceReady = setPersistence(auth, browserLocalPersistence);
  }
  return { auth: auth!, db: db!, persistenceReady: persistenceReady! };
}

export function getFirebaseAuth() {
  return ensureFirebase()?.auth ?? null;
}

export async function signInWithEmail(email: string, password: string) {
  const instance = ensureFirebase();
  if (!instance) return;
  await instance.persistenceReady;
  await signInWithEmailAndPassword(instance.auth, email, password);
}

export async function signInWithGoogle() {
  const instance = ensureFirebase();
  if (!instance) return;
  await instance.persistenceReady;
  await signInWithPopup(instance.auth, new GoogleAuthProvider());
}

export async function signOutOfFirebase() {
  const instance = ensureFirebase();
  if (!instance) return;
  await signOut(instance.auth);
}

function userProfilesPath(userId: string) {
  const instance = ensureFirebase();
  if (!instance) return null;
  return collection(instance.db, "users", userId, "profiles");
}

function userProfileDoc(userId: string, profileId: string) {
  const instance = ensureFirebase();
  if (!instance) return null;
  return doc(instance.db, "users", userId, "profiles", profileId);
}

function userLinksPath(userId: string, profileId = DEFAULT_PROFILE_ID) {
  const instance = ensureFirebase();
  if (!instance) return null;
  return collection(instance.db, "users", userId, "profiles", profileId, "links");
}

function userSettingsDoc(userId: string, profileId = DEFAULT_PROFILE_ID) {
  const instance = ensureFirebase();
  if (!instance) return null;
  return doc(instance.db, "users", userId, "profiles", profileId, "settings", "app");
}

function userSyncDoc(userId: string, profileId = DEFAULT_PROFILE_ID) {
  const instance = ensureFirebase();
  if (!instance) return null;
  return doc(instance.db, "users", userId, "profiles", profileId, "meta", "sync");
}

function legacyUserLinksPath(userId: string) {
  const instance = ensureFirebase();
  if (!instance) return null;
  return collection(instance.db, "users", userId, "links");
}

function legacyUserSettingsDoc(userId: string) {
  const instance = ensureFirebase();
  if (!instance) return null;
  return doc(instance.db, "users", userId, "settings", "app");
}

function legacyUserSyncDoc(userId: string) {
  const instance = ensureFirebase();
  if (!instance) return null;
  return doc(instance.db, "users", userId, "meta", "sync");
}

export async function fetchFirebaseProfiles(userId: string) {
  const profilesPath = userProfilesPath(userId);
  if (!profilesPath) return [];
  const snapshot = await getDocs(profilesPath);
  return snapshot.docs
    .map((entry) => entry.data() as UserProfile)
    .filter((profile) => profile.id && profile.name)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function saveFirebaseProfile(userId: string, profile: UserProfile) {
  const profileDoc = userProfileDoc(userId, profile.id);
  if (!profileDoc) return;
  await setDoc(profileDoc, profile, { merge: true });
}

export async function getFirebaseSyncState(
  userId: string,
  profileId = DEFAULT_PROFILE_ID,
) {
  const syncDoc = userSyncDoc(userId, profileId);
  if (!syncDoc) return null;
  const snapshot = await getDoc(syncDoc);
  if (!snapshot.exists()) return null;
  const data = snapshot.data() as Partial<RemoteSyncState>;
  return {
    linksUpdatedAt: data.linksUpdatedAt ?? 0,
    settingsUpdatedAt: data.settingsUpdatedAt ?? 0,
    updatedAt: data.updatedAt ?? 0,
  };
}

export async function saveFirebaseSyncState(
  userId: string,
  profileId: string,
  patch: Partial<RemoteSyncState>,
) {
  const syncDoc = userSyncDoc(userId, profileId);
  if (!syncDoc) return;
  const next = {
    ...patch,
    updatedAt: Date.now(),
  };
  await setDoc(syncDoc, next, { merge: true });
}

export async function fetchFirebaseLinkChanges(
  userId: string,
  profileId: string,
  since: number,
) {
  const linksCollection = userLinksPath(userId, profileId);
  if (!linksCollection) return [];
  const linksQuery = query(
    linksCollection,
    where("updatedAt", ">", since),
    orderBy("updatedAt", "asc"),
  );
  const snapshot = await getDocs(linksQuery);
  return snapshot.docs.map((entry) => entry.data() as LinkItem);
}

export async function saveFirebaseLink(
  userId: string,
  profileId: string,
  link: LinkItem,
) {
  const linksCollection = userLinksPath(userId, profileId);
  if (!linksCollection) return;
  await setDoc(doc(linksCollection, link.id), link);
  await saveFirebaseSyncState(userId, profileId, { linksUpdatedAt: link.updatedAt });
}

export async function saveFirebaseLinks(
  userId: string,
  profileId: string,
  links: LinkItem[],
) {
  if (!links.length) return;
  const instance = ensureFirebase();
  const linksCollection = userLinksPath(userId, profileId);
  if (!instance || !linksCollection) return;
  const batch = writeBatch(instance.db);
  links.forEach((link) => {
    batch.set(doc(linksCollection, link.id), link);
  });
  await batch.commit();
  await saveFirebaseSyncState(userId, profileId, {
    linksUpdatedAt: Math.max(...links.map((link) => link.updatedAt)),
  });
}

export async function softDeleteFirebaseLink(
  userId: string,
  profileId: string,
  link: LinkItem,
) {
  const now = Date.now();
  await saveFirebaseLink(userId, profileId, {
    ...link,
    deletedAt: now,
    updatedAt: now,
  });
}

export async function fetchFirebaseSettings(
  userId: string,
  profileId = DEFAULT_PROFILE_ID,
) {
  const settingsDoc = userSettingsDoc(userId, profileId);
  if (!settingsDoc) return null;
  const snapshot = await getDoc(settingsDoc);
  return snapshot.exists() ? (snapshot.data() as AppSettings) : null;
}

export async function saveFirebaseSettings(
  userId: string,
  profileId: string,
  settings: AppSettings,
) {
  const settingsDoc = userSettingsDoc(userId, profileId);
  if (!settingsDoc) return;
  const next = {
    ...DEFAULT_SETTINGS,
    ...settings,
    updatedAt: settings.updatedAt || Date.now(),
  };
  await setDoc(settingsDoc, next, { merge: true });
  await saveFirebaseSyncState(userId, profileId, { settingsUpdatedAt: next.updatedAt });
}

export async function getLegacyFirebaseSyncState(userId: string) {
  const syncDoc = legacyUserSyncDoc(userId);
  if (!syncDoc) return null;
  const snapshot = await getDoc(syncDoc);
  if (!snapshot.exists()) return null;
  const data = snapshot.data() as Partial<RemoteSyncState>;
  return {
    linksUpdatedAt: data.linksUpdatedAt ?? 0,
    settingsUpdatedAt: data.settingsUpdatedAt ?? 0,
    updatedAt: data.updatedAt ?? 0,
  };
}

export async function fetchLegacyFirebaseLinks(userId: string) {
  const linksCollection = legacyUserLinksPath(userId);
  if (!linksCollection) return [];
  const linksQuery = query(linksCollection, orderBy("updatedAt", "asc"));
  const snapshot = await getDocs(linksQuery);
  return snapshot.docs.map((entry) => entry.data() as LinkItem);
}

export async function fetchLegacyFirebaseSettings(userId: string) {
  const settingsDoc = legacyUserSettingsDoc(userId);
  if (!settingsDoc) return null;
  const snapshot = await getDoc(settingsDoc);
  return snapshot.exists() ? (snapshot.data() as AppSettings) : null;
}
