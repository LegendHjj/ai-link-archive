import type { AppSettings, LinkItem, LinkStatus } from "../types";
import {
  getDomain,
  inferCategory,
  inferSourceType,
  suggestedTags,
  titleFromUrl,
} from "./bookmarkUtils";

const statuses: LinkStatus[] = ["unread", "read", "archived"];

function uniqueSorted(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function importedId(index: number) {
  return globalThis.crypto?.randomUUID?.() ?? `imported-${Date.now()}-${index}`;
}

function normalizeImportedLink(raw: unknown, index: number): LinkItem | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Partial<LinkItem>;
  const type = record.type === "note" || !record.url ? "note" : "link";
  const url = type === "link" ? String(record.url ?? "").trim() : "";
  const title =
    String(record.title ?? "").trim() ||
    (type === "note" ? "Untitled note" : titleFromUrl(url));
  const now = Date.now();
  const createdAt = Number.isFinite(record.createdAt) ? Number(record.createdAt) : now;
  const updatedAt = Number.isFinite(record.updatedAt) ? Number(record.updatedAt) : createdAt;
  const category =
    String(record.category ?? "").trim() || inferCategory(url, title);

  return {
    id: String(record.id ?? "").trim() || importedId(index),
    type,
    url,
    title,
    domain: String(record.domain ?? "").trim() || getDomain(url),
    category,
    source: record.source ?? inferSourceType(url),
    tags: Array.isArray(record.tags) && record.tags.length
      ? uniqueSorted(record.tags.map(String))
      : suggestedTags(url, title),
    notes: String(record.notes ?? ""),
    favorite: Boolean(record.favorite),
    status: statuses.includes(record.status as LinkStatus)
      ? (record.status as LinkStatus)
      : "unread",
    createdAt,
    updatedAt,
  };
}

export function parseExportedLinksJson(text: string): LinkItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }

  const records = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { links?: unknown }).links)
      ? (parsed as { links: unknown[] }).links
      : [];

  return records
    .map((record, index) => normalizeImportedLink(record, index))
    .filter((link): link is LinkItem => Boolean(link));
}

export function mergeImportedLinks(current: LinkItem[], imported: LinkItem[]) {
  const byId = new Map(current.map((link) => [link.id, link]));
  const urlToId = new Map(
    current
      .filter((link) => link.type === "link" && link.url)
      .map((link) => [link.url, link.id]),
  );

  for (const link of imported) {
    const existing = byId.get(link.id);
    if (existing) {
      if (link.updatedAt >= existing.updatedAt) byId.set(link.id, link);
      continue;
    }

    if (link.type === "link" && link.url && urlToId.has(link.url)) continue;
    byId.set(link.id, link);
    if (link.type === "link" && link.url) urlToId.set(link.url, link.id);
  }

  return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export function settingsWithLinks(settings: AppSettings, links: LinkItem[]) {
  return {
    ...settings,
    categories: uniqueSorted([...settings.categories, ...links.map((link) => link.category)]),
    tags: uniqueSorted([...settings.tags, ...links.flatMap((link) => link.tags)]),
    updatedAt: Date.now(),
  };
}
