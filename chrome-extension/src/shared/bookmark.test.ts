import { describe, expect, it } from "vitest";

import {
  DEFAULT_PROFILE_ID,
  buildLinkItem,
  findActiveProfileId,
  findDuplicateLink,
  mergeDescriptionAndNote,
} from "./bookmark";

describe("buildLinkItem", () => {
  it("creates a website-compatible LinkItem record for a captured page", () => {
    expect(
      buildLinkItem(
        {
          url: "https://github.com/openai/openai-cookbook",
          title: "OpenAI Cookbook",
          description: "Examples and guides.",
          category: "Projects",
          tags: ["open-source", "llm"],
          note: "Use this later.",
        },
        { id: "fixed-id", now: 1234 },
      ),
    ).toEqual({
      id: "fixed-id",
      type: "link",
      url: "https://github.com/openai/openai-cookbook",
      title: "OpenAI Cookbook",
      domain: "github.com",
      category: "Projects",
      source: "GitHub",
      tags: ["llm", "open-source"],
      notes: "Examples and guides.\n\nUse this later.",
      favorite: false,
      status: "unread",
      createdAt: 1234,
      updatedAt: 1234,
    });
  });
});

describe("mergeDescriptionAndNote", () => {
  it("uses the existing notes field without losing either user-editable text value", () => {
    expect(mergeDescriptionAndNote(" Summary. ", " My note. ")).toBe(
      "Summary.\n\nMy note.",
    );
    expect(mergeDescriptionAndNote(" Summary. ", "")).toBe("Summary.");
    expect(mergeDescriptionAndNote("", " My note. ")).toBe("My note.");
  });
});

describe("findDuplicateLink", () => {
  it("ignores deleted tombstones when checking duplicates", () => {
    expect(
      findDuplicateLink("https://example.com/a", [
        { id: "deleted", url: "https://example.com/a", deletedAt: 10 },
        { id: "live", url: "https://example.com/a" },
      ]),
    ).toEqual({ id: "live", url: "https://example.com/a" });
  });
});

describe("findActiveProfileId", () => {
  it("prefers a stored profile when it still exists and otherwise falls back safely", () => {
    const profiles = [
      { id: "ai", name: "AI" },
      { id: "research", name: "Research" },
    ];

    expect(findActiveProfileId(profiles, "research")).toBe("research");
    expect(findActiveProfileId(profiles, "missing")).toBe(DEFAULT_PROFILE_ID);
    expect(findActiveProfileId([], "missing")).toBe(DEFAULT_PROFILE_ID);
  });
});
