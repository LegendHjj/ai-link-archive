import type { Category } from "../types";

export const DEFAULT_CATEGORIES = [
  "AI News",
  "Research",
  "Tools",
  "Models",
  "Agents",
  "YouTube",
  "Projects",
  "Personal",
  "To Read",
] as const satisfies readonly Category[];

export type SourceType =
  | "Web"
  | "GitHub"
  | "YouTube"
  | "X"
  | "Paper"
  | "Docs"
  | "Notion"
  | "Note";

const URL_REGEX = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;

function toUrl(raw: string): URL | null {
  const withProtocol = raw.startsWith("www.") ? `https://${raw}` : raw;
  try {
    return new URL(withProtocol);
  } catch {
    return null;
  }
}

export function parseBulkLinks(input: string): string[] {
  const matches = input.match(URL_REGEX) ?? [];
  const seen = new Set<string>();
  const links: string[] = [];

  for (const match of matches) {
    const parsed = toUrl(match.replace(/[),.;]+$/, ""));
    if (!parsed || !["http:", "https:"].includes(parsed.protocol)) continue;
    const normalized = parsed.toString();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    links.push(normalized);
  }

  return links;
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

export function inferCategory(url: string, title: string): Category {
  if (!url.trim()) return "Personal";
  const source = inferSourceType(url);
  const haystack = `${getDomain(url)} ${title}`.toLowerCase();

  if (source === "YouTube") return "YouTube";
  if (source === "GitHub") return "Projects";
  if (source === "Paper") return "Research";
  if (/\b(agent|agents|autogen|langgraph|crewai)\b/.test(haystack)) {
    return "Agents";
  }
  if (/\b(model|models|gpt|claude|gemini|llama|mistral|qwen|release)\b/.test(haystack)) {
    return "Models";
  }
  if (/\b(tool|tools|sdk|api|framework|library|app)\b/.test(haystack)) {
    return "Tools";
  }
  if (/\b(news|announces|introduces|launches|releases)\b/.test(haystack)) {
    return "AI News";
  }
  return "To Read";
}

export function cleanTagInput(input: string): string[] {
  const seen = new Set<string>();
  return input
    .split(",")
    .map((tag) =>
      tag
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-"),
    )
    .filter(Boolean)
    .filter((tag) => {
      if (seen.has(tag)) return false;
      seen.add(tag);
      return true;
    });
}

export function titleFromUrl(url: string): string {
  if (!url.trim()) return "Untitled note";
  const parsed = toUrl(url);
  if (!parsed) return url;
  const domain = parsed.hostname.replace(/^www\./, "");
  const pathParts = parsed.pathname
    .split("/")
    .filter(Boolean)
    .slice(-2)
    .map((part) =>
      decodeURIComponent(part)
        .replace(/[-_]/g, " ")
        .replace(/\.[a-z0-9]+$/i, ""),
    );
  const suffix = pathParts.length ? ` - ${pathParts.join(" / ")}` : "";
  return `${domain}${suffix}`;
}

export function suggestedTags(url: string, title: string): string[] {
  const tags = new Set<string>();
  const source = inferSourceType(url);
  const category = inferCategory(url, title);
  const text = `${url} ${title}`.toLowerCase();

  tags.add(category.toLowerCase().replace(/\s+/g, "-"));
  if (source !== "Web") tags.add(source.toLowerCase());

  const keywordTags: Array<[RegExp, string]> = [
    [/\b(llm|language model|gpt|claude|gemini|llama)\b/, "llm"],
    [/\bagent|agents|agentic\b/, "agents"],
    [/\brag|retrieval\b/, "rag"],
    [/\bvector|embedding|embeddings\b/, "vector-db"],
    [/\bmultimodal|vision\b/, "multimodal"],
    [/\bopen[- ]?source\b|github\.com/, "open-source"],
    [/\bprompt|prompting\b/, "prompting"],
    [/\bfine[- ]?tune|training\b/, "fine-tuning"],
  ];

  for (const [pattern, tag] of keywordTags) {
    if (pattern.test(text)) tags.add(tag);
  }

  return [...tags].slice(0, 5);
}
