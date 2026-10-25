import type { SourceIndex } from "./source-locator.ts";

export type Severity = "error" | "warning";

/** Every rule ID the linter can emit. Kept as a runtime array so tests can assert full coverage. */
export const RULE_IDS = [
  "img-missing-alt",
  "img-suspicious-alt",
  "ascii-scene-break",
  "heading-hierarchy",
  "link-text-clarity",
  "fragile-archive-link",
  "double-br-paragraphs",
  "table-accessibility",
  "details-summary",
  "deprecated-tags",
  "abbr-missing-title",
] as const;

export type RuleId = (typeof RULE_IDS)[number];

export interface SourceLocation {
  /** 0-based character start offset in the raw HTML textarea */
  readonly startOffset: number;
  /** 0-based character end offset (exclusive) in the raw HTML textarea */
  readonly endOffset: number;
  /** 1-based line number in the raw HTML textarea */
  readonly line: number;
  /** 1-based column number in the raw HTML textarea */
  readonly column: number;
}

export interface A11yFix {
  /** Accessible button label for applying the fix directly in the textarea */
  readonly label: string;
  /** 0-based character start offset in the raw HTML textarea to replace */
  readonly startOffset: number;
  /** 0-based character end offset (exclusive) in the raw HTML textarea to replace */
  readonly endOffset: number;
  /** Replacement text to insert at [startOffset, endOffset) */
  readonly replacement: string;
}

export interface A11yWarning {
  /** Unique identifier for the accessibility rule */
  readonly ruleId: RuleId;
  /** Severity of the violation */
  readonly severity: Severity;
  /** Short, human-readable title of the warning */
  readonly title: string;
  /** Plain-language explanation of how this affects screen reader or assistive tech users */
  readonly message: string;
  /** Actionable suggestion showing how to fix the HTML on AO3 */
  readonly suggestion: string;
  /** Concise snippet of the offending HTML */
  readonly snippet: string;
  /** Location in the raw HTML string for highlighting/jumping in the textarea */
  readonly location?: SourceLocation | undefined;
  /** Optional one-click replacement fix for the textarea */
  readonly fix?: A11yFix | undefined;
}

export interface LintContext {
  /** Raw HTML string entered into the AO3 textarea */
  readonly rawHtml: string;
  /** Inert parsed fragment holding the work body HTML (parsed like AO3 would inside a container) */
  readonly root: ParentNode;
  /** Pre-computed index for fast offset and tag lookups in `rawHtml` */
  readonly source: SourceIndex;
  /** Returns the source location of the opening tag of an element found under `root` */
  locateElement(element: Element): SourceLocation | undefined;
}

export type LintRule = (context: LintContext) => A11yWarning[];
