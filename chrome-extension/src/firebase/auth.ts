import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signOut,
  type User,
} from "firebase/auth/web-extension";

import { getFirebase } from "./app";

export function observeAuth(callback: (user: User | null) => void) {
  const firebase = getFirebase();
  if (!firebase) {
    callback(null);
    return () => undefined;
  }
  return onAuthStateChanged(firebase.auth, callback);
}

export async function signInWithChromeGoogle() {
  const firebase = getFirebase();
  if (!firebase) throw new Error("Firebase is not configured.");

  const tokenResult = await chrome.identity.getAuthToken({ interactive: true });
  const accessToken =
    typeof tokenResult === "string" ? tokenResult : tokenResult.token;
  if (!accessToken) throw new Error("Chrome did not return a Google access token.");

  const credential = GoogleAuthProvider.credential(null, accessToken);
  await signInWithCredential(firebase.auth, credential);
}

export async function signOutFromExtension() {
  const firebase = getFirebase();
  if (firebase) await signOut(firebase.auth);
  await chrome.identity.clearAllCachedAuthTokens?.();
}
