import type { A11yFix, A11yWarning } from "../linter/types.ts";

export type PanelHeadingTag = "h2" | "h3" | "h4" | "h5" | "h6";

export interface WarningPanelController {
  /** Root <section> element of the warning panel */
  readonly element: HTMLElement;
  /** Updates the panel with the latest warnings and current textarea value */
  update(warnings: readonly A11yWarning[], rawHtml: string): void;
  /** Removes the panel from the DOM */
  destroy(): void;
}

let instanceCounter = 0;

function levelToPanelHeadingTag(level: number): PanelHeadingTag {
  if (level <= 2) return "h2";
  if (level === 3) return "h3";
  if (level === 4) return "h4";
  if (level === 5) return "h5";
  return "h6";
}

/**
 * Determines the appropriate heading tag (`h2`–`h6`) for the warning panel
 * based on the last heading preceding `textarea` in document order,
 * ensuring the panel never violates heading hierarchy (`heading-order`).
 */
export function resolvePanelHeadingTag(
  textarea: HTMLTextAreaElement
): PanelHeadingTag {
  const doc = textarea.ownerDocument;
  const headings = doc.querySelectorAll("h1, h2, h3, h4, h5, h6");
  let lastPrecedingLevel = 1;

  headings.forEach((heading) => {
    const position = heading.compareDocumentPosition(textarea);
    if ((position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) {
      const level = Number.parseInt(heading.tagName.slice(1), 10);
      if (!Number.isNaN(level) && level >= 1 && level <= 6) {
        lastPrecedingLevel = level;
      }
    }
  });

  return levelToPanelHeadingTag(lastPrecedingLevel + 1);
}

function formatSummaryCounts(warnings: readonly A11yWarning[]): string {
  const errorCount = warnings.filter((w) => w.severity === "error").length;
  const warningCount = warnings.filter((w) => w.severity === "warning").length;

  const parts: string[] = [];
  if (errorCount > 0) {
    parts.push(`${errorCount} ${errorCount === 1 ? "error" : "errors"}`);
  }
  if (warningCount > 0) {
    parts.push(`${warningCount} ${warningCount === 1 ? "warning" : "warnings"}`);
  }

  return parts.join(", ");
}

/**
 * Focuses the target AO3 HTML textarea, scrolls it into view (helpful on mobile /
 * Firefox for Android when the warning list is below a tall editor), and highlights
 * the offending HTML range.
 */
export function selectLocationInTextarea(
  textarea: HTMLTextAreaElement,
  startOffset: number,
  endOffset: number
): void {
  if (typeof textarea.scrollIntoView === "function") {
    const prefersReducedMotion =
      typeof globalThis.matchMedia === "function" &&
      globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
    textarea.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "center",
    });
  }
  textarea.focus();
  textarea.setSelectionRange(startOffset, endOffset);
}

/**
 * Applies a one-click replacement fix in the AO3 HTML textarea, selects the
 * newly inserted replacement text, and dispatches `input` + `change` events so
 * both the warning panel and AO3's form state update immediately.
 */
export function applyFixInTextarea(
  textarea: HTMLTextAreaElement,
  fix: A11yFix
): void {
  const current = textarea.value;
  const before = current.slice(0, fix.startOffset);
  const after = current.slice(fix.endOffset);
  textarea.value = `${before}${fix.replacement}${after}`;

  const newEndOffset = fix.startOffset + fix.replacement.length;
  selectLocationInTextarea(textarea, fix.startOffset, newEndOffset);

  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Finds the element after which the warning panel should be inserted so it
 * does not split AO3's `<textarea>` from its adjacent `LiveValidation` message
 * (`span.LV_validation_message`), inline validation `<script>`, or character
 * countdown (`p.character_counter`).
 */
function findPanelInsertionAnchor(textarea: HTMLTextAreaElement): Element {
  let anchor: Element = textarea;
  let next = textarea.nextElementSibling;

  while (next !== null) {
    const tag = next.tagName.toLowerCase();
    if (
      next.classList.contains("LV_validation_message") ||
      next.classList.contains("character_counter") ||
      tag === "script"
    ) {
      anchor = next;
      next = next.nextElementSibling;
      continue;
    }
    break;
  }

  return anchor;
}

/**
 * Creates and mounts the AO3 Accessibility Helper warning panel directly
 * beneath the provided work/chapter HTML `<textarea>` (and its companion
 * AO3 validation message / character counter elements).
 */
export function createWarningPanel(
  textarea: HTMLTextAreaElement
): WarningPanelController {
  instanceCounter++;
  const headingId = `ao3-a11y-heading-${instanceCounter}`;
  const doc = textarea.ownerDocument;

  const section = doc.createElement("section");
  section.className = "listbox group ao3-a11y-panel";
  section.setAttribute("aria-labelledby", headingId);
  section.dataset["ao3A11yPanel"] = "true";

  // Header bar (uses AO3's .listbox > .heading pattern)
  const header = doc.createElement("div");
  header.className = "heading ao3-a11y-header";

  const headingTag = resolvePanelHeadingTag(textarea);
  const heading = doc.createElement(headingTag);
  heading.className = "heading ao3-a11y-title";
  heading.id = headingId;
  heading.textContent = "AO3 Accessibility Check";

  const statusBadge = doc.createElement("span");
  statusBadge.className = "ao3-a11y-status";
  statusBadge.dataset["ao3A11yStatus"] = "idle";

  // Centralized polite live region for screen reader announcements (only updated when summary changes)
  const liveRegion = doc.createElement("div");
  liveRegion.className = "ao3-a11y-visually-hidden";
  liveRegion.setAttribute("aria-live", "polite");
  liveRegion.setAttribute("aria-atomic", "true");

  header.appendChild(heading);
  header.appendChild(statusBadge);
  header.appendChild(liveRegion);

  // Body container (uses AO3's .listbox .index.group pattern)
  const body = doc.createElement("div");
  body.className = "index group ao3-a11y-body";

  section.appendChild(header);
  section.appendChild(body);

  // Insert directly below the textarea (after any AO3 LiveValidation / character_counter siblings)
  const insertionAnchor = findPanelInsertionAnchor(textarea);
  insertionAnchor.insertAdjacentElement("afterend", section);

  let lastAnnouncedSummary = "";

  function update(warnings: readonly A11yWarning[], rawHtml: string): void {
    const previousButtons = Array.from(
      body.querySelectorAll<HTMLButtonElement>(
        ".ao3-a11y-jump-btn, .ao3-a11y-fix-btn"
      )
    );
    const focusedButtonIndex =
      doc.activeElement instanceof HTMLButtonElement
        ? previousButtons.indexOf(doc.activeElement)
        : -1;

    body.replaceChildren();

    if (rawHtml.trim().length === 0) {
      section.dataset["ao3A11yState"] = "empty";
      statusBadge.dataset["ao3A11yStatus"] = "idle";
      statusBadge.textContent = "Ready to check HTML";
      liveRegion.textContent = "";
      lastAnnouncedSummary = "";

      const emptyNote = doc.createElement("p");
      emptyNote.className = "notice ao3-a11y-empty-note";
      emptyNote.textContent =
        "Enter or paste your work HTML above to check for common accessibility issues (missing image alt text, non-semantic scene breaks, skipped headings, and more).";
      body.appendChild(emptyNote);
      return;
    }

    if (warnings.length === 0) {
      section.dataset["ao3A11yState"] = "clean";
      statusBadge.dataset["ao3A11yStatus"] = "clean";
      const cleanSummary = "No accessibility issues detected";
      statusBadge.textContent = cleanSummary;

      if (lastAnnouncedSummary !== cleanSummary) {
        liveRegion.textContent = `AO3 Accessibility Check: ${cleanSummary}.`;
        lastAnnouncedSummary = cleanSummary;
      }

      const cleanNote = doc.createElement("p");
      cleanNote.className = "notice ao3-a11y-clean-note";
      cleanNote.textContent =
        "No common HTML accessibility issues found in your work text.";
      body.appendChild(cleanNote);
      return;
    }

    const summaryText = `${formatSummaryCounts(warnings)} found`;
    const hasErrors = warnings.some((w) => w.severity === "error");
    const state = hasErrors ? "error" : "warning";
    section.dataset["ao3A11yState"] = state;
    statusBadge.dataset["ao3A11yStatus"] = state;
    statusBadge.textContent = summaryText;

    if (lastAnnouncedSummary !== summaryText) {
      liveRegion.textContent = `AO3 Accessibility Check: ${summaryText}.`;
      lastAnnouncedSummary = summaryText;
    }

    const list = doc.createElement("ol");
    list.className = "ao3-a11y-list";

    for (const warning of warnings) {
      const item = doc.createElement("li");
      item.className = `blurb group ao3-a11y-item ao3-a11y-item--${warning.severity}`;
      item.dataset["ruleId"] = warning.ruleId;

      const itemHeader = doc.createElement("div");
      itemHeader.className = "ao3-a11y-item-header";

      const badge = doc.createElement("span");
      badge.className = `ao3-a11y-badge ao3-a11y-badge--${warning.severity}`;
      badge.textContent = warning.severity === "error" ? "Error" : "Warning";

      const itemTitle = doc.createElement("strong");
      itemTitle.className = "ao3-a11y-item-title";
      itemTitle.textContent = warning.title;

      itemHeader.appendChild(badge);
      itemHeader.appendChild(itemTitle);

      if (warning.location) {
        const lineMeta = doc.createElement("span");
        lineMeta.className = "ao3-a11y-line-meta";
        lineMeta.textContent = `Line ${warning.location.line}`;
        itemHeader.appendChild(lineMeta);
      }

      item.appendChild(itemHeader);

      if (warning.snippet) {
        const snippetPre = doc.createElement("pre");
        snippetPre.className = "ao3-a11y-snippet";
        const snippetCode = doc.createElement("code");
        snippetCode.textContent = warning.snippet;
        snippetPre.appendChild(snippetCode);
        item.appendChild(snippetPre);
      }

      const messageP = doc.createElement("p");
      messageP.className = "ao3-a11y-message";
      messageP.textContent = warning.message;
      item.appendChild(messageP);

      const suggestionP = doc.createElement("p");
      suggestionP.className = "ao3-a11y-suggestion";
      const suggestionStrong = doc.createElement("strong");
      suggestionStrong.textContent = "How to fix on AO3: ";
      suggestionP.appendChild(suggestionStrong);
      suggestionP.appendChild(doc.createTextNode(warning.suggestion));
      item.appendChild(suggestionP);

      if (warning.location || warning.fix) {
        const actionsP = doc.createElement("p");
        actionsP.className = "actions ao3-a11y-actions";

        if (warning.location) {
          const { startOffset, endOffset, line } = warning.location;
          const jumpButton = doc.createElement("button");
          jumpButton.type = "button";
          jumpButton.className = "action ao3-a11y-jump-btn";
          jumpButton.textContent = `Highlight in HTML (Line ${line})`;
          jumpButton.addEventListener("click", () => {
            selectLocationInTextarea(textarea, startOffset, endOffset);
          });
          actionsP.appendChild(jumpButton);
        }

        if (warning.fix) {
          const fix = warning.fix;
          const lineSuffix = warning.location
            ? ` (Line ${warning.location.line})`
            : "";
          const fixButton = doc.createElement("button");
          fixButton.type = "button";
          fixButton.className = "action ao3-a11y-fix-btn";
          fixButton.textContent = `${fix.label}${lineSuffix}`;
          fixButton.addEventListener("click", () => {
            applyFixInTextarea(textarea, fix);
          });
          actionsP.appendChild(fixButton);
        }

        item.appendChild(actionsP);
      }

      list.appendChild(item);
    }

    body.appendChild(list);

    if (focusedButtonIndex >= 0) {
      const newButtons = body.querySelectorAll<HTMLButtonElement>(
        ".ao3-a11y-jump-btn, .ao3-a11y-fix-btn"
      );
      const targetButton =
        newButtons[Math.min(focusedButtonIndex, newButtons.length - 1)];
      targetButton?.focus();
    }
  }

  function destroy(): void {
    section.remove();
  }

  return {
    element: section,
    update,
    destroy,
  };
}
