import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";

import type { AppSettings, LinkDraft, LinkItem, LinkStatus, LocalCache, UserProfile } from "../types";
import {
  getDomain,
  inferSourceType,
  suggestedTags,
  titleFromUrl,
} from "../lib/bookmarkUtils";
import {
  fetchFirebaseLinkChanges,
  fetchFirebaseProfiles,
  fetchFirebaseSettings,
  fetchLegacyFirebaseLinks,
  fetchLegacyFirebaseSettings,
  firebaseEnabled,
  getLegacyFirebaseSyncState,
  getFirebaseAuth,
  getFirebaseSyncState,
  saveFirebaseLink,
  saveFirebaseLinks,
  saveFirebaseProfile,
  saveFirebaseSettings,
  softDeleteFirebaseLink,
} from "../lib/firebase";
import { mergeImportedLinks, settingsWithLinks } from "../lib/importExport";
import {
  DEFAULT_PROFILE_ID,
  createDefaultProfile,
  createEmptyProfileCache,
  createProfile,
  loadFirebaseProfileCache,
  loadLocalCache,
  loadProfilesCache,
  saveLocalCache,
  saveProfilesCache,
} from "../lib/localStore";
import { tryRemoteWrite } from "../lib/remoteWrite";
import {
  DEFAULT_SETTINGS,
  addManagedCategory,
  addManagedTags,
  applyRemoteLinkChanges,
  buildSettingsFromLinks,
  mergeSettings,
  normalizeSettings,
  removeManagedCategory,
  removeManagedTag,
  shouldFetchLinks,
  shouldFetchSettings,
} from "../lib/syncUtils";

function titleFromNote(notes: string) {
  return notes.trim().split(/\r?\n/)[0]?.slice(0, 88) || "Untitled note";
}

function maxUpdatedAt(links: LinkItem[]) {
  return links.reduce((max, link) => Math.max(max, link.updatedAt), 0);
}

function sameStringArray(left: string[], right: string[]) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function patchChangesLink(link: LinkItem, patch: Partial<LinkItem>) {
  return Object.entries(patch).some(([key, value]) => {
    const current = link[key as keyof LinkItem];
    if (Array.isArray(current) && Array.isArray(value)) {
      return !sameStringArray(current, value);
    }
    return current !== value;
  });
}

function createItem(draft: LinkDraft): LinkItem {
  const now = Date.now();
  const type = draft.type ?? (draft.url?.trim() ? "link" : "note");
  const url = type === "link" ? draft.url?.trim() ?? "" : "";
  const title = draft.title?.trim() || (type === "note" ? titleFromNote(draft.notes ?? "") : titleFromUrl(url));
  const category = draft.category?.trim() || "Uncategorized";

  return {
    id: crypto.randomUUID(),
    type,
    url,
    title,
    domain: getDomain(url),
    category,
    source: inferSourceType(url),
    tags: draft.tags?.length ? draft.tags : suggestedTags(url, title),
    notes: draft.notes ?? "",
    favorite: false,
    status: "unread",
    createdAt: now,
    updatedAt: now,
  };
}

function updateCache(
  userId: string | null | undefined,
  profileId: string | null | undefined,
  links: LinkItem[],
  settings: AppSettings,
  patch: Partial<Pick<LocalCache, "remoteLinksUpdatedAt" | "remoteSettingsUpdatedAt">> = {},
) {
  const current = loadLocalCache(userId, profileId);
  saveLocalCache({
    ...current,
    userId: userId ?? undefined,
    profileId: profileId ?? (userId ? DEFAULT_PROFILE_ID : undefined),
    links,
    settings,
    remoteLinksUpdatedAt: patch.remoteLinksUpdatedAt ?? current.remoteLinksUpdatedAt,
    remoteSettingsUpdatedAt:
      patch.remoteSettingsUpdatedAt ?? current.remoteSettingsUpdatedAt,
    savedAt: Date.now(),
  });
}

export function useLinks() {
  const initial = loadLocalCache();
  const [links, setLinks] = useState<LinkItem[]>(initial.links);
  const [settings, setSettings] = useState<AppSettings>(initial.settings);
  const [profiles, setProfiles] = useState<UserProfile[]>([createDefaultProfile()]);
  const [activeProfileId, setActiveProfileId] = useState(DEFAULT_PROFILE_ID);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!firebaseEnabled);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseEnabled) {
      setAuthReady(true);
      return;
    }

    const auth = getFirebaseAuth();
    if (!auth) return;
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (nextUser) {
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
      } else {
        setLinks([]);
        setSettings(initial.settings);
        setProfiles([createDefaultProfile()]);
        setActiveProfileId(DEFAULT_PROFILE_ID);
      }
    });
  }, []);

  useEffect(() => {
    if (!firebaseEnabled || !authReady || !user) return;
    let cancelled = false;
    const currentUser = user;
    const currentProfileId = activeProfileId;

    async function syncFromFirebase() {
      setSyncing(true);
      setSyncError(null);

      try {
        const remoteProfiles = await fetchFirebaseProfiles(currentUser.uid);
        let nextProfiles = remoteProfiles.length ? remoteProfiles : [createDefaultProfile()];
        if (!remoteProfiles.length) {
          await saveFirebaseProfile(currentUser.uid, nextProfiles[0]);
        }

        let nextActiveProfileId = currentProfileId;
        if (!nextProfiles.some((profile) => profile.id === nextActiveProfileId)) {
          nextActiveProfileId = nextProfiles[0].id;
        }

        saveProfilesCache({
          version: 1,
          userId: currentUser.uid,
          profiles: nextProfiles,
          activeProfileId: nextActiveProfileId,
          savedAt: Date.now(),
        });

        if (!cancelled) {
          setProfiles(nextProfiles);
          if (nextActiveProfileId !== currentProfileId) {
            setActiveProfileId(nextActiveProfileId);
          }
        }

        const legacyState =
          !remoteProfiles.length && nextActiveProfileId === DEFAULT_PROFILE_ID
            ? await getLegacyFirebaseSyncState(currentUser.uid)
            : null;
        if (legacyState?.linksUpdatedAt || legacyState?.settingsUpdatedAt) {
          const legacyLinks = await fetchLegacyFirebaseLinks(currentUser.uid);
          const legacySettings = await fetchLegacyFirebaseSettings(currentUser.uid);
          const nextLinks = applyRemoteLinkChanges([], legacyLinks);
          const nextSettings = normalizeSettings(
            legacySettings
              ? mergeSettings(buildSettingsFromLinks(nextLinks), legacySettings)
              : buildSettingsFromLinks(nextLinks),
            nextLinks,
          );

          await saveFirebaseSettings(currentUser.uid, nextActiveProfileId, nextSettings);
          await saveFirebaseLinks(currentUser.uid, nextActiveProfileId, nextLinks);

          const migratedCache = {
            ...createEmptyProfileCache(currentUser.uid, nextActiveProfileId),
            links: nextLinks,
            settings: nextSettings,
            remoteLinksUpdatedAt: maxUpdatedAt(nextLinks),
            remoteSettingsUpdatedAt: nextSettings.updatedAt,
            savedAt: Date.now(),
          };
          saveLocalCache(migratedCache);

          if (!cancelled) {
            setLinks(nextLinks);
            setSettings(nextSettings);
          }
          return;
        }

        const remoteState = await getFirebaseSyncState(
          currentUser.uid,
          nextActiveProfileId,
        );
        let cache = loadFirebaseProfileCache(
          currentUser.uid,
          nextActiveProfileId,
          Boolean(remoteState?.linksUpdatedAt || remoteState?.settingsUpdatedAt),
        );

        if (!remoteState || (remoteState.linksUpdatedAt === 0 && cache.links.length > 0)) {
          const firstSettings = normalizeSettings(
            mergeSettings(cache.settings, buildSettingsFromLinks(cache.links)),
            cache.links,
          );
          await saveFirebaseSettings(currentUser.uid, nextActiveProfileId, firstSettings);
          await saveFirebaseLinks(currentUser.uid, nextActiveProfileId, cache.links);

          const remoteLinksUpdatedAt = maxUpdatedAt(cache.links);
          cache = {
            ...cache,
            settings: firstSettings,
            remoteLinksUpdatedAt,
            remoteSettingsUpdatedAt: firstSettings.updatedAt,
          };
          saveLocalCache(cache);

          if (!cancelled) {
            setLinks(cache.links);
            setSettings(cache.settings);
          }
          return;
        }

        let nextLinks = cache.links;
        let nextSettings = cache.settings;

        if (shouldFetchLinks(cache, remoteState)) {
          const changes = await fetchFirebaseLinkChanges(
            currentUser.uid,
            nextActiveProfileId,
            cache.remoteLinksUpdatedAt,
          );
          nextLinks = applyRemoteLinkChanges(nextLinks, changes);
        }

        if (shouldFetchSettings(cache, remoteState)) {
          const remoteSettings = await fetchFirebaseSettings(
            currentUser.uid,
            nextActiveProfileId,
          );
          if (remoteSettings) {
            nextSettings = normalizeSettings(mergeSettings(nextSettings, remoteSettings), nextLinks);
          }
        }

        cache = {
          ...cache,
          links: nextLinks,
          settings: nextSettings,
          remoteLinksUpdatedAt: remoteState.linksUpdatedAt,
          remoteSettingsUpdatedAt: remoteState.settingsUpdatedAt,
          savedAt: Date.now(),
        };
        saveLocalCache(cache);

        if (!cancelled) {
          setLinks(nextLinks);
          setSettings(nextSettings);
        }
      } catch (error) {
        if (!cancelled) {
          setSyncError(error instanceof Error ? error.message : "Firebase sync failed");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setSyncing(false);
        }
      }
    }

    void syncFromFirebase();
    return () => {
      cancelled = true;
    };
  }, [activeProfileId, authReady, user]);

  useEffect(() => {
    if (firebaseEnabled) return;
    updateCache(null, undefined, links, settings);
  }, [links, settings]);

  async function persistLinks(nextLinks: LinkItem[], changedLinks: LinkItem[]) {
    setLinks(nextLinks);
    updateCache(user?.uid, activeProfileId, nextLinks, settings);

    if (firebaseEnabled && user && changedLinks.length) {
      const synced = await tryRemoteWrite(async () => {
        await saveFirebaseLinks(user.uid, activeProfileId, changedLinks);
      }, setSyncError);
      if (synced) {
        updateCache(user.uid, activeProfileId, nextLinks, settings, {
          remoteLinksUpdatedAt: maxUpdatedAt(changedLinks),
        });
        setSyncError(null);
      }
    } else {
      setSyncError(null);
    }
  }

  async function persistRemoteSettings(
    nextSettings: AppSettings,
    nextLinks: LinkItem[],
    changedLinks: LinkItem[] = [],
  ) {
    if (!firebaseEnabled || !user) {
      setSyncError(null);
      return;
    }

    const synced = await tryRemoteWrite(async () => {
      await Promise.all([
        saveFirebaseSettings(user.uid, activeProfileId, nextSettings),
        changedLinks.length
          ? saveFirebaseLinks(user.uid, activeProfileId, changedLinks)
          : Promise.resolve(),
      ]);
    }, setSyncError);

    if (synced) {
      updateCache(user.uid, activeProfileId, nextLinks, nextSettings, {
        remoteLinksUpdatedAt: changedLinks.length
          ? maxUpdatedAt(changedLinks)
          : undefined,
        remoteSettingsUpdatedAt: nextSettings.updatedAt,
      });
      setSyncError(null);
    }
  }

  async function persistSettings(
    nextSettings: AppSettings,
    nextLinks = links,
    changedLinks: LinkItem[] = [],
  ) {
    setSettings(nextSettings);
    setLinks(nextLinks);
    updateCache(user?.uid, activeProfileId, nextLinks, nextSettings);

    await persistRemoteSettings(nextSettings, nextLinks, changedLinks);
  }

  async function addLink(draft: LinkDraft) {
    const item = createItem(draft);
    const nextLinks = [item, ...links];
    const nextSettings = addManagedTags(
      {
        ...settings,
        categories: settings.categories.includes(item.category)
          ? settings.categories
          : [...settings.categories, item.category],
      },
      item.tags,
    );
    setSettings(nextSettings);
    updateCache(user?.uid, activeProfileId, nextLinks, nextSettings);
    setLinks(nextLinks);

    if (firebaseEnabled && user) {
      const synced = await tryRemoteWrite(async () => {
        await Promise.all([
          saveFirebaseLink(user.uid, activeProfileId, item),
          saveFirebaseSettings(user.uid, activeProfileId, nextSettings),
        ]);
      }, setSyncError);

      if (synced) {
        updateCache(user.uid, activeProfileId, nextLinks, nextSettings, {
          remoteLinksUpdatedAt: item.updatedAt,
          remoteSettingsUpdatedAt: nextSettings.updatedAt,
        });
        setSyncError(null);
      }
    } else {
      setSyncError(null);
    }
    return item;
  }

  async function addMany(urls: string[]) {
    const existing = new Set(links.filter((link) => link.type === "link").map((link) => link.url));
    const created = urls
      .filter((url) => !existing.has(url))
      .map((url) => createItem({ type: "link", url }));
    const nextLinks = [...created, ...links];
    const nextSettings = created.reduce(
      (current, item) => addManagedTags(current, item.tags),
      settings,
    );
    await persistSettings(nextSettings, nextLinks, created);
    return created.length;
  }

  async function importLinks(imported: LinkItem[]) {
    if (!imported.length) return 0;
    const nextLinks = mergeImportedLinks(links, imported);
    const changedLinks = nextLinks.filter((link) => {
      const current = links.find((item) => item.id === link.id);
      return !current || link.updatedAt > current.updatedAt;
    });
    if (!changedLinks.length && nextLinks.length === links.length) return 0;

    const nextSettings = settingsWithLinks(settings, nextLinks);
    await persistSettings(nextSettings, nextLinks, changedLinks);
    return changedLinks.length;
  }

  async function updateLink(id: string, patch: Partial<LinkItem>) {
    const updatedAt = Date.now();
    let changed: LinkItem | undefined;
    const next = links.map((link) => {
      if (link.id !== id) return link;
      if (!patchChangesLink(link, patch)) return link;
      changed = { ...link, ...patch, updatedAt };
      return changed;
    });
    if (!changed) return;
    await persistLinks(next, changed ? [changed] : []);
  }

  async function removeLinks(ids: string[]) {
    const idSet = new Set(ids);
    const removed = links
      .filter((link) => idSet.has(link.id))
      .map((link) => ({ ...link, deletedAt: Date.now(), updatedAt: Date.now() }));
    const next = links.filter((link) => !idSet.has(link.id));
    setLinks(next);
    updateCache(user?.uid, activeProfileId, next, settings);

    if (firebaseEnabled && user) {
      const synced = await tryRemoteWrite(async () => {
        await Promise.all(
          removed.map((link) => softDeleteFirebaseLink(user.uid, activeProfileId, link)),
        );
      }, setSyncError);
      if (synced) {
        updateCache(user.uid, activeProfileId, next, settings, {
          remoteLinksUpdatedAt: maxUpdatedAt(removed),
        });
        setSyncError(null);
      }
    } else {
      setSyncError(null);
    }
  }

  async function bulkStatus(ids: string[], status: LinkStatus) {
    const idSet = new Set(ids);
    const now = Date.now();
    const changed: LinkItem[] = [];
    const next = links.map((link) => {
      if (!idSet.has(link.id)) return link;
      const updated = { ...link, status, updatedAt: now };
      changed.push(updated);
      return updated;
    });
    await persistLinks(next, changed);
  }

  async function addCategory(category: string) {
    await persistSettings(addManagedCategory(settings, category));
  }

  async function deleteCategory(category: string) {
    const result = removeManagedCategory(settings, links, category);
    await persistSettings(result.settings, result.links, result.changedLinks);
  }

  async function reorderCategory(category: string, direction: "up" | "down") {
    const index = settings.categories.indexOf(category);
    if (index === -1) return;
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= settings.categories.length) return;

    const nextCategories = [...settings.categories];
    nextCategories[index] = nextCategories[nextIndex];
    nextCategories[nextIndex] = category;

    await persistSettings({
      ...settings,
      categories: nextCategories,
      updatedAt: Date.now(),
    });
  }

  async function addTag(tag: string) {
    await persistSettings(addManagedTags(settings, [tag]));
  }

  async function deleteTag(tag: string) {
    const result = removeManagedTag(settings, links, tag);
    await persistSettings(result.settings, result.links, result.changedLinks);
  }

  function switchProfile(profileId: string) {
    const profile = profiles.find((item) => item.id === profileId);
    if (!profile || profile.id === activeProfileId) return;

    if (user) {
      saveProfilesCache({
        version: 1,
        userId: user.uid,
        profiles,
        activeProfileId: profile.id,
        savedAt: Date.now(),
      });
    }

    const cache = loadLocalCache(user?.uid, profile.id);
    setActiveProfileId(profile.id);
    setLinks(cache.links);
    setSettings(cache.settings);
    setSyncError(null);
  }

  async function addProfile(name: string) {
    const profile = createProfile(name, profiles.map((item) => item.id));
    const nextProfiles = [...profiles, profile];
    setProfiles(nextProfiles);
    setActiveProfileId(profile.id);
    setLinks([]);
    setSettings(DEFAULT_SETTINGS);

    if (user) {
      saveProfilesCache({
        version: 1,
        userId: user.uid,
        profiles: nextProfiles,
        activeProfileId: profile.id,
        savedAt: Date.now(),
      });
      saveLocalCache(createEmptyProfileCache(user.uid, profile.id));
      const synced = await tryRemoteWrite(async () => {
        await Promise.all([
          saveFirebaseProfile(user.uid, profile),
          saveFirebaseSettings(user.uid, profile.id, DEFAULT_SETTINGS),
        ]);
      }, setSyncError);
      if (synced) setSyncError(null);
    }
  }

  const mode = useMemo(() => {
    if (!firebaseEnabled) return "Local mode";
    if (!authReady) return "Checking session";
    if (!user) return "Login required";
    return syncing ? "Syncing" : "Cached + Firebase";
  }, [authReady, syncing, user]);

  return {
    links,
    settings,
    loading,
    syncing,
    authReady,
    mode,
    syncError,
    user,
    profiles,
    activeProfileId,
    addLink,
    addMany,
    importLinks,
    updateLink,
    removeLinks,
    bulkStatus,
    addCategory,
    deleteCategory,
    reorderCategory,
    addTag,
    deleteTag,
    switchProfile,
    addProfile,
  };
}
