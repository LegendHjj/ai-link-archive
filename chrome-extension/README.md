# AI Link Archive Chrome Extension

Manifest V3 extension for saving the active Chrome tab into the existing AI Link Archive Firebase database.

## What It Uses

- Firebase web config from the existing repo env vars.
- Google sign-in through Chrome Identity plus `firebase/auth/web-extension`.
- Firestore profile paths used by the current website:

```text
users/{uid}/profiles/{profileId}/links/{linkId}
users/{uid}/profiles/{profileId}/settings/app
users/{uid}/profiles/{profileId}/meta/sync
```

The extension writes the same `LinkItem` shape as the website: `id`, `type`, `url`, `title`, `domain`, `category`, `source`, `tags`, `notes`, `favorite`, `status`, `createdAt`, and `updatedAt`.

The website does not currently have separate description, preview image, or favicon fields. The popup shows those captured values, then stores the edited description and personal note together in the existing `notes` field so saved records stay compatible.

## Firebase Setup

1. Keep the existing Firebase web env vars in the repo root `.env.local`, not inside `chrome-extension/.env.local`. The extension Vite config reads from the parent repo so it shares the website Firebase project.
2. Create an OAuth client for a Chrome extension in Google Cloud Console.
3. Add this env var to `.env.local`:

```env
VITE_FIREBASE_EXTENSION_OAUTH_CLIENT_ID=your_chrome_extension_oauth_client_id.apps.googleusercontent.com
```

4. In Firebase Authentication, enable Google sign-in.
5. In Firebase Authentication > Settings > Authorized domains, add:

```text
chrome-extension://YOUR_EXTENSION_ID
```

Firebase documents the Manifest V3 extension flow and recommends `firebase/auth/web-extension` for extension code:
https://firebase.google.com/docs/auth/web/chrome-extension

## Build

From the website repo root:

```bash
npm --prefix chrome-extension install
npm --prefix chrome-extension run build
```

The built extension is emitted to:

```text
chrome-extension/dist
```

## Load In Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select `chrome-extension/dist`.
5. Pin the extension.
6. Open a normal `https://` page and click the extension icon.

## Notes And Limitations

- Protected pages such as `chrome://` and Chrome Web Store pages cannot be scraped.
- The extension uses the selected Chrome/Firebase Google account. Sign out from the popup if Chrome returns the wrong account.
- Existing categories and tags are loaded from the selected AI Link Archive profile. If the account has no profiles yet, the extension creates the default `AI` profile with id `ai`.
- Duplicate checks are scoped to the signed-in user and selected profile.
- Icons are simple placeholder SVG icons.
