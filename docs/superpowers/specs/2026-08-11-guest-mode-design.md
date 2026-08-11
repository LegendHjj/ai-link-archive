# Guest Mode Design

## Goal

Allow signed-out visitors to use AI Link Archive with browser-only storage while keeping guest data completely separate from every Firebase account.

## User Experience

- The login page includes a **Continue as guest** button.
- Selecting it opens the existing application in local-only guest mode.
- The browser remembers guest mode across reloads and restores the guest library.
- Guest mode clearly shows that data is local and offers a **Sign in** action.
- Choosing **Sign in** leaves guest mode and returns to the login page without deleting guest data.
- Signing into Google or with email loads only that Firebase user's library.
- Signing out of Firebase returns to the login page and does not silently enter guest mode.

## Storage and Isolation

- Guest links, settings, profiles, and active profile use a dedicated localStorage identity rather than the generic legacy cache or a Firebase UID.
- Firebase caches remain namespaced by Firebase UID and profile ID.
- Guest data is never automatically migrated, merged, uploaded, or used to initialize a Firebase account.
- Existing Firebase synchronization behavior remains unchanged for authenticated users.
- Existing non-Firebase local mode remains unchanged when Firebase configuration is absent.

## State Flow

1. On startup, Firebase authentication restoration runs as it does now.
2. An authenticated Firebase user always takes precedence over a remembered guest preference.
3. With no authenticated user, a remembered guest preference opens the guest cache; otherwise the login page is shown.
4. Entering guest mode loads guest-scoped profiles and the active guest profile.
5. Leaving guest mode clears only the preference flag, not the guest cache.
6. All guest writes resolve to the guest storage identity and never call Firebase.

## Error Handling

- Invalid or missing guest preference data falls back to the login page.
- Invalid guest cache data continues to use the existing cache normalization and fallback behavior.
- Firebase sign-in and sync errors continue to use the existing error banner.

## Verification

- A storage test proves guest cache data and Firebase UID cache data remain isolated.
- A state test proves guest mode is remembered and can be cleared without deleting its cache.
- Existing tests, TypeScript build, and production build must pass.
- Rendered validation exercises login page to guest library, reload persistence, return to sign-in, and Google-library isolation where Firebase test access permits.

## Out of Scope

- Automatic or manual guest-to-cloud import.
- Cross-browser guest synchronization.
- Guest account recovery after browser storage is cleared.
