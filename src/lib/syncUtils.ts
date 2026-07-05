import type { AppSettings, LinkItem, LocalCache, RemoteSyncState } from "../types";
import { cleanTagInput } from "./bookmarkUtils";

const INITIAL_SETTINGS_UPDATED_AT = 1;

export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  categories: [],
  tags: [],
  updatedAt: INITIAL_SETTINGS_UPDATED_AT,
};

function uniqueSorted(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function buildSettingsFromLinks(links: LinkItem[]): AppSettings {
  const categories = uniqueSorted([
    ...links.map((link) => link.category),
  ]);
  const tags = uniqueSorted(links.flatMap((link) => link.tags));

  return {
    ...DEFAULT_SETTINGS,
    categories,
    tags,
    updatedAt: Math.max(
      DEFAULT_SETTINGS.updatedAt,
      ...links.map((link) => link.updatedAt),
    ),
  };
}

export function mergeSettings(local: AppSettings, remote: AppSettings): AppSettings {
  const winner = remote.updatedAt >= local.updatedAt ? remote : local;
  return {
    version: 1,
    categories: uniqueSorted(winner.categories),
    tags: uniqueSorted([...local.tags, ...remote.tags]),
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
  };
}

export function normalizeSettings(settings?: Partial<AppSettings>, links: LinkItem[] = []) {
  const discovered = buildSettingsFromLinks(links);
  if (!settings) return discovered;

  return mergeSettings(discovered, {
    version: 1,
    categories: settings.categories ?? discovered.categories,
    tags: settings.tags ?? discovered.tags,
    updatedAt: settings.updatedAt ?? discovered.updatedAt,
  });
}

export function shouldFetchLinks(cache: LocalCache, remote: RemoteSyncState | null) {
  return Boolean(remote && remote.linksUpdatedAt > cache.remoteLinksUpdatedAt);
}

export function shouldFetchSettings(cache: LocalCache, remote: RemoteSyncState | null) {
  return Boolean(remote && remote.settingsUpdatedAt > cache.remoteSettingsUpdatedAt);
}

export function applyRemoteLinkChanges(localLinks: LinkItem[], remoteChanges: LinkItem[]) {
  const byId = new Map(localLinks.map((link) => [link.id, link]));

  for (const remote of remoteChanges) {
    const local = byId.get(remote.id);
    if (local && local.updatedAt > remote.updatedAt) continue;
    if (remote.deletedAt) {
      byId.delete(remote.id);
      continue;
    }
    byId.set(remote.id, normalizeLinkItem(remote));
  }

  return [...byId.values()]
    .filter((link) => !link.deletedAt)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function normalizeLinkItem(link: LinkItem): LinkItem {
  const type = link.type ?? (link.url ? "link" : "note");
  return {
    ...link,
    type,
    url: link.url ?? "",
    domain: link.domain || (type === "note" ? "Note" : link.url),
    source: link.source || (type === "note" ? "Note" : "Web"),
    tags: uniqueSorted(link.tags ?? []),
    notes: link.notes ?? "",
  };
}

export function normalizeLinks(links: LinkItem[]) {
  return links.map(normalizeLinkItem).filter((link) => !link.deletedAt);
}

export function addManagedTags(settings: AppSettings, tags: string[]) {
  const cleaned = tags.flatMap((tag) => cleanTagInput(tag));
  if (!cleaned.length) return settings;
  return {
    ...settings,
    tags: uniqueSorted([...settings.tags, ...cleaned]),
    updatedAt: Date.now(),
  };
}

export function addManagedCategory(settings: AppSettings, category: string) {
  const trimmed = category.trim();
  if (!trimmed || settings.categories.includes(trimmed)) return settings;
  return {
    ...settings,
    categories: uniqueSorted([...settings.categories, trimmed]),
    updatedAt: Date.now(),
  };
}

export function removeManagedCategory(
  settings: AppSettings,
  links: LinkItem[],
  category: string,
) {
  const categories = settings.categories.filter((item) => item !== category);
  const fallback = categories[0] ?? "Uncategorized";
  const now = Date.now();
  const nextLinks = links.map((link) =>
    link.category === category ? { ...link, category: fallback, updatedAt: now } : link,
  );

  return {
    settings: {
      ...settings,
      categories: nextLinks.some((link) => link.category === fallback)
        ? uniqueSorted([...categories, fallback])
        : categories,
      updatedAt: now,
    },
    links: nextLinks,
    changedLinks: nextLinks.filter((link) => link.category === fallback && links.some((old) => old.id === link.id && old.category === category)),
  };
}

export function removeManagedTag(settings: AppSettings, links: LinkItem[], tag: string) {
  const now = Date.now();
  const nextLinks = links.map((link) =>
    link.tags.includes(tag)
      ? { ...link, tags: link.tags.filter((item) => item !== tag), updatedAt: now }
      : link,
  );

  return {
    settings: {
      ...settings,
      tags: settings.tags.filter((item) => item !== tag),
      updatedAt: now,
    },
    links: nextLinks,
    changedLinks: nextLinks.filter((link) =>
      links.some((old) => old.id === link.id && old.tags.includes(tag)),
    ),
  };
}
