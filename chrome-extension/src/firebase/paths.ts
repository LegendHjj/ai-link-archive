export function firestorePaths(userId: string, profileId: string) {
  return {
    profileDoc: ["users", userId, "profiles", profileId],
    profilesCollection: ["users", userId, "profiles"],
    linksCollection: ["users", userId, "profiles", profileId, "links"],
    settingsDoc: ["users", userId, "profiles", profileId, "settings", "app"],
    syncDoc: ["users", userId, "profiles", profileId, "meta", "sync"],
  };
}
