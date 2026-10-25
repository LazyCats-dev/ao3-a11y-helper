import { checkDetails } from "./rules/details.ts";
import { checkHeadings } from "./rules/headings.ts";
import { checkImages } from "./rules/images.ts";
import { checkLinks } from "./rules/links.ts";
import { checkParagraphs } from "./rules/paragraphs.ts";
import { checkSceneBreaks } from "./rules/scene-breaks.ts";
import { checkSemantics } from "./rules/semantics.ts";
import { checkTables } from "./rules/tables.ts";
import { createLintContext } from "./source-locator.ts";
import type { A11yWarning, LintRule } from "./types.ts";

export * from "./types.ts";
export * from "./source-locator.ts";

export const DEFAULT_RULES: readonly LintRule[] = [
  checkImages,
  checkLinks,
  checkHeadings,
  checkSceneBreaks,
  checkParagraphs,
  checkTables,
  checkDetails,
  checkSemantics,
];

/**
 * Analyzes an HTML string (as entered into AO3's work or chapter HTML textarea)
 * and returns accessibility warnings sorted by document order. Warnings without
 * a source location are listed last.
 */
export function analyzeHtml(
  rawHtml: string,
  rules: readonly LintRule[] = DEFAULT_RULES
): A11yWarning[] {
  if (rawHtml.trim().length === 0) {
    return [];
  }

  const context = createLintContext(rawHtml);
  const warnings = rules.flatMap((rule) => rule(context));

  return warnings.sort(
    (a, b) =>
      (a.location?.startOffset ?? Number.MAX_SAFE_INTEGER) -
      (b.location?.startOffset ?? Number.MAX_SAFE_INTEGER)
  );
}
