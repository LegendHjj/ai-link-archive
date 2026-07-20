import React from "react";
import { createRoot } from "react-dom/client";

import { extractPageMetadata } from "../content/metadata";
import { firebaseEnabled } from "../firebase/app";
import { observeAuth, signInWithChromeGoogle, signOutFromExtension } from "../firebase/auth";
import {
  findDuplicateByUrl,
  loadProfiles,
  loadSettings,
  loadStoredProfileId,
  saveBookmark,
  saveStoredProfileId,
} from "../firebase/store";
import {
  DEFAULT_PROFILE_ID,
  buildLinkItem,
  findActiveProfileId,
} from "../shared/bookmark";
import type { AppSettings, CapturedPage, DuplicateCandidate, UserProfile } from "../shared/types";
import "./styles.css";

type User = {
  uid: string;
  displayName: string | null;
  email: string | null;
};

function isUnsupportedUrl(url: string) {
  if (!url) return "Open a normal webpage before using the extension.";
  if (!/^https?:\/\//i.test(url)) {
    return "Chrome does not allow extensions to read this kind of browser page.";
  }
  const parsed = new URL(url);
  if (
    parsed.hostname === "chrome.google.com" ||
    parsed.hostname === "chromewebstore.google.com"
  ) {
    return "Chrome Web Store pages are protected. Open another webpage to save it.";
  }
  return "";
}

function StatusMessage({ kind, children }: { kind: "info" | "error" | "success"; children: React.ReactNode }) {
  return <div className={`message ${kind}`}>{children}</div>;
}

function App() {
  const [authReady, setAuthReady] = React.useState(false);
  const [user, setUser] = React.useState<User | null>(null);
  const [authBusy, setAuthBusy] = React.useState(false);
  const [captured, setCaptured] = React.useState<CapturedPage | null>(null);
  const [captureError, setCaptureError] = React.useState<string | null>(null);
  const [profiles, setProfiles] = React.useState<UserProfile[]>([]);
  const [profileId, setProfileId] = React.useState(DEFAULT_PROFILE_ID);
  const [settings, setSettings] = React.useState<AppSettings | null>(null);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [category, setCategory] = React.useState("Uncategorized");
  const [selectedTags, setSelectedTags] = React.useState<string[]>([]);
  const [note, setNote] = React.useState("");
  const [duplicate, setDuplicate] = React.useState<DuplicateCandidate | null>(null);
  const [allowDuplicate, setAllowDuplicate] = React.useState(false);
  const [loadingLibrary, setLoadingLibrary] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<{ kind: "info" | "error" | "success"; text: string } | null>(null);

  React.useEffect(() => {
    return observeAuth((nextUser) => {
      setUser(
        nextUser
          ? {
              uid: nextUser.uid,
              displayName: nextUser.displayName,
              email: nextUser.email,
            }
          : null,
      );
      setAuthReady(true);
    });
  }, []);

  React.useEffect(() => {
    async function captureActiveTab() {
      setCaptureError(null);
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const tabUrl = tab?.url ?? "";
        const unsupported = isUnsupportedUrl(tabUrl);
        if (unsupported) {
          setCaptureError(unsupported);
          setCaptured(null);
          return;
        }
        if (!tab.id) throw new Error("Unable to identify the active tab.");

        const [result] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: extractPageMetadata,
        });
        const metadata = result?.result ?? {
          url: tabUrl,
          title: tab.title ?? tabUrl,
          description: "",
          favicon: tab.favIconUrl ?? "",
          image: "",
          domain: new URL(tabUrl).hostname.replace(/^www\./, ""),
        };
        setCaptured(metadata);
        setTitle(metadata.title);
        setDescription(metadata.description);
      } catch (error) {
        setCaptureError(
          error instanceof Error
            ? error.message
            : "This page cannot be read by the extension.",
        );
      }
    }

    void captureActiveTab();
  }, []);

  React.useEffect(() => {
    async function loadLibrary() {
      if (!user) {
        setProfiles([]);
        setSettings(null);
        return;
      }

      setLoadingLibrary(true);
      setMessage(null);
      try {
        const [nextProfiles, storedProfileId] = await Promise.all([
          loadProfiles(user.uid),
          loadStoredProfileId(),
        ]);
        const nextProfileId = findActiveProfileId(nextProfiles, storedProfileId);
        const nextSettings = await loadSettings(user.uid, nextProfileId);
        setProfiles(nextProfiles);
        setProfileId(nextProfileId);
        setSettings(nextSettings);
        setCategory(nextSettings?.categories[0] ?? "Uncategorized");
        await saveStoredProfileId(nextProfileId);
      } catch (error) {
        setMessage({
          kind: "error",
          text: error instanceof Error ? error.message : "Could not load your archive.",
        });
      } finally {
        setLoadingLibrary(false);
      }
    }

    void loadLibrary();
  }, [user]);

  React.useEffect(() => {
    async function checkDuplicate() {
      if (!user || !captured?.url || !profileId) {
        setDuplicate(null);
        return;
      }
      try {
        setDuplicate(await findDuplicateByUrl(user.uid, profileId, captured.url));
        setAllowDuplicate(false);
      } catch {
        setDuplicate(null);
      }
    }

    void checkDuplicate();
  }, [captured?.url, profileId, user]);

  async function changeProfile(nextProfileId: string) {
    setProfileId(nextProfileId);
    setSelectedTags([]);
    setAllowDuplicate(false);
    await saveStoredProfileId(nextProfileId);
    if (!user) return;
    const nextSettings = await loadSettings(user.uid, nextProfileId);
    setSettings(nextSettings);
    setCategory(nextSettings?.categories[0] ?? "Uncategorized");
  }

  async function login() {
    setAuthBusy(true);
    setMessage(null);
    try {
      await signInWithChromeGoogle();
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Google sign-in failed.",
      });
    } finally {
      setAuthBusy(false);
    }
  }

  async function logout() {
    setAuthBusy(true);
    try {
      await signOutFromExtension();
    } finally {
      setAuthBusy(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!user || !captured) return;
    if (duplicate && !allowDuplicate) {
      setMessage({ kind: "error", text: "This URL is already saved. Choose continue anyway to save another copy." });
      return;
    }
    if (!title.trim()) {
      setMessage({ kind: "error", text: "Title is required." });
      return;
    }
    if (!category.trim()) {
      setMessage({ kind: "error", text: "Category is required." });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const link = buildLinkItem({
        url: captured.url,
        title,
        description,
        category,
        tags: selectedTags,
        note,
      });
      const nextSettings = await saveBookmark(user.uid, profileId, link, settings);
      setSettings(nextSettings);
      setDuplicate({ id: link.id, url: link.url });
      setMessage({ kind: "success", text: "Saved to AI Link Archive." });
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not save this bookmark.",
      });
    } finally {
      setSaving(false);
    }
  }

  const tags = settings?.tags ?? [];
  const categories = settings?.categories.length ? settings.categories : [category];

  return (
    <main className="popup-shell">
      <header className="header">
        <div className="brand-mark">AI</div>
        <div>
          <h1>AI Link Archive</h1>
          <p>{user ? user.email ?? user.displayName ?? "Signed in" : "Save current page"}</p>
        </div>
      </header>

      {!firebaseEnabled ? (
        <StatusMessage kind="error">
          Firebase env vars are missing. Configure the extension build before loading it.
        </StatusMessage>
      ) : null}

      {!authReady ? <StatusMessage kind="info">Checking Firebase session...</StatusMessage> : null}

      {authReady && !user ? (
        <section className="auth-panel">
          <p>Sign in with the Google account you use for the website.</p>
          <button className="primary" disabled={authBusy || !firebaseEnabled} onClick={login}>
            {authBusy ? "Opening Google..." : "Sign in with Google"}
          </button>
        </section>
      ) : null}

      {user ? (
        <form onSubmit={submit} className="form">
          <div className="top-actions">
            <select value={profileId} onChange={(event) => changeProfile(event.target.value)}>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
            <button type="button" className="ghost" disabled={authBusy} onClick={logout}>
              Sign out
            </button>
          </div>

          {captureError ? <StatusMessage kind="error">{captureError}</StatusMessage> : null}
          {loadingLibrary ? <StatusMessage kind="info">Loading categories and tags...</StatusMessage> : null}
          {message ? <StatusMessage kind={message.kind}>{message.text}</StatusMessage> : null}
          {duplicate ? (
            <div className="duplicate-warning">
              <strong>Already saved</strong>
              <span>This URL exists in the selected profile.</span>
              <label>
                <input
                  type="checkbox"
                  checked={allowDuplicate}
                  onChange={(event) => setAllowDuplicate(event.target.checked)}
                />
                Save another copy
              </label>
            </div>
          ) : null}

          {captured ? (
            <>
              <section className="page-card">
                {captured.image ? <img src={captured.image} alt="" /> : null}
                <div>
                  <div className="domain-row">
                    {captured.favicon ? <img src={captured.favicon} alt="" /> : null}
                    <span>{captured.domain}</span>
                  </div>
                  <p>{captured.url}</p>
                </div>
              </section>

              <label>
                Title
                <input value={title} onChange={(event) => setTitle(event.target.value)} />
              </label>

              <label>
                Description
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="No page description found"
                />
              </label>

              <label>
                Category
                <select value={category} onChange={(event) => setCategory(event.target.value)}>
                  {categories.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <section className="tag-section">
                <span>Tags</span>
                <div className="tag-list">
                  {tags.length ? (
                    tags.map((tag) => (
                      <label key={tag}>
                        <input
                          type="checkbox"
                          checked={selectedTags.includes(tag)}
                          onChange={(event) =>
                            setSelectedTags((current) =>
                              event.target.checked
                                ? [...current, tag]
                                : current.filter((item) => item !== tag),
                            )
                          }
                        />
                        {tag}
                      </label>
                    ))
                  ) : (
                    <p>No saved tags yet.</p>
                  )}
                </div>
              </section>

              <label>
                Personal note
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Why save this?"
                />
              </label>

              <button className="primary" disabled={saving || loadingLibrary || !captured}>
                {saving ? "Saving..." : duplicate && !allowDuplicate ? "Continue required" : "Save bookmark"}
              </button>
            </>
          ) : null}
        </form>
      ) : null}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
