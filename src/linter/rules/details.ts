import { formatElementSnippet, getAccessibleText } from "../element-text.ts";
import type { A11yWarning, LintContext } from "../types.ts";

export function checkDetails(context: LintContext): A11yWarning[] {
  const warnings: A11yWarning[] = [];

  for (const details of context.root.querySelectorAll("details")) {
    const summary = Array.from(details.children).find(
      (child) => child.localName === "summary"
    );

    if (!summary) {
      warnings.push({
        ruleId: "details-summary",
        severity: "error",
        title: "<details> is missing a <summary> label",
        message:
          "Without a <summary> element as its first child, a <details> disclosure falls back to a generic browser label that does not tell readers what is hidden inside.",
        suggestion:
          "Add <summary>Descriptive Label</summary> as the very first child inside <details>.",
        snippet: formatElementSnippet(details),
        location: context.locateElement(details),
      });
      continue;
    }

    // Summary-specific problems point at the <summary> tag so "Highlight in HTML" selects it.
    const summarySnippet = formatElementSnippet(summary);
    const summaryLocation = context.locateElement(summary);

    if (details.firstElementChild !== summary) {
      warnings.push({
        ruleId: "details-summary",
        severity: "warning",
        title: "<summary> should be the first child of <details>",
        message:
          "In HTML, <summary> must be the very first child element inside <details> for browsers and screen readers to use it reliably as the disclosure label.",
        suggestion:
          "Move <summary>...</summary> to the top of <details>, before any <p> or other content.",
        snippet: summarySnippet,
        location: summaryLocation,
      });
    }

    if (getAccessibleText(summary) === "") {
      warnings.push({
        ruleId: "details-summary",
        severity: "error",
        title: "<summary> inside <details> is empty",
        message:
          "An empty <summary> gives keyboard and screen reader users an unlabeled disclosure button.",
        suggestion:
          "Add descriptive text inside <summary>...</summary> explaining what expanding the section reveals.",
        snippet: summarySnippet,
        location: summaryLocation,
      });
      continue;
    }

    const nestedHeading = summary.querySelector("h1, h2, h3, h4, h5, h6");
    if (nestedHeading) {
      const headingTag = nestedHeading.localName;
      warnings.push({
        ruleId: "details-summary",
        severity: "warning",
        title: `Heading (<${headingTag}>) placed inside <summary>`,
        message:
          "Many screen readers strip heading semantics inside interactive <summary> buttons or omit them from heading navigation shortcuts.",
        suggestion: `Use plain text or <strong> inside <summary> instead of wrapping a <${headingTag}> inside <summary>.`,
        snippet: summarySnippet,
        location: summaryLocation,
      });
    }
  }

  return warnings;
}
