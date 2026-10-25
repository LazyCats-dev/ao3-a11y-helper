import { formatElementSnippet, getAccessibleText } from "../element-text.ts";
import type { A11yFix, A11yWarning, LintContext, SourceLocation } from "../types.ts";

const VAGUE_LINK_PHRASES = new Set([
  "click here",
  "here",
  "link",
  "this link",
  "read more",
  "more",
  "this",
  "source",
  "url",
  "website",
  "page",
]);

const RAW_URL_PATTERN = /^https?:\/\/\S+$/i;

const FRAGILE_ARCHIVE_ORG_PATTERN =
  /^https?:\/\/[^/]+archive\.org\/\d+\/items\/(?<details>[^/]+)\/(?<rest>.+)$/i;

export interface FragileArchiveLinkInfo {
  readonly originalUrl: string;
  readonly permanentUrl: string;
  readonly detailsUrl: string;
}

/**
 * Detects temporary storage-node `archive.org` URLs (e.g.
 * `https://ia803204.us.archive.org/16/items/<details>/<rest>`) and converts
 * them into stable `https://archive.org/download/<details>/<rest>` URLs.
 */
export function parseFragileArchiveUrl(
  rawUrl: string
): FragileArchiveLinkInfo | undefined {
  const trimmed = rawUrl.trim();
  if (trimmed === "") {
    return undefined;
  }

  let normalizedHref: string;
  try {
    normalizedHref = new URL(trimmed).href;
  } catch {
    return undefined;
  }

  const match = FRAGILE_ARCHIVE_ORG_PATTERN.exec(normalizedHref);
  const details = match?.groups?.["details"];
  const rest = match?.groups?.["rest"];
  if (!details || !rest) {
    return undefined;
  }

  return {
    originalUrl: normalizedHref,
    permanentUrl: `https://archive.org/download/${details}/${rest}`,
    detailsUrl: `https://archive.org/details/${details}`,
  };
}

function locateAttributeValueInTag(
  rawHtml: string,
  tagLocation: SourceLocation,
  attrName: "href" | "src"
): { startOffset: number; endOffset: number } | undefined {
  const rawTag = rawHtml.slice(tagLocation.startOffset, tagLocation.endOffset);
  const attrPattern = new RegExp(
    `\\b${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>` + "`" + `]+))`,
    "i"
  );
  const match = attrPattern.exec(rawTag);
  if (!match) {
    return undefined;
  }
  const rawValue = match[1] ?? match[2] ?? match[3];
  if (rawValue === undefined || rawValue.length === 0) {
    return undefined;
  }
  const eqIndex = match[0].indexOf("=");
  const valueOffsetInMatch = match[0].indexOf(rawValue, eqIndex + 1);
  if (valueOffsetInMatch === -1) {
    return undefined;
  }
  const startOffset = tagLocation.startOffset + match.index + valueOffsetInMatch;
  return {
    startOffset,
    endOffset: startOffset + rawValue.length,
  };
}

type LinkProblem = Pick<A11yWarning, "severity" | "title" | "message" | "suggestion">;

/** Returns what is wrong with a link, or `undefined` if it is accessible. */
function diagnoseLink(anchor: HTMLAnchorElement): LinkProblem | undefined {
  const href = anchor.getAttribute("href");

  if (href === null) {
    // Named anchor targets (e.g. <a name="notes"></a> or <a id="fn1">1</a>) are valid non-link footnote targets on AO3.
    const isAnchorTarget =
      (anchor.getAttribute("name") ?? "").trim() !== "" ||
      (anchor.getAttribute("id") ?? "").trim() !== "";
    if (isAnchorTarget) {
      return undefined;
    }
    return {
      severity: "warning",
      title: "Link is missing an href attribute",
      message:
        "An <a> tag without an href attribute cannot be focused or activated with a keyboard.",
      suggestion:
        'Add href="https://..." (or href="#target-id" for in-page jumps) so the link is interactive.',
    };
  }

  if (href.trim() === "") {
    return {
      severity: "error",
      title: "Link has an empty href attribute",
      message:
        'An <a> tag with an empty href="" points nowhere and confuses screen reader and keyboard users.',
      suggestion:
        'Provide a valid destination URL or anchor in href="...", or remove the <a> wrapper if it shouldn\'t be a link.',
    };
  }

  const accessibleText = getAccessibleText(anchor);

  if (accessibleText === "") {
    return {
      severity: "error",
      title: "Link has no accessible text",
      message:
        "This <a> link contains no text (and no image with alt text), so screen readers will either skip it or read out the raw destination URL.",
      suggestion:
        "Add descriptive text inside <a>...</a>, or if the link wraps an <img>, add an alt attribute describing where the link goes.",
    };
  }

  const normalized = accessibleText.toLowerCase().replace(/^[^\w]+|[^\w]+$/g, "");
  if (VAGUE_LINK_PHRASES.has(normalized)) {
    return {
      severity: "warning",
      title: `Vague link text ("${accessibleText}")`,
      message:
        'Screen reader users frequently browse a list of all links on the page. Generic labels like "click here" or "link" do not explain where the link leads out of context.',
      suggestion:
        'Use link text that describes the destination directly (e.g., <a href="...">Read the podfic version</a>).',
    };
  }

  if (RAW_URL_PATTERN.test(accessibleText)) {
    return {
      severity: "warning",
      title: "Link uses a raw URL as its visible text",
      message:
        "Screen readers read raw URLs character-by-character, which can be tedious and difficult to understand.",
      suggestion:
        'Replace the visible URL inside <a>...</a> with a human-readable title or description (e.g., <a href="https://...">View the reference art on Tumblr</a>).',
    };
  }

  return undefined;
}

export function checkLinks(context: LintContext): A11yWarning[] {
  const warnings: A11yWarning[] = [];

  for (const anchor of context.root.querySelectorAll("a")) {
    const problem = diagnoseLink(anchor);
    if (problem) {
      warnings.push({
        ruleId: "link-text-clarity",
        ...problem,
        snippet: formatElementSnippet(anchor),
        location: context.locateElement(anchor),
      });
    }
  }

  for (const element of context.root.querySelectorAll("[href], [src]")) {
    for (const attrName of ["href", "src"] as const) {
      const rawAttrValue = element.getAttribute(attrName);
      if (rawAttrValue === null) {
        continue;
      }

      const fragileInfo = parseFragileArchiveUrl(rawAttrValue);
      if (!fragileInfo) {
        continue;
      }

      const location = context.locateElement(element);
      const valueRange =
        location !== undefined
          ? locateAttributeValueInTag(context.rawHtml, location, attrName)
          : undefined;

      const fix: A11yFix | undefined =
        valueRange !== undefined
          ? {
              label: "Replace with permanent archive.org link",
              startOffset: valueRange.startOffset,
              endOffset: valueRange.endOffset,
              replacement: fragileInfo.permanentUrl,
            }
          : undefined;

      warnings.push({
        ruleId: "fragile-archive-link",
        severity: "warning",
        title: `Fragile archive.org ${attrName} link`,
        message: `This <${element.localName}> uses a temporary archive.org storage-server URL ("${fragileInfo.originalUrl}") that stops working when the Internet Archive moves files between servers.`,
        suggestion: `Use "${fragileInfo.permanentUrl}" instead (available from ${fragileInfo.detailsUrl} by clicking "Show All" under the download options).`,
        snippet: formatElementSnippet(element),
        location,
        fix,
      });
    }
  }

  return warnings;
}
