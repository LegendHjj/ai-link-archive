import { beforeEach, describe, expect, it } from "vitest";

import type { LocalCache } from "../types";
import {
  createLocalCache,
  loadFirebaseProfileCache,
  loadFirebaseUserCache,
  loadLocalCache,
  saveLocalCache,
} from "./localStore";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}

const localStorage = new MemoryStorage();

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage },
  });
});

function cacheWithTitle(title: string): LocalCache {
  return createLocalCache([
    {
      id: "local-only",
      type: "link",
      url: "https://example.com/local-only",
      title,
      domain: "example.com",
      category: "Personal",
      source: "Web",
      tags: ["local"],
      notes: "",
      favorite: false,
      status: "unread",
      createdAt: 100,
      updatedAt: 100,
    },
  ]);
}

describe("loadLocalCache", () => {
  it("uses the generic local cache as the first user cache before Firebase migration", () => {
    saveLocalCache(cacheWithTitle("Local record to migrate"));

    expect(loadFirebaseUserCache("firebase-user-1", false).links).toMatchObject([
      { id: "local-only", title: "Local record to migrate" },
    ]);
  });

  it("starts empty for a new browser when Firebase already has remote data", () => {
    expect(loadFirebaseUserCache("firebase-user-1", true).links).toEqual([]);
  });

  it("keeps the normal anonymous local cache behavior unchanged", () => {
    expect(loadLocalCache().links.length).toBeGreaterThan(0);
  });

  it("keeps profile caches isolated for the same Firebase user", () => {
    saveLocalCache(cacheWithTitle("AI record"), "firebase-user-1", "ai");
    saveLocalCache(cacheWithTitle("English record"), "firebase-user-1", "english");

    expect(loadLocalCache("firebase-user-1", "ai").links).toMatchObject([
      { title: "AI record" },
    ]);
    expect(loadLocalCache("firebase-user-1", "english").links).toMatchObject([
      { title: "English record" },
    ]);
  });

  it("starts a new Firebase profile with empty links, categories, and tags", () => {
    const cache = loadFirebaseProfileCache("firebase-user-1", "english", true);

    expect(cache.links).toEqual([]);
    expect(cache.settings.categories).toEqual([]);
    expect(cache.settings.tags).toEqual([]);
  });
});
