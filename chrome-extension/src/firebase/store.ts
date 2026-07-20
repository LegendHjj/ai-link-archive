import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  type Firestore,
} from "firebase/firestore";

import {
  DEFAULT_PROFILE_ID,
  createDefaultProfile,
  findDuplicateLink,
  mergeSettings,
} from "../shared/bookmark";
import type { AppSettings, LinkItem, UserProfile } from "../shared/types";
import { getFirebase } from "./app";
import { firestorePaths } from "./paths";

const SELECTED_PROFILE_KEY = "selectedProfileId";

function requireFirebase() {
  const firebase = getFirebase();
  if (!firebase) throw new Error("Firebase is not configured.");
  return firebase;
}

function collectionRef(db: Firestore, pathSegments: string[]) {
  const [first, ...rest] = pathSegments;
  if (!first) throw new Error("Firestore collection path is empty.");
  return collection(db, first, ...rest);
}

function docRef(db: Firestore, pathSegments: string[]) {
  const [first, ...rest] = pathSegments;
  if (!first) throw new Error("Firestore document path is empty.");
  return doc(db, first, ...rest);
}

export async function loadStoredProfileId() {
  const stored = await chrome.storage.local.get<{ selectedProfileId?: string }>([
    SELECTED_PROFILE_KEY,
  ]);
  return stored.selectedProfileId ?? null;
}

export async function saveStoredProfileId(profileId: string) {
  await chrome.storage.local.set({ [SELECTED_PROFILE_KEY]: profileId });
}

export async function loadProfiles(userId: string) {
  const { db } = requireFirebase();
  const paths = firestorePaths(userId, DEFAULT_PROFILE_ID);
  const snapshot = await getDocs(collectionRef(db, paths.profilesCollection));
  const profiles = snapshot.docs
    .map((entry) => entry.data() as UserProfile)
    .filter((profile) => profile.id && profile.name)
    .sort((a, b) => a.createdAt - b.createdAt);

  if (profiles.length) return profiles;

  const profile = createDefaultProfile();
  await setDoc(docRef(db, firestorePaths(userId, profile.id).profileDoc), profile, {
    merge: true,
  });
  return [profile];
}

export async function loadSettings(userId: string, profileId: string) {
  const { db } = requireFirebase();
  const snapshot = await getDoc(
    docRef(db, firestorePaths(userId, profileId).settingsDoc),
  );
  return snapshot.exists() ? (snapshot.data() as AppSettings) : null;
}

export async function findDuplicateByUrl(
  userId: string,
  profileId: string,
  url: string,
) {
  const { db } = requireFirebase();
  const linksPath = firestorePaths(userId, profileId).linksCollection;
  const snapshot = await getDocs(
    query(collectionRef(db, linksPath), where("url", "==", url)),
  );
  return findDuplicateLink(
    url,
    snapshot.docs.map((entry) => {
      const data = entry.data() as Pick<LinkItem, "id" | "url" | "deletedAt">;
      return { id: data.id, url: data.url, deletedAt: data.deletedAt };
    }),
  );
}

export async function saveBookmark(
  userId: string,
  profileId: string,
  link: LinkItem,
  settings: AppSettings | null,
) {
  const { db } = requireFirebase();
  const paths = firestorePaths(userId, profileId);
  const nextSettings = mergeSettings(settings, link);

  await Promise.all([
    setDoc(docRef(db, [...paths.linksCollection, link.id]), link),
    setDoc(docRef(db, paths.settingsDoc), nextSettings, { merge: true }),
    setDoc(
      docRef(db, paths.syncDoc),
      {
        linksUpdatedAt: link.updatedAt,
        settingsUpdatedAt: nextSettings.updatedAt,
        updatedAt: Date.now(),
      },
      { merge: true },
    ),
  ]);

  return nextSettings;
}
