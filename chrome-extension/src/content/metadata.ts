import type { CapturedPage } from "../shared/types";

interface DescriptionParts {
  ogDescription?: string | null;
  metaDescription?: string | null;
  firstParagraph?: string | null;
}

function isUsefulParagraph(value: string) {
  const text = value.trim();
  if (text.length < 12) return false;
  return !/^(accept|agree|cookie|cookie settings|privacy settings|sign in|log in)$/i.test(
    text,
  );
}

export function chooseDescription(parts: DescriptionParts) {
  const og = parts.ogDescription?.trim();
  if (og) return og;
  const meta = parts.metaDescription?.trim();
  if (meta) return meta;
  const paragraph = parts.firstParagraph?.trim();
  if (paragraph && isUsefulParagraph(paragraph)) return paragraph;
  return "";
}

function absoluteUrl(value: string | null | undefined) {
  if (!value) return "";
  try {
    return new URL(value, document.location.href).toString();
  } catch {
    return "";
  }
}

export function extractPageMetadata(): CapturedPage {
  function localIsUsefulParagraph(value: string) {
    const text = value.trim();
    if (text.length < 12) return false;
    return !/^(accept|agree|cookie|cookie settings|privacy settings|sign in|log in)$/i.test(
      text,
    );
  }

  function localChooseDescription(parts: DescriptionParts) {
    const og = parts.ogDescription?.trim();
    if (og) return og;
    const metaDescription = parts.metaDescription?.trim();
    if (metaDescription) return metaDescription;
    const paragraph = parts.firstParagraph?.trim();
    if (paragraph && localIsUsefulParagraph(paragraph)) return paragraph;
    return "";
  }

  function localAbsoluteUrl(value: string | null | undefined) {
    if (!value) return "";
    try {
      return new URL(value, document.location.href).toString();
    } catch {
      return "";
    }
  }

  const meta = (selector: string) =>
    document.querySelector<HTMLMetaElement>(selector)?.content ?? "";
  const firstParagraph =
    [...document.querySelectorAll("p")]
      .map((paragraph) => paragraph.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .find(localIsUsefulParagraph) ?? "";
  const url = document.location.href;
  const domain = document.location.hostname.replace(/^www\./, "");
  const favicon =
    document.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href ||
    document.querySelector<HTMLLinkElement>('link[rel="shortcut icon"]')?.href ||
    `${document.location.origin}/favicon.ico`;

  return {
    url,
    title: meta('meta[property="og:title"]') || document.title || url,
    description: localChooseDescription({
      ogDescription: meta('meta[property="og:description"]'),
      metaDescription: meta('meta[name="description"]'),
      firstParagraph,
    }),
    favicon: localAbsoluteUrl(favicon),
    image: localAbsoluteUrl(meta('meta[property="og:image"]')),
    domain,
  };
}
