import { analyzeHtml } from "../linter/index.ts";
import { createWarningPanel, type WarningPanelController } from "./warning-panel.ts";

/**
 * Selectors matching AO3's work and chapter HTML textareas on:
 * - /works/new
 * - /works/:id/edit
 * - /works/:work_id/chapters/new
 * - /works/:work_id/chapters/:id/edit
 * - /chapters/:id/edit
 */
export const AO3_WORK_TEXTAREA_SELECTOR = [
  "textarea#work_chapter_attributes_content",
  "textarea#chapter_content",
  'textarea[name="work[chapter_attributes][content]"]',
  'textarea[name="chapter[content]"]',
].join(", ");

export interface AttachOptions {
  /** Debounce interval in milliseconds for typing events. Set to 0 for synchronous updates in tests. */
  debounceMs?: number;
}

export interface AttachedInstance {
  readonly textarea: HTMLTextAreaElement;
  readonly panel: WarningPanelController;
  /** Forces an immediate accessibility check and UI update */
  runCheckNow(): void;
  /** Detaches event listeners and removes the warning panel */
  destroy(): void;
}

const attachedTextareas = new WeakMap<HTMLTextAreaElement, AttachedInstance>();

/**
 * Attaches the AO3 Accessibility Helper warning panel and listeners to a single work HTML `<textarea>`.
 */
export function attachToWorkTextarea(
  textarea: HTMLTextAreaElement,
  options: AttachOptions = {}
): AttachedInstance {
  const existing = attachedTextareas.get(textarea);
  if (existing) {
    return existing;
  }

  const debounceMs = options.debounceMs ?? 200;
  const panel = createWarningPanel(textarea);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingRafId: number | null = null;
  let lastRenderedHtml: string | null = null;

  function cancelPendingAsync(): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (
      pendingRafId !== null &&
      typeof globalThis.cancelAnimationFrame === "function"
    ) {
      globalThis.cancelAnimationFrame(pendingRafId);
      pendingRafId = null;
    }
  }

  function runCheckNow(): void {
    cancelPendingAsync();
    const rawHtml = textarea.value;
    const warnings = analyzeHtml(rawHtml);
    lastRenderedHtml = rawHtml;
    panel.update(warnings, rawHtml);
  }

  /**
   * Flushes any unrendered changes when leaving or committing the textarea,
   * without tearing down and recreating the panel DOM when `textarea.value`
   * has already been rendered (preserving keyboard focus when Tabbing into the panel).
   */
  function flushPendingCheck(): void {
    if (textarea.value === lastRenderedHtml) {
      cancelPendingAsync();
      return;
    }
    runCheckNow();
  }

  function scheduleCheck(): void {
    if (debounceMs <= 0) {
      runCheckNow();
      return;
    }

    cancelPendingAsync();

    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      if (typeof globalThis.requestAnimationFrame === "function") {
        pendingRafId = globalThis.requestAnimationFrame(() => {
          pendingRafId = null;
          runCheckNow();
        });
      } else {
        runCheckNow();
      }
    }, debounceMs);
  }

  textarea.addEventListener("input", scheduleCheck);
  textarea.addEventListener("change", flushPendingCheck);
  textarea.addEventListener("blur", flushPendingCheck);

  // Run an initial check for pre-populated content (e.g., when editing an existing work/draft)
  runCheckNow();

  const instance: AttachedInstance = {
    textarea,
    panel,
    runCheckNow,
    destroy() {
      cancelPendingAsync();
      textarea.removeEventListener("input", scheduleCheck);
      textarea.removeEventListener("change", flushPendingCheck);
      textarea.removeEventListener("blur", flushPendingCheck);
      panel.destroy();
      attachedTextareas.delete(textarea);
    },
  };

  attachedTextareas.set(textarea, instance);
  return instance;
}

/**
 * Scans `root` (defaults to `document`) for AO3 work/chapter HTML textareas
 * and attaches the accessibility warning panel to each one.
 */
export function initAo3A11yHelper(
  root: ParentNode = document,
  options: AttachOptions = {}
): AttachedInstance[] {
  const elements = root.querySelectorAll<HTMLTextAreaElement>(
    AO3_WORK_TEXTAREA_SELECTOR
  );
  const instances: AttachedInstance[] = [];

  elements.forEach((textarea) => {
    instances.push(attachToWorkTextarea(textarea, options));
  });

  return instances;
}

// Automatically initialize when executed as a browser content script
if (typeof document !== "undefined" && document.body) {
  initAo3A11yHelper(document);
}
