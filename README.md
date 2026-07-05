# AI Link Archive

Personal AI knowledge cockpit for saving AI news, tools, research, projects, YouTube links, and notes.

This MVP intentionally does not use a background worker. It stores links, tags, categories, notes, favorites, archive status, and import/export data. It does not scrape full article text or screenshots.

## Run Locally

```bash
npm install
npm run dev -- --port 5174
```

Open `http://127.0.0.1:5174`.

## Firebase

The app runs immediately in localStorage mode. To sync with Firebase, create a Firebase web app and copy `.env.example` to `.env.local`:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Enable Email/Password sign-in in Firebase Authentication. Google sign-in can stay enabled too.

Firebase web config values are public in any browser-built app, including GitHub Pages. Keep real values in `.env.local` for local development and in GitHub Actions repository variables for deployment. Security comes from Firebase Authentication and Firestore rules, not from hiding the web config.

Firestore stores links at:

```text
users/{uid}/links/{linkId}
users/{uid}/settings/app
users/{uid}/meta/sync
```

Suggested Firestore rule:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/links/{linkId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /users/{userId}/settings/{documentId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /users/{userId}/meta/{documentId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## Sync Model

The app is local-first to reduce Firebase reads:

- it loads the browser cache first after Firebase Auth restores your session
- it reads one sync metadata document to check whether anything changed
- it fetches only link documents with `updatedAt` newer than the local cache
- deletes are stored as tombstones so other browsers can learn about removals
- categories and tags live in one settings document and are cached locally

On the first signed-in run, existing localStorage links and default categories/tags are migrated to Firebase.

## Build

```bash
npm run build
```

The Vite `base` is `/ai-link-archive/`, so the built app is served correctly from the GitHub Pages project URL.
