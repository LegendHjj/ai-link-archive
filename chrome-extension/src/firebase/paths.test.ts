import { describe, expect, it } from "vitest";

import { firestorePaths } from "./paths";

describe("firestorePaths", () => {
  it("matches the website profile-aware Firebase schema", () => {
    expect(firestorePaths("user-1", "ai")).toEqual({
      profileDoc: ["users", "user-1", "profiles", "ai"],
      profilesCollection: ["users", "user-1", "profiles"],
      linksCollection: ["users", "user-1", "profiles", "ai", "links"],
      settingsDoc: ["users", "user-1", "profiles", "ai", "settings", "app"],
      syncDoc: ["users", "user-1", "profiles", "ai", "meta", "sync"],
    });
  });
});
