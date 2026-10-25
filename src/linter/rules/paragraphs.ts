import { maskPreservedFormatting } from "../source-locator.ts";
import type { A11yWarning, LintContext } from "../types.ts";

const DOUBLE_BR_PATTERN = /<br\s*\/?>\s*(?:<br\s*\/?>\s*)+/gi;

export function checkParagraphs(context: LintContext): A11yWarning[] {
  const warnings: A11yWarning[] = [];
  const { rawHtml, source } = context;
  const maskedHtml = maskPreservedFormatting(rawHtml);

  for (const match of maskedHtml.matchAll(DOUBLE_BR_PATTERN)) {
    const startOffset = match.index;
    const endOffset = startOffset + match[0].length;
    const snippet = rawHtml
      .slice(startOffset, endOffset)
      .replace(/\s+/g, " ")
      .trim();

    warnings.push({
      ruleId: "double-br-paragraphs",
      severity: "warning",
      title: "Multiple <br> tags used instead of <p> paragraphs",
      message:
        "Using <br><br> creates visual spacing without semantic paragraph boundaries, preventing screen reader users from jumping paragraph-by-paragraph.",
      suggestion:
        "Wrap each paragraph in <p>...</p> tags (or leave a blank line in AO3's editor) instead of chaining multiple <br> tags.",
      snippet,
      location: source.locateRange(startOffset, endOffset),
    });
  }

  return warnings;
}
