import { describe, expect, it } from "vitest";

import type { AppSettings, LinkItem, LocalCache, RemoteSyncState } from "../types";
import {
  DEFAULT_SETTINGS,
  applyRemoteLinkChanges,
  buildSettingsFromLinks,
  mergeSettings,
  shouldFetchLinks,
  shouldFetchSettings,
} from "./syncUtils";

function link(overrides: Partial<LinkItem>): LinkItem {
  const now = overrides.updatedAt ?? 100;
  return {
    id: overrides.id ?? "link-1",
    type: overrides.type ?? "link",
    url: overrides.url ?? "https://example.com",
    title: overrides.title ?? "Example",
    domain: overrides.domain ?? "example.com",
    category: overrides.category ?? "Tools",
    source: overrides.source ?? "Web",
    tags: overrides.tags ?? ["ai", "tools"],
    notes: overrides.notes ?? "",
    favorite: overrides.favorite ?? false,
    status: overrides.status ?? "unread",
    createdAt: overrides.createdAt ?? now,
    updatedAt: now,
    deletedAt: overrides.deletedAt,
  };
}

function cache(overrides: Partial<LocalCache> = {}): LocalCache {
  return {
    version: 3,
    links: [],
    settings: DEFAULT_SETTINGS,
    remoteLinksUpdatedAt: 0,
    remoteSettingsUpdatedAt: 0,
    savedAt: 0,
    ...overrides,
  };
}

describe("sync metadata checks", () => {
  it("fetches links only when Firebase metadata is newer than the local cache", () => {
    const remote: RemoteSyncState = {
      linksUpdatedAt: 500,
      settingsUpdatedAt: 100,
      updatedAt: 500,
    };

    expect(shouldFetchLinks(cache({ remoteLinksUpdatedAt: 400 }), remote)).toBe(true);
    expect(shouldFetchLinks(cache({ remoteLinksUpdatedAt: 500 }), remote)).toBe(false);
  });

  it("fetches settings only when the settings metadata changed", () => {
    const remote: RemoteSyncState = {
      linksUpdatedAt: 500,
      settingsUpdatedAt: 250,
      updatedAt: 500,
    };

    expect(shouldFetchSettings(cache({ remoteSettingsUpdatedAt: 200 }), remote)).toBe(true);
    expect(shouldFetchSettings(cache({ remoteSettingsUpdatedAt: 250 }), remote)).toBe(false);
  });
});

describe("applyRemoteLinkChanges", () => {
  it("upserts newer remote records and keeps newer local records", () => {
    const localNewer = link({ id: "same", title: "Local", updatedAt: 300 });
    const remoteOlder = link({ id: "same", title: "Remote", updatedAt: 200 });
    const remoteNew = link({ id: "new", title: "New remote", updatedAt: 400 });

    expect(applyRemoteLinkChanges([localNewer], [remoteOlder, remoteNew])).toEqual([
      remoteNew,
      localNewer,
    ]);
  });

  it("removes records when a remote tombstone is newer", () => {
    const local = link({ id: "dead", updatedAt: 200 });
    const tombstone = link({ id: "dead", updatedAt: 300, deletedAt: 300 });

    expect(applyRemoteLinkChanges([local], [tombstone])).toEqual([]);
  });
});

describe("settings helpers", () => {
  it("builds categories and tags from existing links for first migration", () => {
    const settings = buildSettingsFromLinks([
      link({ category: "Research", tags: ["paper", "llm"] }),
      link({ type: "note", url: "", domain: "Note", source: "Note", category: "Personal", tags: ["idea"] }),
    ]);

    expect(settings.categories).toContain("Research");
    expect(settings.categories).toContain("Personal");
    expect(settings.tags).toEqual(expect.arrayContaining(["idea", "llm", "paper"]));
  });

  it("merges remote settings without losing locally discovered tags", () => {
    const local: AppSettings = {
      categories: ["Tools"],
      tags: ["local-tag"],
      updatedAt: 100,
      version: 1,
    };
    const remote: AppSettings = {
      categories: ["Research"],
      tags: ["remote-tag"],
      updatedAt: 200,
      version: 1,
    };

    expect(mergeSettings(local, remote)).toEqual({
      categories: ["Research"],
      tags: ["local-tag", "remote-tag"],
      updatedAt: 200,
      version: 1,
    });
  });
});
