import { formatElementSnippet, getAccessibleText } from "../element-text.ts";
import type { A11yWarning, LintContext } from "../types.ts";

export function checkHeadings(context: LintContext): A11yWarning[] {
  const warnings: A11yWarning[] = [];
  let previousLevel: number | undefined;

  for (const heading of context.root.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
    const tagName = heading.localName;
    const level = Number(tagName.slice(1));
    const location = context.locateElement(heading);
    const snippet = formatElementSnippet(heading);

    if (getAccessibleText(heading) === "") {
      warnings.push({
        ruleId: "heading-hierarchy",
        severity: "error",
        title: `Empty heading (<${tagName}>)`,
        message:
          "Screen readers announce this heading without any label, which confuses readers navigating the chapter by headings.",
        suggestion: `Add descriptive text inside <${tagName}>...</${tagName}>, or remove the empty heading tag if it was only added for vertical spacing.`,
        snippet,
        location,
      });
    }

    if (previousLevel !== undefined && level > previousLevel + 1) {
      const previousTag = `h${previousLevel}`;
      const expectedTag = `h${previousLevel + 1}`;
      warnings.push({
        ruleId: "heading-hierarchy",
        severity: "warning",
        title: `Skipped heading level (<${previousTag}> to <${tagName}>)`,
        message: `Jumping directly from <${previousTag}> to <${tagName}> skips <${expectedTag}>, breaking the heading outline used by screen readers.`,
        suggestion: `Change <${tagName}> to <${expectedTag}> so headings step down one level at a time.`,
        snippet,
        location,
      });
    }

    previousLevel = level;
  }

  return warnings;
}
