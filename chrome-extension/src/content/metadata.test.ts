import { describe, expect, it } from "vitest";

import { chooseDescription } from "./metadata";

describe("chooseDescription", () => {
  it("prefers Open Graph description before regular meta and visible paragraphs", () => {
    expect(
      chooseDescription({
        ogDescription: "OG summary",
        metaDescription: "Meta summary",
        firstParagraph: "Paragraph summary",
      }),
    ).toBe("OG summary");
  });

  it("falls back through meta description, useful paragraph, then empty text", () => {
    expect(chooseDescription({ metaDescription: "Meta summary" })).toBe(
      "Meta summary",
    );
    expect(chooseDescription({ firstParagraph: "Useful paragraph." })).toBe(
      "Useful paragraph.",
    );
    expect(chooseDescription({ firstParagraph: "Cookie settings" })).toBe("");
  });
});
