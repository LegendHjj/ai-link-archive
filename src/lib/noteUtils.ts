import type { LinkItem, LinkStatus } from "../types";

export type ContentFilter = "all" | "notes" | "links";

export interface LibraryFilters {
  content: ContentFilter;
  category: string;
  status: LinkStatus | "all";
  query: string;
  tag: string | null;
}

export function isNoteItem(item: LinkItem) {
  return item.type === "note" || !item.url.trim();
}

export function filterLibraryItems(items: LinkItem[], filters: LibraryFilters) {
  const lowerQuery = filters.query.toLowerCase().trim();

  return items
    .filter((item) => {
      if (filters.category === "Archived") {
        if (item.status !== "archived") return false;
      } else {
        if (item.status === "archived") return false;
        if (filters.category !== "All Items" && item.category !== filters.category) {
          return false;
        }
      }

      const note = isNoteItem(item);
      if (filters.content === "notes" && !note) return false;
      if (filters.content === "links" && note) return false;
      if (filters.tag && !item.tags.includes(filters.tag)) return false;
      if (filters.status !== "all" && item.status !== filters.status) return false;
      if (!lowerQuery) return true;

      return [item.title, item.url, item.domain, item.notes, ...item.tags]
        .join(" ")
        .toLowerCase()
        .includes(lowerQuery);
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function notePreview(item: LinkItem, maxLength = 360) {
  const normalized = item.notes.trim();
  if (!normalized) return "Add some detail to this note";

  const lines = normalized.split(/\r?\n/);
  const body =
    lines[0]?.trim().toLowerCase() === item.title.trim().toLowerCase()
      ? lines.slice(1).join("\n").trim()
      : normalized;
  const preview = body || normalized;

  if (preview.length <= maxLength) return preview;
  return `${preview.slice(0, maxLength).trimEnd()}…`;
}
