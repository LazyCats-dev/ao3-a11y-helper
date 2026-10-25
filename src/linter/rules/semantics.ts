import { formatElementSnippet } from "../element-text.ts";
import type { A11yWarning, LintContext } from "../types.ts";

interface DeprecatedTagGuide {
  readonly reason: string;
  readonly replacement: string;
}

const DEPRECATED_TAGS = new Map<string, DeprecatedTagGuide>([
  [
    "center",
    {
      reason:
        "<center> is an obsolete presentational tag that can interfere with user reading styles.",
      replacement:
        'Use the align attribute that AO3 allows instead (e.g., <p align="center">...</p>), or a class styled by an AO3 Work Skin.',
    },
  ],
  [
    "font",
    {
      reason:
        "<font> overrides user font and color preferences, which can hurt readability for low-vision and dyslexic readers.",
      replacement:
        "Remove <font> or move custom typography into an AO3 Work Skin so readers can toggle creator styles off if needed.",
    },
  ],
  [
    "big",
    {
      reason: "<big> is a deprecated presentational tag without semantic meaning.",
      replacement:
        "Use a semantic heading (<h2>–<h6>) for section titles, <strong> for emphasis, or an AO3 Work Skin for font sizing.",
    },
  ],
  [
    "strike",
    {
      reason: "<strike> is obsolete HTML.",
      replacement:
        "Use <del> for deleted/edited text or <s> for text that is no longer accurate.",
    },
  ],
  [
    "tt",
    {
      reason: "<tt> (teletype) is an obsolete presentational tag.",
      replacement:
        "Use <code>, <kbd>, or <samp> for monospace text (chat logs, terminal output, or keystrokes).",
    },
  ],
]);

const DEPRECATED_SELECTOR = Array.from(DEPRECATED_TAGS.keys()).join(", ");

export function checkSemantics(context: LintContext): A11yWarning[] {
  const warnings: A11yWarning[] = [];

  for (const el of context.root.querySelectorAll(DEPRECATED_SELECTOR)) {
    const guide = DEPRECATED_TAGS.get(el.localName);
    if (!guide) continue;

    warnings.push({
      ruleId: "deprecated-tags",
      severity: "warning",
      title: `Deprecated HTML tag (<${el.localName}>)`,
      message: guide.reason,
      suggestion: guide.replacement,
      snippet: formatElementSnippet(el),
      location: context.locateElement(el),
    });
  }

  for (const el of context.root.querySelectorAll("abbr, acronym")) {
    if ((el.getAttribute("title") ?? "").trim() !== "") continue;

    const tagName = el.localName;
    warnings.push({
      ruleId: "abbr-missing-title",
      severity: "warning",
      title: `<${tagName}> is missing a title attribute`,
      message: `An <${tagName}> tag without a title attribute provides no expansion for readers or screen readers.`,
      suggestion:
        'Add title="Full Expansion" (e.g., <abbr title="Archive of Our Own">AO3</abbr>).',
      snippet: formatElementSnippet(el),
      location: context.locateElement(el),
    });
  }

  return warnings;
}
