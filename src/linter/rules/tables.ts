import { formatElementSnippet, getAccessibleText } from "../element-text.ts";
import type { A11yWarning, LintContext } from "../types.ts";

const VALID_SCOPES = new Set(["col", "row", "colgroup", "rowgroup"]);

type TableProblem = Pick<A11yWarning, "title" | "message" | "suggestion">;

/** Returns the most important problem with a table, or `undefined` if it is accessible. */
function diagnoseTable(table: HTMLTableElement): TableProblem | undefined {
  const headers = Array.from(table.querySelectorAll("th"));

  if (headers.length === 0) {
    return {
      title: "Table is missing header cells (<th>)",
      message:
        "Data tables without <th> headers prevent screen readers from announcing column or row context as users navigate across cells. Layout tables also confuse screen readers.",
      suggestion:
        'Add <th> header cells (ideally with scope="col" or scope="row") and a <caption> for data tables, or use an AO3 Work Skin instead of a table for visual layout.',
    };
  }

  if (headers.some((th) => getAccessibleText(th) === "")) {
    return {
      title: "Table contains an empty header cell (<th>)",
      message:
        "Empty <th> header cells leave corresponding rows or columns without a label when screen reader users navigate the table.",
      suggestion:
        "Add descriptive text inside each <th>...</th> cell, or use <td> if a corner cell is intentionally blank.",
    };
  }

  const caption = table.querySelector("caption");
  const hasCaption = caption !== null && getAccessibleText(caption) !== "";
  const allHeadersScoped = headers.every((th) =>
    VALID_SCOPES.has((th.getAttribute("scope") ?? "").trim().toLowerCase())
  );

  if (!hasCaption || !allHeadersScoped) {
    return {
      title: "Table could be clearer with <caption> and <th scope>",
      message:
        'Adding a <caption> summarizes the table\'s purpose, and setting scope="col" or scope="row" on <th> cells clarifies header direction for screen readers.',
      suggestion:
        'Add <caption>Table Title</caption> inside <table> and include scope="col" or scope="row" on each <th> element.',
    };
  }

  return undefined;
}

export function checkTables(context: LintContext): A11yWarning[] {
  const warnings: A11yWarning[] = [];

  for (const table of context.root.querySelectorAll("table")) {
    const problem = diagnoseTable(table);
    if (problem) {
      warnings.push({
        ruleId: "table-accessibility",
        severity: "warning",
        ...problem,
        snippet: formatElementSnippet(table),
        location: context.locateElement(table),
      });
    }
  }

  return warnings;
}
