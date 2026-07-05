import { describe, expect, it } from "vitest";

import {
  cleanTagInput,
  inferCategory,
  inferSourceType,
  parseBulkLinks,
} from "./bookmarkUtils";

describe("parseBulkLinks", () => {
  it("extracts unique http links from pasted text and ignores invalid lines", () => {
    const input = `
      https://openai.com/research
      not a link
      https://github.com/karpathy/llm.c
      https://openai.com/research
      www.youtube.com/watch?v=abc123
    `;

    expect(parseBulkLinks(input)).toEqual([
      "https://openai.com/research",
      "https://github.com/karpathy/llm.c",
      "https://www.youtube.com/watch?v=abc123",
    ]);
  });
});

describe("inferCategory", () => {
  it("maps common AI resource domains and titles to the MVP taxonomy", () => {
    expect(inferCategory("https://arxiv.org/abs/2401.00001", "")).toBe(
      "Research",
    );
    expect(inferCategory("https://youtube.com/watch?v=1", "")).toBe(
      "YouTube",
    );
    expect(inferCategory("https://github.com/microsoft/autogen", "")).toBe(
      "Projects",
    );
    expect(inferCategory("https://example.com", "Claude model release")).toBe(
      "Models",
    );
  });
});

describe("inferSourceType", () => {
  it("detects source type from URL", () => {
    expect(inferSourceType("https://x.com/karakeep_app")).toBe("X");
    expect(inferSourceType("https://github.com/openai/openai-cookbook")).toBe(
      "GitHub",
    );
    expect(inferSourceType("https://youtube.com/watch?v=1")).toBe("YouTube");
    expect(inferSourceType("https://openai.com")).toBe("Web");
  });
});

describe("cleanTagInput", () => {
  it("normalizes comma-separated tags and removes duplicates", () => {
    expect(cleanTagInput(" LLM, agents, llm, vector db ")).toEqual([
      "llm",
      "agents",
      "vector-db",
    ]);
  });
});
