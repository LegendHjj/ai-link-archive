# Guest Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a remembered browser-only guest session whose data never migrates to or overwrites a Firebase account.

**Architecture:** Reuse the existing UID-scoped local cache and profile code with a reserved local guest storage owner that cannot be a Firebase UID. Persist only a guest-mode preference flag; authenticated Firebase state always wins, and guest writes remain local because remote writes already require a Firebase user.

**Tech Stack:** React 18, TypeScript, Firebase Auth/Firestore, browser localStorage, Vitest, Vite.

## Global Constraints

- Guest data must never be automatically migrated, merged, uploaded, or used to initialize Firebase data.
- Existing authenticated Firebase synchronization must remain unchanged.
- Existing non-Firebase local mode must remain unchanged.
- Do not add dependencies or modify the user's in-progress note-view behavior.

---

### Task 1: Isolated, remembered guest mode

**Files:**
- Modify: `src/lib/localStore.ts`
- Modify: `src/lib/localStore.test.ts`
- Modify: `src/hooks/useLinks.ts`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Produces: `GUEST_STORAGE_ID: string`, a reserved 129-character owner ID that cannot equal a Firebase Auth UID.
- Produces: `isGuestModeEnabled(): boolean` and `setGuestModeEnabled(enabled: boolean): void`.
- Produces from `useLinks()`: `guestMode: boolean`, `enterGuestMode(): void`, and `leaveGuestMode(): void`.
- Consumes: existing `loadLocalCache`, `saveLocalCache`, `loadProfilesCache`, and `saveProfilesCache` using `GUEST_STORAGE_ID`.

- [ ] **Step 1: Write failing storage tests**

Add imports for `GUEST_STORAGE_ID`, `isGuestModeEnabled`, and `setGuestModeEnabled` to `src/lib/localStore.test.ts`, then add:

```ts
it("keeps guest and Firebase caches isolated", () => {
  saveLocalCache(cacheWithTitle("Guest record"), GUEST_STORAGE_ID, "ai");
  saveLocalCache(cacheWithTitle("Cloud record"), "firebase-user-1", "ai");

  expect(loadLocalCache(GUEST_STORAGE_ID, "ai").links[0].title).toBe("Guest record");
  expect(loadLocalCache("firebase-user-1", "ai").links[0].title).toBe("Cloud record");
});

it("remembers and clears guest mode without deleting its cache", () => {
  saveLocalCache(cacheWithTitle("Guest record"), GUEST_STORAGE_ID, "ai");
  setGuestModeEnabled(true);
  expect(isGuestModeEnabled()).toBe(true);

  setGuestModeEnabled(false);
  expect(isGuestModeEnabled()).toBe(false);
  expect(loadLocalCache(GUEST_STORAGE_ID, "ai").links[0].title).toBe("Guest record");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/lib/localStore.test.ts`

Expected: FAIL because the three guest storage exports do not exist.

- [ ] **Step 3: Add the minimal guest storage primitives**

In `src/lib/localStore.ts`, add a reserved ID longer than Firebase Auth's 128-character UID maximum and a separate preference key:

```ts
export const GUEST_STORAGE_ID = `local-guest:${"_".repeat(117)}`;
const GUEST_MODE_KEY = "ai-link-archive:guest-mode:v1";

export function isGuestModeEnabled() {
  return window.localStorage.getItem(GUEST_MODE_KEY) === "1";
}

export function setGuestModeEnabled(enabled: boolean) {
  if (enabled) window.localStorage.setItem(GUEST_MODE_KEY, "1");
  else window.localStorage.removeItem(GUEST_MODE_KEY);
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- src/lib/localStore.test.ts`

Expected: all local store tests PASS.

- [ ] **Step 5: Route signed-out app state through the guest owner**

In `src/hooks/useLinks.ts`:

- Import the three guest storage exports.
- Add `guestMode` state initialized to `false`.
- In `onAuthStateChanged`, clear guest mode when a Firebase user exists; otherwise restore the remembered guest profiles/cache or show an empty signed-out state.
- Define `storageUserId` as `GUEST_STORAGE_ID` for guests and `user?.uid` otherwise.
- Replace local cache/profile writes that currently use `user?.uid` with `storageUserId`; retain `user` checks around every Firebase call.
- Add `enterGuestMode` to remember guest mode and load its cached profiles/library.
- Add `leaveGuestMode` to clear only the preference and return to the signed-out login state.
- Return `guestMode`, `enterGuestMode`, and `leaveGuestMode` and show mode text `Local guest` while active.

The authentication branch must follow this shape:

```ts
if (nextUser) {
  setGuestModeEnabled(false);
  setGuestMode(false);
  const profilesCache = loadProfilesCache(nextUser.uid);
  const cache = loadFirebaseProfileCache(
    nextUser.uid,
    profilesCache.activeProfileId,
    false,
  );
  setProfiles(profilesCache.profiles);
  setActiveProfileId(profilesCache.activeProfileId);
  setLinks(cache.links);
  setSettings(cache.settings);
} else if (isGuestModeEnabled()) {
  const profilesCache = loadProfilesCache(GUEST_STORAGE_ID);
  const cache = loadLocalCache(GUEST_STORAGE_ID, profilesCache.activeProfileId);
  setGuestMode(true);
  setProfiles(profilesCache.profiles);
  setActiveProfileId(profilesCache.activeProfileId);
  setLinks(cache.links);
  setSettings(cache.settings);
} else {
  setGuestMode(false);
  setLinks([]);
  setSettings(initial.settings);
  setProfiles([createDefaultProfile()]);
  setActiveProfileId(DEFAULT_PROFILE_ID);
}
```

- [ ] **Step 6: Add the guest login and toolbar actions**

In `src/App.tsx`:

- Add `onGuest: () => void` to `LoginScreen` and render a non-submit **Continue as guest** button.
- Pass `enterGuestMode` to both login-screen returns.
- Allow the app shell when `guestMode` is true.
- In guest mode, render a **Sign in** toolbar button that calls `leaveGuestMode`; keep the existing Firebase sign-out button unchanged for authenticated users.

Use the existing secondary button styling and add only a small divider/spacing rule in `src/styles.css` if the three login actions need separation.

- [ ] **Step 7: Run automated verification**

Run: `npm test`

Expected: all Vitest tests PASS with zero failures.

Run: `npm run build`

Expected: TypeScript and Vite production build exit successfully.

- [ ] **Step 8: Validate the rendered interaction**

Start the existing Vite development server and validate:

1. Login page renders **Continue as guest** without console errors.
2. Clicking it opens the library with `Local guest` visible.
3. Adding or observing guest data, then reloading, restores guest mode and the same guest library.
4. Clicking **Sign in** returns to login without removing the guest cache.
5. Returning to guest restores the same guest data.
6. Firebase login, when credentials are available, loads the Firebase UID cache rather than guest records.

- [ ] **Step 9: Commit only the guest-mode files**

```text
git add src/lib/localStore.ts src/lib/localStore.test.ts src/hooks/useLinks.ts src/App.tsx src/styles.css
git commit -m "feat: add isolated local guest mode"
```
