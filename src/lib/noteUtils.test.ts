import { describe, expect, it } from "vitest";

import { filterLibraryItems, notePreview } from "./noteUtils";
import type { LinkItem } from "../types";

function item(overrides: Partial<LinkItem>): LinkItem {
  return {
    id: "item-1",
    type: "link",
    url: "https://example.com",
    title: "Example",
    domain: "example.com",
    category: "Research",
    source: "Web",
    tags: [],
    notes: "",
    favorite: false,
    status: "unread",
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  };
}

describe("filterLibraryItems", () => {
  const note = item({
    id: "note",
    type: "note",
    url: "",
    domain: "",
    title: "Launch ideas",
    notes: "Try a smaller onboarding flow",
    tags: ["product"],
    updatedAt: 300,
  });
  const legacyNote = item({
    id: "legacy-note",
    url: "",
    domain: "",
    title: "Meeting recap",
    notes: "Follow up with the design team",
    updatedAt: 200,
  });
  const link = item({ id: "link", title: "React docs", updatedAt: 400 });

  it("shows explicit and legacy notes in the notes collection", () => {
    const result = filterLibraryItems([link, legacyNote, note], {
      content: "notes",
      category: "All Items",
      status: "all",
      query: "",
      tag: null,
    });

    expect(result.map((entry) => entry.id)).toEqual(["note", "legacy-note"]);
  });

  it("searches note body text and keeps newest matching items first", () => {
    const result = filterLibraryItems([note, legacyNote, link], {
      content: "all",
      category: "All Items",
      status: "all",
      query: "design team",
      tag: null,
    });

    expect(result.map((entry) => entry.id)).toEqual(["legacy-note"]);
  });
});

describe("notePreview", () => {
  it("does not repeat an auto-derived title as the first body line", () => {
    const note = item({
      type: "note",
      url: "",
      title: "Plan the launch",
      notes: "Plan the launch\nStart with the customer story.",
    });

    expect(notePreview(note)).toBe("Start with the customer story.");
  });

  it("provides a helpful prompt for an empty note", () => {
    expect(notePreview(item({ type: "note", url: "", notes: "" }))).toBe(
      "Add some detail to this note",
    );
  });
});
