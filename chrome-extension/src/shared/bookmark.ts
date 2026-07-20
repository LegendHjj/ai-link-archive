import type {
  AppSettings,
  DuplicateCandidate,
  LinkInput,
  LinkItem,
  SourceType,
  UserProfile,
} from "./types";

export const DEFAULT_PROFILE_ID = "ai";
export const DEFAULT_PROFILE_NAME = "AI";
export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  categories: [],
  tags: [],
  updatedAt: 1,
};

function toUrl(raw: string): URL | null {
  const withProtocol = raw.startsWith("www.") ? `https://${raw}` : raw;
  try {
    return new URL(withProtocol);
  } catch {
    return null;
  }
}

export function getDomain(url: string): string {
  if (!url.trim()) return "Note";
  return toUrl(url)?.hostname.replace(/^www\./, "") ?? url;
}

export function inferSourceType(url: string): SourceType {
  if (!url.trim()) return "Note";
  const domain = getDomain(url);
  if (domain.includes("github.com")) return "GitHub";
  if (domain.includes("youtube.com") || domain.includes("youtu.be")) {
    return "YouTube";
  }
  if (domain === "x.com" || domain === "twitter.com") return "X";
  if (domain.includes("arxiv.org") || domain.includes("openreview.net")) {
    return "Paper";
  }
  if (domain.includes("docs.") || domain.includes("readthedocs")) {
    return "Docs";
  }
  if (domain.includes("notion.site") || domain.includes("notion.so")) {
    return "Notion";
  }
  return "Web";
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function mergeDescriptionAndNote(description: string, note: string) {
  return [description.trim(), note.trim()].filter(Boolean).join("\n\n");
}

export function buildLinkItem(
  input: LinkInput,
  options: { id?: string; now?: number } = {},
): LinkItem {
  const now = options.now ?? Date.now();
  const url = input.url.trim();
  const title = input.title.trim() || url;
  return {
    id: options.id ?? crypto.randomUUID(),
    type: "link",
    url,
    title,
    domain: getDomain(url),
    category: input.category.trim() || "Uncategorized",
    source: inferSourceType(url),
    tags: uniqueSorted(input.tags),
    notes: mergeDescriptionAndNote(input.description, input.note),
    favorite: false,
    status: "unread",
    createdAt: now,
    updatedAt: now,
  };
}

export function findDuplicateLink(
  url: string,
  candidates: DuplicateCandidate[],
) {
  return candidates.find((candidate) => candidate.url === url && !candidate.deletedAt) ?? null;
}

export function findActiveProfileId(
  profiles: Array<Pick<UserProfile, "id">>,
  storedProfileId?: string | null,
) {
  if (storedProfileId && profiles.some((profile) => profile.id === storedProfileId)) {
    return storedProfileId;
  }
  if (profiles.some((profile) => profile.id === DEFAULT_PROFILE_ID)) {
    return DEFAULT_PROFILE_ID;
  }
  return profiles[0]?.id ?? DEFAULT_PROFILE_ID;
}

export function createDefaultProfile(now = Date.now()): UserProfile {
  return {
    id: DEFAULT_PROFILE_ID,
    name: DEFAULT_PROFILE_NAME,
    createdAt: now,
    updatedAt: now,
  };
}

export function mergeSettings(settings: AppSettings | null, link: LinkItem): AppSettings {
  const current = settings ?? DEFAULT_SETTINGS;
  const categories = uniqueSorted([...current.categories, link.category]);
  const tags = uniqueSorted([...current.tags, ...link.tags]);
  const changed =
    categories.length !== current.categories.length || tags.length !== current.tags.length;

  return {
    version: 1,
    categories,
    tags,
    updatedAt: changed ? link.updatedAt : current.updatedAt,
  };
}
