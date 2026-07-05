import type { AppSettings, LinkItem, LocalCache, ProfilesCache, UserProfile } from "../types";
import { seedLinks } from "./seedData";
import { DEFAULT_SETTINGS, buildSettingsFromLinks, normalizeLinks, normalizeSettings } from "./syncUtils";

export const DEFAULT_PROFILE_ID = "ai";
export const DEFAULT_PROFILE_NAME = "AI";

const LEGACY_LINKS_KEY = "ai-link-archive:links:v1";
const CACHE_KEY_V2 = "ai-link-archive:cache:v2";
const CACHE_KEY = "ai-link-archive:cache:v3";
const PROFILES_KEY = "ai-link-archive:profiles:v1";

function cacheKey(userId?: string | null, profileId?: string | null) {
  if (userId && profileId) return `${CACHE_KEY}:${userId}:${profileId}`;
  if (userId) return `${CACHE_KEY}:${userId}:${DEFAULT_PROFILE_ID}`;
  return CACHE_KEY;
}

function legacyCacheKey(userId?: string | null) {
  return userId ? `${CACHE_KEY_V2}:${userId}` : CACHE_KEY_V2;
}

function profilesKey(userId: string) {
  return `${PROFILES_KEY}:${userId}`;
}

function readJson<T>(key: string): T | null {
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readLegacyLinks() {
  return normalizeLinks(readJson<LinkItem[]>(LEGACY_LINKS_KEY) ?? seedLinks);
}

type StoredLocalCache = Partial<Omit<LocalCache, "version">> & { version?: number };

function toLocalCache(
  cached: StoredLocalCache,
  userId?: string | null,
  profileId?: string | null,
): LocalCache | null {
  if (!Array.isArray(cached.links)) return null;

  const links = normalizeLinks(cached.links);
  return {
    version: 3,
    userId: userId ?? cached.userId,
    profileId: profileId ?? cached.profileId ?? (userId ? DEFAULT_PROFILE_ID : undefined),
    links,
    settings: normalizeSettings(cached.settings, links),
    remoteLinksUpdatedAt: cached.remoteLinksUpdatedAt ?? 0,
    remoteSettingsUpdatedAt: cached.remoteSettingsUpdatedAt ?? 0,
    savedAt: cached.savedAt ?? Date.now(),
  };
}

function readCachedLocalCache(userId?: string | null, profileId?: string | null): LocalCache | null {
  const cached = readJson<StoredLocalCache>(cacheKey(userId, profileId));
  if (cached?.version === 3) {
    return toLocalCache(cached, userId, profileId);
  }

  const isDefaultProfile = !profileId || profileId === DEFAULT_PROFILE_ID;
  if (isDefaultProfile) {
    const legacyCached = readJson<StoredLocalCache>(legacyCacheKey(userId));
    if (legacyCached?.version === 2) {
      return toLocalCache(legacyCached, userId, DEFAULT_PROFILE_ID);
    }
  }

  return null;
}

export function createLocalCache(
  links: LinkItem[],
  settings?: AppSettings,
  userId?: string | null,
  profileId?: string | null,
): LocalCache {
  const normalizedLinks = normalizeLinks(links);
  const normalizedSettings = normalizeSettings(settings, normalizedLinks);

  return {
    version: 3,
    userId: userId ?? undefined,
    profileId: profileId ?? (userId ? DEFAULT_PROFILE_ID : undefined),
    links: normalizedLinks,
    settings: normalizedSettings,
    remoteLinksUpdatedAt: 0,
    remoteSettingsUpdatedAt: 0,
    savedAt: Date.now(),
  };
}

export function createEmptyProfileCache(userId: string, profileId: string): LocalCache {
  return createLocalCache([], DEFAULT_SETTINGS, userId, profileId);
}

export function loadLocalCache(userId?: string | null, profileId?: string | null): LocalCache {
  const cached = readCachedLocalCache(userId, profileId);
  if (cached) return cached;

  if (userId && profileId && profileId !== DEFAULT_PROFILE_ID) {
    return createEmptyProfileCache(userId, profileId);
  }

  return createLocalCache(
    readLegacyLinks(),
    buildSettingsFromLinks(readLegacyLinks()),
    userId,
    profileId,
  );
}

export function loadFirebaseUserCache(userId: string, remoteExists: boolean): LocalCache {
  return loadFirebaseProfileCache(userId, DEFAULT_PROFILE_ID, remoteExists);
}

export function loadFirebaseProfileCache(
  userId: string,
  profileId: string,
  remoteExists: boolean,
): LocalCache {
  const userCache = readCachedLocalCache(userId, profileId);
  if (userCache) return userCache;

  if (remoteExists) {
    return createEmptyProfileCache(userId, profileId);
  }

  const genericCache = profileId === DEFAULT_PROFILE_ID ? readCachedLocalCache() : null;
  if (genericCache) {
    return createLocalCache(genericCache.links, genericCache.settings, userId, profileId);
  }

  return loadLocalCache(userId, profileId);
}

export function saveLocalCache(
  cache: LocalCache,
  userId = cache.userId,
  profileId = cache.profileId,
) {
  window.localStorage.setItem(
    cacheKey(userId, profileId),
    JSON.stringify({
      ...cache,
      userId: userId ?? undefined,
      profileId: profileId ?? (userId ? DEFAULT_PROFILE_ID : undefined),
      savedAt: Date.now(),
    }),
  );
}

export function saveLinksToCache(
  links: LinkItem[],
  settings: AppSettings = DEFAULT_SETTINGS,
  userId?: string | null,
  profileId?: string | null,
  remoteLinksUpdatedAt = 0,
  remoteSettingsUpdatedAt = 0,
) {
  saveLocalCache({
    version: 3,
    userId: userId ?? undefined,
    profileId: profileId ?? (userId ? DEFAULT_PROFILE_ID : undefined),
    links: normalizeLinks(links),
    settings: normalizeSettings(settings, links),
    remoteLinksUpdatedAt,
    remoteSettingsUpdatedAt,
    savedAt: Date.now(),
  });
}

export function loadLocalLinks(): LinkItem[] {
  return loadLocalCache().links;
}

export function saveLocalLinks(links: LinkItem[]) {
  saveLinksToCache(links);
}

export function createDefaultProfile(now = Date.now()): UserProfile {
  return {
    id: DEFAULT_PROFILE_ID,
    name: DEFAULT_PROFILE_NAME,
    createdAt: now,
    updatedAt: now,
  };
}

export function createProfile(name: string, existingIds: string[] = []): UserProfile {
  const now = Date.now();
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || `profile-${now}`;
  let id = base;
  let counter = 2;
  while (existingIds.includes(id)) {
    id = `${base}-${counter}`;
    counter += 1;
  }
  return {
    id,
    name: name.trim(),
    createdAt: now,
    updatedAt: now,
  };
}

export function loadProfilesCache(userId: string): ProfilesCache {
  const cached = readJson<Partial<ProfilesCache>>(profilesKey(userId));
  if (cached?.version === 1 && Array.isArray(cached.profiles) && cached.profiles.length) {
    const profiles = cached.profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      createdAt: profile.createdAt ?? Date.now(),
      updatedAt: profile.updatedAt ?? Date.now(),
    }));
    const activeProfileId = profiles.some((profile) => profile.id === cached.activeProfileId)
      ? cached.activeProfileId!
      : profiles[0].id;
    return {
      version: 1,
      userId,
      profiles,
      activeProfileId,
      savedAt: cached.savedAt ?? Date.now(),
    };
  }

  return {
    version: 1,
    userId,
    profiles: [createDefaultProfile()],
    activeProfileId: DEFAULT_PROFILE_ID,
    savedAt: Date.now(),
  };
}

export function saveProfilesCache(cache: ProfilesCache) {
  window.localStorage.setItem(
    profilesKey(cache.userId),
    JSON.stringify({ ...cache, savedAt: Date.now() }),
  );
}
