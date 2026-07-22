import { describe, expect, it } from "vitest";

import type { LinkItem } from "../types";
import {
  mergeImportedLinks,
  parseExportedLinksJson,
  settingsWithLinks,
} from "./importExport";

function link(overrides: Partial<LinkItem> = {}): LinkItem {
  return {
    id: overrides.id ?? "link-1",
    type: overrides.type ?? "link",
    url: overrides.url ?? "https://example.com",
    title: overrides.title ?? "Example",
    domain: overrides.domain ?? "example.com",
    category: overrides.category ?? "Tools",
    source: overrides.source ?? "Web",
    tags: overrides.tags ?? ["tools"],
    notes: overrides.notes ?? "",
    favorite: overrides.favorite ?? false,
    status: overrides.status ?? "unread",
    createdAt: overrides.createdAt ?? 100,
    updatedAt: overrides.updatedAt ?? 100,
  };
}

describe("parseExportedLinksJson", () => {
  it("reads the current exported JSON array format", () => {
    const parsed = parseExportedLinksJson(JSON.stringify([link({ category: "Research" })]));

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      id: "link-1",
      title: "Example",
      category: "Research",
      url: "https://example.com",
    });
  });

  it("ignores text that is not an exported links JSON payload", () => {
    expect(parseExportedLinksJson("https://example.com")).toEqual([]);
  });
});

describe("mergeImportedLinks", () => {
  it("imports new exported records without duplicating existing ids or urls", () => {
    const existing = link({ id: "old", url: "https://same.example", updatedAt: 200 });
    const newerSameId = link({ id: "old", title: "New title", url: "https://same.example", updatedAt: 300 });
    const duplicateUrl = link({ id: "different", url: "https://same.example", updatedAt: 400 });
    const fresh = link({ id: "fresh", url: "https://fresh.example", createdAt: 500 });

    expect(mergeImportedLinks([existing], [newerSameId, duplicateUrl, fresh])).toEqual([
      fresh,
      newerSameId,
    ]);
  });
});

describe("settingsWithLinks", () => {
  it("keeps imported categories and tags available after import", () => {
    const settings = settingsWithLinks(
      { version: 1, categories: ["Tools"], tags: ["tools"], updatedAt: 1 },
      [link({ category: "Research", tags: ["paper"] })],
    );

    expect(settings.categories).toEqual(["Tools", "Research"]);
    expect(settings.tags).toEqual(["paper", "tools"]);
  });
});
