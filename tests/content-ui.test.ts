import { getRequiredElement, runAxe } from "./setup.ts";
import "../src/content/styles.css";
import { commands, page, userEvent } from "vitest/browser";
import { beforeEach, describe, expect, test } from "vitest";
import { initAo3A11yHelper } from "../src/content/index.ts";
import {
  createWarningPanel,
  resolvePanelHeadingTag,
  selectLocationInTextarea,
} from "../src/content/warning-panel.ts";

/** Core AO3 default stylesheet rules for .listbox, .group, .heading, .index, .blurb, .notice, and .actions/button */
const AO3_DEFAULT_SITE_SKIN_CSS = `
  body { background: #fff; color: #2a2a2a; }
  fieldset { background: #ddd; border: 2px solid #f3efec; padding: 0.643em; }
  .listbox, fieldset fieldset.listbox {
    background: #ddd;
    border: 2px solid #ccc;
    padding: 0;
    margin: 0.643em auto;
    overflow: hidden;
    box-shadow: 0 0 0 1px #fff;
  }
  .listbox > .heading {
    margin: 0;
    color: #2a2a2a;
    padding: 0.25em;
  }
  .listbox .index {
    background: #fff;
    padding: 0.643em;
    margin: 0;
    box-shadow: inset 1px 1px 3px #bbb;
  }
  li.blurb, .blurb .blurb {
    display: block;
    position: relative;
    clear: left;
    padding: 0.429em 0.75em;
  }
  .notice {
    background: #d1e1ef;
    border: 1px solid #c2d2df;
    margin: 0.643em auto;
    padding: 0.25em 0.375em;
  }
  ul.actions, p.actions, li.actions, span.actions {
    float: right;
    text-align: center;
  }
  .actions a, .action, .actions button, button {
    background: #eee;
    color: #444;
    border: 1px solid #bbb;
    border-bottom: 1px solid #aaa;
    background-image: linear-gradient(#fff 2%, #ddd 95%, #bbb 100%);
    border-radius: 0.25em;
    box-shadow: none;
  }
`;

/** Core AO3 Reversi (dark site skin) overrides */
const AO3_REVERSI_SITE_SKIN_CSS = `
  ${AO3_DEFAULT_SITE_SKIN_CSS}
  body, .group, .group .group, fieldset, .notice, textarea {
    background: #333;
    color: #eee;
    border-color: #222;
    box-shadow: none;
  }
  .group.listbox, fieldset fieldset.listbox, .group.listbox .index {
    background: #2a2a2a;
    border-color: #555;
  }
  .heading, .group .heading, #outer .group .heading {
    color: #fff;
    background: none;
    text-shadow: none;
  }
  .actions a, .action, .actions button, button {
    background: #555;
    border-color: #222;
    color: #eee;
    box-shadow: inset 0 -8px 4px #232323, inset 0 8px 7px #555;
    text-shadow: none;
  }
`;

describe("AO3 warning panel UI & content script integration", () => {
  beforeEach(async () => {
    await commands.emulateMedia({
      colorScheme: "light",
      reducedMotion: "no-preference",
      forcedColors: "none",
    });
    document.body.innerHTML = `
      <main>
        <h1>Post New Work</h1>
        <form id="work-form">
          <fieldset id="work-text">
            <legend>Work Text</legend>
            <p class="rtf-html-instructions note" id="work-text-notes">Plain text with limited HTML</p>
            <label for="work_chapter_attributes_content">Work Text</label>
            <textarea id="work_chapter_attributes_content" name="work[chapter_attributes][content]" aria-describedby="work-text-notes"></textarea>
          </fieldset>
        </form>
      </main>
    `;
  });

  test("injects the warning panel directly beneath the AO3 work HTML textarea and passes Axe accessibility checks in empty state", async () => {
    const instances = initAo3A11yHelper(document, { debounceMs: 0 });
    expect(instances).toHaveLength(1);

    const textarea = getRequiredElement(
      document,
      "#work_chapter_attributes_content",
      HTMLTextAreaElement
    );
    const nextSibling = textarea.nextElementSibling;

    expect(nextSibling).toBeInstanceOf(HTMLElement);
    if (nextSibling instanceof HTMLElement) {
      expect(nextSibling.classList.contains("ao3-a11y-panel")).toBe(true);
      expect(nextSibling.dataset["ao3A11yState"]).toBe("empty");
      expect(nextSibling.textContent).toContain("Ready to check HTML");
    }

    const results = await runAxe(document.body);
    expect(results).toHaveNoViolations();
  });

  test("renders warnings when HTML has violations, handles plural counts, updates live region across state transitions, and passes Axe in every UI state", async () => {
    initAo3A11yHelper(document, { debounceMs: 0 });

    const textarea = getRequiredElement(
      document,
      "#work_chapter_attributes_content",
      HTMLTextAreaElement
    );
    const panel = getRequiredElement(
      document,
      ".ao3-a11y-panel",
      HTMLElement
    );
    const liveRegion = getRequiredElement(
      panel,
      '[aria-live="polite"]',
      HTMLElement
    );

    expect(liveRegion.textContent).toBe("");

    // 1. Error + Warning state (2 errors, 2 warnings)
    textarea.value = [
      '<p><img src="banner1.png"><img src="banner2.png"></p>',
      "<p>***</p>",
      "<center>Scene 2</center>",
    ].join("\n");
    textarea.dispatchEvent(new Event("input"));

    expect(panel.dataset["ao3A11yState"]).toBe("error");
    expect(panel.textContent).toContain("2 errors, 2 warnings found");
    expect(liveRegion.textContent).toBe(
      "AO3 Accessibility Check: 2 errors, 2 warnings found."
    );

    const items = panel.querySelectorAll(".ao3-a11y-item");
    expect(items).toHaveLength(4);
    expect(items[0]?.getAttribute("data-rule-id")).toBe("img-missing-alt");
    expect(items[2]?.getAttribute("data-rule-id")).toBe("ascii-scene-break");
    expect(items[3]?.getAttribute("data-rule-id")).toBe("deprecated-tags");

    expect(await runAxe(document.body)).toHaveNoViolations();

    // 2. Warning-only state (1 warning)
    textarea.value =
      '<p><img src="banner1.png" alt="Starship in orbit"></p>\n<p>***</p>';
    textarea.dispatchEvent(new Event("input"));

    expect(panel.dataset["ao3A11yState"]).toBe("warning");
    expect(panel.textContent).toContain("1 warning found");
    expect(liveRegion.textContent).toBe(
      "AO3 Accessibility Check: 1 warning found."
    );
    expect(await runAxe(document.body)).toHaveNoViolations();

    // 3. Clean state (0 issues)
    textarea.value =
      '<p><img src="banner1.png" alt="Starship in orbit"></p>\n<hr>';
    textarea.dispatchEvent(new Event("input"));

    expect(panel.dataset["ao3A11yState"]).toBe("clean");
    expect(panel.textContent).toContain("No accessibility issues detected");
    expect(liveRegion.textContent).toBe(
      "AO3 Accessibility Check: No accessibility issues detected."
    );
    expect(panel.querySelectorAll(".ao3-a11y-item")).toHaveLength(0);
    expect(await runAxe(document.body)).toHaveNoViolations();

    // 4. Clearing back to empty resets liveRegion so subsequent clean text re-announces
    textarea.value = "   ";
    textarea.dispatchEvent(new Event("input"));
    expect(panel.dataset["ao3A11yState"]).toBe("empty");
    expect(liveRegion.textContent).toBe("");

    textarea.value = "<p>Fresh chapter paragraph.</p>";
    textarea.dispatchEvent(new Event("input"));
    expect(panel.dataset["ao3A11yState"]).toBe("clean");
    expect(liveRegion.textContent).toBe(
      "AO3 Accessibility Check: No accessibility issues detected."
    );
  });

  test("supports full keyboard navigation (Tab from textarea into 'Highlight in HTML' button, Enter to jump back and select source) and respects prefers-reduced-motion", async () => {
    const [instance] = initAo3A11yHelper(document, { debounceMs: 0 });

    const textarea = getRequiredElement(
      document,
      "#work_chapter_attributes_content",
      HTMLTextAreaElement
    );

    const scrollCalls: Array<ScrollIntoViewOptions | boolean | undefined> = [];
    const origScrollIntoView = textarea.scrollIntoView;
    Reflect.set(
      textarea,
      "scrollIntoView",
      (arg?: ScrollIntoViewOptions | boolean) => {
        scrollCalls.push(arg);
      }
    );

    try {
      textarea.value = '<p>Intro</p>\n<p><img src="portrait.png"></p>';
      textarea.dispatchEvent(new Event("input"));

      const jumpBtn = getRequiredElement(
        document,
        ".ao3-a11y-jump-btn",
        HTMLButtonElement
      );
      expect(jumpBtn.textContent).toContain("Line 2");

      // Focus textarea, then press Tab: focus must move into the panel's jump button
      // (verifying that blur/change does not tear down the DOM and drop focus to <body>)
      textarea.focus();
      await userEvent.tab();
      expect(document.activeElement).toBe(jumpBtn);

      // Even if runCheckNow() is forced while the jump button is focused, focus stays on the jump button
      instance?.runCheckNow();
      const refreshedJumpBtn = getRequiredElement(
        document,
        ".ao3-a11y-jump-btn",
        HTMLButtonElement
      );
      expect(document.activeElement).toBe(refreshedJumpBtn);

      // Activate button via keyboard Enter -> scrolls smoothly, focuses textarea, and selects the <img> tag
      await userEvent.keyboard("{Enter}");

      expect(document.activeElement).toBe(textarea);
      expect(scrollCalls).toHaveLength(1);
      expect(scrollCalls[0]).toEqual({
        behavior: "smooth",
        block: "center",
      });

      const selectedText = textarea.value.slice(
        textarea.selectionStart,
        textarea.selectionEnd
      );
      expect(selectedText).toBe('<img src="portrait.png">');

      // Emulate OS-level prefers-reduced-motion: reduce in the real browser -> instant ("auto") scroll
      await commands.emulateMedia({ reducedMotion: "reduce" });
      selectLocationInTextarea(textarea, 0, 12);
      expect(scrollCalls).toHaveLength(2);
      expect(scrollCalls[1]).toEqual({
        behavior: "auto",
        block: "center",
      });
    } finally {
      Reflect.set(textarea, "scrollIntoView", origScrollIntoView);
    }
  });

  test("also attaches to chapter edit textareas (#chapter_content), avoids duplicate panels, and passes Axe", async () => {
    document.body.innerHTML = `
      <main>
        <h1>Edit Chapter</h1>
        <label for="chapter_content">Chapter Text</label>
        <textarea id="chapter_content" name="chapter[content]">&lt;center&gt;Chapter 2&lt;/center&gt;</textarea>
      </main>
    `;

    const firstPass = initAo3A11yHelper(document, { debounceMs: 0 });
    const secondPass = initAo3A11yHelper(document, { debounceMs: 0 });

    expect(firstPass).toHaveLength(1);
    expect(secondPass[0]).toBe(firstPass[0]);
    expect(document.querySelectorAll(".ao3-a11y-panel")).toHaveLength(1);
    expect(document.querySelector(".ao3-a11y-panel")?.textContent).toContain(
      "Deprecated HTML tag (<center>)"
    );

    expect(await runAxe(document.body)).toHaveNoViolations();
  });

  test("debounces rapid typing events and cancels pending debounce on blur/change or destroy", async () => {
    const [instance] = initAo3A11yHelper(document, { debounceMs: 25 });
    expect(instance).toBeDefined();

    const textarea = getRequiredElement(
      document,
      "#work_chapter_attributes_content",
      HTMLTextAreaElement
    );
    const panel = getRequiredElement(
      document,
      ".ao3-a11y-panel",
      HTMLElement
    );

    // Trigger rapid input events within the debounce window
    textarea.value = '<p><img src="one.png"></p>';
    textarea.dispatchEvent(new Event("input"));

    textarea.value = "<p>***</p>";
    textarea.dispatchEvent(new Event("input"));

    // Panel has not updated yet while debounce timer is pending
    expect(panel.dataset["ao3A11yState"]).toBe("empty");

    // Wait for debounce + requestAnimationFrame
    await expect.poll(() => panel.dataset["ao3A11yState"]).toBe("warning");
    expect(panel.textContent).toContain("Non-semantic scene break");

    // Test fallback when requestAnimationFrame is unavailable
    const origRaf = globalThis.requestAnimationFrame;
    Reflect.set(globalThis, "requestAnimationFrame", undefined);
    try {
      textarea.value = '<p><img src="missing.png"></p>';
      textarea.dispatchEvent(new Event("input"));
      await expect.poll(() => panel.dataset["ao3A11yState"]).toBe("error");
    } finally {
      Reflect.set(globalThis, "requestAnimationFrame", origRaf);
    }

    // Trigger another debounced input, then immediately dispatch "blur" to flush synchronously
    textarea.value = "<p>Clean paragraph</p>";
    textarea.dispatchEvent(new Event("input"));
    textarea.dispatchEvent(new Event("blur"));
    expect(panel.dataset["ao3A11yState"]).toBe("clean");

    // Trigger another debounced input, then destroy the instance before timer fires
    textarea.value = '<p><img src="after-destroy.png"></p>';
    textarea.dispatchEvent(new Event("input"));
    instance?.destroy();

    expect(document.querySelector(".ao3-a11y-panel")).toBeNull();

    // Also verify cancelling a pending requestAnimationFrame callback on destroy
    const capturedCallbacks: FrameRequestCallback[] = [];
    const cancelledIds: number[] = [];
    const prevRaf = globalThis.requestAnimationFrame;
    const prevCancelRaf = globalThis.cancelAnimationFrame;
    Reflect.set(
      globalThis,
      "requestAnimationFrame",
      (cb: FrameRequestCallback) => {
        capturedCallbacks.push(cb);
        return 777;
      }
    );
    Reflect.set(globalThis, "cancelAnimationFrame", (id: number) => {
      cancelledIds.push(id);
    });

    try {
      const [rafInstance] = initAo3A11yHelper(document, { debounceMs: 10 });
      textarea.value = "<p>Pending RAF test</p>";
      textarea.dispatchEvent(new Event("input"));
      await expect.poll(() => capturedCallbacks.length).toBe(1);
      rafInstance?.destroy();
      expect(cancelledIds).toEqual([777]);
    } finally {
      Reflect.set(globalThis, "requestAnimationFrame", prevRaf);
      Reflect.set(globalThis, "cancelAnimationFrame", prevCancelRaf);
    }
  });

  test("renders fix buttons only for violations with a 100% statically determinable fix (fragile-archive-link and ascii-scene-break) and applies them to the textarea", async () => {
    initAo3A11yHelper(document, { debounceMs: 0 });

    const textarea = getRequiredElement(
      document,
      "#work_chapter_attributes_content",
      HTMLTextAreaElement
    );
    const panel = getRequiredElement(
      document,
      ".ao3-a11y-panel",
      HTMLElement
    );

    textarea.value = [
      '<p>Listen: <a href="https://ia803204.us.archive.org/16/items/my-podfic-2026/chapter-01.mp3">Chapter 1 Audio</a></p>',
      "<p>***</p>",
      '<p><img src="art.png"></p>',
    ].join("\n");
    textarea.dispatchEvent(new Event("input"));

    expect(panel.dataset["ao3A11yState"]).toBe("error");
    const items = panel.querySelectorAll<HTMLLIElement>(".ao3-a11y-item");
    expect(items).toHaveLength(3);

    // Item 1 (fragile-archive-link) has a fix button
    const archiveItem = getRequiredElement(
      panel,
      '.ao3-a11y-item[data-rule-id="fragile-archive-link"]',
      HTMLLIElement
    );
    const archiveFixBtn = getRequiredElement(
      archiveItem,
      ".ao3-a11y-fix-btn",
      HTMLButtonElement
    );
    expect(archiveFixBtn.textContent).toBe(
      "Replace with permanent archive.org link (Line 1)"
    );

    // Item 2 (ascii-scene-break) has a fix button
    const sceneBreakItem = getRequiredElement(
      panel,
      '.ao3-a11y-item[data-rule-id="ascii-scene-break"]',
      HTMLLIElement
    );
    const sceneBreakFixBtn = getRequiredElement(
      sceneBreakItem,
      ".ao3-a11y-fix-btn",
      HTMLButtonElement
    );
    expect(sceneBreakFixBtn.textContent).toBe(
      "Replace scene break with <hr> (Line 2)"
    );

    // Item 3 (img-missing-alt) does NOT have a statically determinable fix -> no fix button!
    const imgItem = getRequiredElement(
      panel,
      '.ao3-a11y-item[data-rule-id="img-missing-alt"]',
      HTMLLIElement
    );
    expect(imgItem.querySelector(".ao3-a11y-fix-btn")).toBeNull();
    expect(imgItem.querySelector(".ao3-a11y-jump-btn")).not.toBeNull();

    expect(
      await runAxe(document.body, {
        rules: { "target-size": { enabled: true } },
      })
    ).toHaveNoViolations();

    // 1. Click the archive.org replacement button
    archiveFixBtn.click();
    expect(textarea.value).toBe(
      [
        '<p>Listen: <a href="https://archive.org/download/my-podfic-2026/chapter-01.mp3">Chapter 1 Audio</a></p>',
        "<p>***</p>",
        '<p><img src="art.png"></p>',
      ].join("\n")
    );
    expect(document.activeElement).toBe(textarea);
    expect(
      textarea.value.slice(textarea.selectionStart, textarea.selectionEnd)
    ).toBe("https://archive.org/download/my-podfic-2026/chapter-01.mp3");

    // 2. Click the scene break replacement button on the updated panel
    const updatedSceneBreakFixBtn = getRequiredElement(
      panel,
      ".ao3-a11y-fix-btn",
      HTMLButtonElement
    );
    updatedSceneBreakFixBtn.click();
    expect(textarea.value).toBe(
      [
        '<p>Listen: <a href="https://archive.org/download/my-podfic-2026/chapter-01.mp3">Chapter 1 Audio</a></p>',
        "<hr>",
        '<p><img src="art.png"></p>',
      ].join("\n")
    );
    expect(
      textarea.value.slice(textarea.selectionStart, textarea.selectionEnd)
    ).toBe("<hr>");

    // Only the non-auto-fixable img-missing-alt warning remains, with 0 fix buttons
    expect(panel.querySelectorAll(".ao3-a11y-item")).toHaveLength(1);
    expect(panel.querySelectorAll(".ao3-a11y-fix-btn")).toHaveLength(0);
  });

  test("warning panel handles warnings without source locations or snippets and passes Axe", async () => {
    const textarea = getRequiredElement(
      document,
      "#work_chapter_attributes_content",
      HTMLTextAreaElement
    );
    const panel = createWarningPanel(textarea);

    panel.update(
      [
        {
          ruleId: "img-missing-alt",
          severity: "error",
          title: "Custom diagnostic without location",
          message: "Explanation message",
          suggestion: "Fix suggestion",
          snippet: "",
          fix: {
            label: "Apply custom fix",
            startOffset: 0,
            endOffset: 3,
            replacement: "<p>",
          },
        },
      ],
      "<p>Non-empty HTML</p>"
    );

    expect(panel.element.dataset["ao3A11yState"]).toBe("error");
    expect(panel.element.querySelector(".ao3-a11y-jump-btn")).toBeNull();
    expect(panel.element.querySelector(".ao3-a11y-fix-btn")?.textContent).toBe(
      "Apply custom fix"
    );
    expect(panel.element.querySelector(".ao3-a11y-snippet")).toBeNull();

    expect(await runAxe(document.body)).toHaveNoViolations();

    panel.destroy();
    expect(document.querySelector(".ao3-a11y-panel")).toBeNull();
  });

  test("adapts panel heading level to surrounding AO3 page headings (including edge cases) and passes Axe when all 10 rules render simultaneously", async () => {
    // Edge case 1: No headings before textarea, only a heading after textarea -> defaults to h2
    document.body.innerHTML = `
      <main>
        <label for="work_chapter_attributes_content">Work Text</label>
        <textarea id="work_chapter_attributes_content"></textarea>
        <h4>Heading After Textarea</h4>
      </main>
    `;
    let textarea = getRequiredElement(
      document,
      "#work_chapter_attributes_content",
      HTMLTextAreaElement
    );
    expect(resolvePanelHeadingTag(textarea)).toBe("h2");

    // Edge case 2: Preceding h6 -> clamps to h6
    document.body.innerHTML = `
      <main>
        <h6>Deep Heading</h6>
        <textarea id="work_chapter_attributes_content"></textarea>
      </main>
    `;
    textarea = getRequiredElement(
      document,
      "#work_chapter_attributes_content",
      HTMLTextAreaElement
    );
    expect(resolvePanelHeadingTag(textarea)).toBe("h6");

    // Standard AO3 heading hierarchy (h1 site header -> h2 page title -> h3 landmark -> h4 field landmark -> h5 panel)
    document.body.innerHTML = `
      <header>
        <h1>Archive of Our Own</h1>
      </header>
      <main>
        <h2>Post New Work</h2>
        <h3>Work Preface</h3>
        <h4>Work Text</h4>
        <form id="work-form">
          <label for="work_chapter_attributes_content">Work Text</label>
          <textarea id="work_chapter_attributes_content" name="work[chapter_attributes][content]"></textarea>
        </form>
      </main>
    `;

    textarea = getRequiredElement(
      document,
      "#work_chapter_attributes_content",
      HTMLTextAreaElement
    );
    expect(resolvePanelHeadingTag(textarea)).toBe("h5");

    initAo3A11yHelper(document, { debounceMs: 0 });

    // Trigger all 10 rule categories in the UI at once
    textarea.value = [
      '<p><img src="missing-alt.png"><img src="bad-alt.png" alt="IMG_001.JPG"></p>',
      "<p>***</p>",
      "<h2>Section</h2><h4>Skipped h3</h4>",
      '<p><a href="https://example.com">click here</a></p>',
      "<p>Para 1<br><br>Para 2</p>",
      "<table><tr><td>Cell</td></tr></table>",
      "<details><p>Hidden without summary</p></details>",
      "<center>Deprecated center</center>",
      "<p><abbr>AO3</abbr></p>",
    ].join("\n");
    textarea.dispatchEvent(new Event("input"));

    const panel = getRequiredElement(
      document,
      ".ao3-a11y-panel",
      HTMLElement
    );
    expect(panel.querySelector("h5.ao3-a11y-title")).not.toBeNull();
    expect(
      panel.querySelectorAll(".ao3-a11y-item").length
    ).toBeGreaterThanOrEqual(10);

    const axeResults = await runAxe(document.body, {
      rules: {
        "target-size": { enabled: true },
      },
    });
    expect(axeResults).toHaveNoViolations();

    // Verify real browser fidelity: axe-core actually ran color-contrast and target-size checks
    const passedRuleIds = axeResults.passes.map((rule) => rule.id);
    expect(passedRuleIds).toContain("color-contrast");
    expect(passedRuleIds).toContain("target-size");

    // Verify real layout bounding box of the interactive button meets WCAG 2.5.8 (>= 24x24 CSS px)
    const jumpButton = getRequiredElement(
      panel,
      ".ao3-a11y-jump-btn",
      HTMLButtonElement
    );
    const rect = jumpButton.getBoundingClientRect();
    expect(rect.width).toBeGreaterThanOrEqual(24);
    expect(rect.height).toBeGreaterThanOrEqual(24);
  });

  test("inherits AO3 Site Skin styles (Default Light Skin even under OS dark mode, and Reversi Dark Skin) and passes Axe color-contrast and target-size checks", async () => {
    const skinStyle = document.createElement("style");
    document.head.appendChild(skinStyle);

    try {
      initAo3A11yHelper(document, { debounceMs: 0 });
      const textarea = getRequiredElement(
        document,
        "#work_chapter_attributes_content",
        HTMLTextAreaElement
      );
      const panel = getRequiredElement(
        document,
        ".ao3-a11y-panel",
        HTMLElement
      );

      // Verify panel uses AO3's native .listbox.group and .index.group classes
      expect(panel.classList.contains("listbox")).toBe(true);
      expect(panel.classList.contains("group")).toBe(true);

      // 1. AO3 Default Site Skin while OS prefers-color-scheme is DARK (the exact scenario that previously broke contrast!)
      skinStyle.textContent = AO3_DEFAULT_SITE_SKIN_CSS;
      await commands.emulateMedia({ colorScheme: "dark" });

      textarea.value =
        '<p><img src="art.png"></p>\n<p><a href="https://ia803204.us.archive.org/16/items/podfic/ch1.mp3">Listen</a></p>';
      textarea.dispatchEvent(new Event("input"));

      let jumpButton = getRequiredElement(
        document,
        ".ao3-a11y-jump-btn",
        HTMLButtonElement
      );
      expect(jumpButton.classList.contains("action")).toBe(true);
      // Button uses AO3 Default skin's #444 text color instead of forcing white text over AO3's light gradient
      expect(window.getComputedStyle(jumpButton).color).toBe("rgb(68, 68, 68)");

      expect(
        await runAxe(document.body, {
          rules: { "target-size": { enabled: true } },
        })
      ).toHaveNoViolations();

      // 2. AO3 Reversi (Dark) Site Skin across all states (error/warning, warning-only, clean, empty)
      skinStyle.textContent = AO3_REVERSI_SITE_SKIN_CSS;

      jumpButton = getRequiredElement(
        document,
        ".ao3-a11y-jump-btn",
        HTMLButtonElement
      );
      // Button inherits Reversi's #555 background and #eee text color
      expect(window.getComputedStyle(jumpButton).backgroundColor).toBe(
        "rgb(85, 85, 85)"
      );
      expect(window.getComputedStyle(jumpButton).color).toBe(
        "rgb(238, 238, 238)"
      );

      const reversiErrorAxe = await runAxe(document.body, {
        rules: { "target-size": { enabled: true } },
      });
      expect(reversiErrorAxe).toHaveNoViolations();
      expect(reversiErrorAxe.passes.map((r) => r.id)).toContain(
        "color-contrast"
      );

      // Reversi - Warning state
      textarea.value = "<p>***</p>";
      textarea.dispatchEvent(new Event("input"));
      expect(await runAxe(document.body)).toHaveNoViolations();

      // Reversi - Clean state
      textarea.value = "<p>Accessible dark mode story.</p>";
      textarea.dispatchEvent(new Event("input"));
      expect(await runAxe(document.body)).toHaveNoViolations();

      // Reversi - Empty state
      textarea.value = "";
      textarea.dispatchEvent(new Event("input"));
      expect(await runAxe(document.body)).toHaveNoViolations();
    } finally {
      skinStyle.remove();
    }
  });

  test("renders responsively on a Firefox for Android mobile viewport (360x640) with >=44px touch targets and passes Axe", async () => {
    await page.viewport(360, 640);
    try {
      initAo3A11yHelper(document, { debounceMs: 0 });

      const textarea = getRequiredElement(
        document,
        "#work_chapter_attributes_content",
        HTMLTextAreaElement
      );

      textarea.value =
        '<p><img src="https://archiveofourown.org/images/extremely-long-image-path-for-mobile-wrapping-test.png"></p>';
      textarea.dispatchEvent(new Event("input"));

      const panel = getRequiredElement(
        document,
        ".ao3-a11y-panel",
        HTMLElement
      );
      const panelRect = panel.getBoundingClientRect();
      expect(panelRect.width).toBeLessThanOrEqual(360);

      const jumpButton = getRequiredElement(
        panel,
        ".ao3-a11y-jump-btn",
        HTMLButtonElement
      );
      const btnRect = jumpButton.getBoundingClientRect();
      expect(btnRect.height).toBeGreaterThanOrEqual(44);

      const axeResults = await runAxe(document.body, {
        rules: {
          "target-size": { enabled: true },
        },
      });
      expect(axeResults).toHaveNoViolations();
    } finally {
      await page.viewport(1280, 720);
    }
  });

  test("preserves AO3 LiveValidation error message layout below the work textarea without overlapping the panel", async () => {
    await page.viewport(1280, 720);
    const ao3FormStyle = document.createElement("style");
    ao3FormStyle.textContent = `
      ${AO3_DEFAULT_SITE_SKIN_CSS}
      h4 { font-size: 1.143em; line-height: 1.125; margin: 0.5em 0; }
      .landmark { font-size: 0; opacity: 0; }
      input, textarea {
        font: 100% 'Lucida Grande', 'Lucida Sans Unicode', Verdana, Helvetica, sans-serif;
        width: 100%;
        border: 1px solid #bbb;
        box-shadow: inset 0 1px 2px #ccc;
      }
      textarea { min-height: 12em; }
      textarea.large { height: 36em; }
      .post .text textarea { clear: right; }
      form p { clear: right; margin: auto; padding: 0.643em; }
      p.character_counter { font-size: 87.5%; text-align: right; }
      .LV_validation_message {
        font-weight: 900;
        position: absolute;
        margin-top: 0.643em;
        margin-right: 15em;
        z-index: 1;
      }
      .LV_invalid {
        background: #efd1d1;
        border: 1px solid #900;
        color: #900;
        padding: 0.25em 0.375em;
        box-shadow: 1px 1px 2px;
        border-radius: 0.25em;
      }
      .LV_invalid:before {
        border-color: #900 transparent;
        border-style: solid;
        border-width: 0 0.643em 0.643em;
        content: "";
        left: 0.875em;
        position: absolute;
        top: -0.643em;
      }
    `;
    document.head.appendChild(ao3FormStyle);
    try {
      document.body.innerHTML = `
        <main>
          <h1>Post New Work</h1>
          <div id="work-form" class="verbose post work">
            <form>
              <fieldset class="work text">
                <legend class="required">Work Text*</legend>
                <div class="rtf-html-field">
                  <h2 class="landmark heading">Work Text*</h2>
                  <label for="content" class="landmark">Work Text</label>
                  <textarea class="mce-editor observe_textlength large" id="content" name="work[chapter_attributes][content]"></textarea>
                  <span class="LV_validation_message LV_valid" role="alert" id="content_LV_validation_message"></span>
                  <script type="text/javascript"></script>
                  <p class="character_counter" tabindex="0"><span id="content_counter">500000</span> characters left</p>
                </div>
              </fieldset>
            </form>
          </div>
        </main>
      `;

      const textarea = getRequiredElement(
        document,
        "#content",
        HTMLTextAreaElement
      );
      const counter = getRequiredElement(
        document,
        ".character_counter",
        HTMLElement
      );

      initAo3A11yHelper(document, { debounceMs: 0 });

      const panel = getRequiredElement(
        document,
        ".ao3-a11y-panel",
        HTMLElement
      );

      // Panel must be mounted after .character_counter so LiveValidation's
      // removeMessage() still finds span.LV_validation_message as textarea.nextElementSibling
      expect(counter.nextElementSibling).toBe(panel);
      expect(
        textarea.nextElementSibling?.classList.contains("LV_validation_message")
      ).toBe(true);

      // Simulate AO3 LiveValidation removeMessage() + insertMessage() when field fails validation
      if (
        textarea.nextElementSibling?.classList.contains("LV_validation_message")
      ) {
        textarea.nextElementSibling.remove();
      }
      const lvInvalid = document.createElement("span");
      lvInvalid.className = "LV_validation_message LV_invalid";
      lvInvalid.id = "content_LV_validation_message";
      lvInvalid.setAttribute("role", "alert");
      lvInvalid.textContent =
        "Brevity is the soul of wit, but your content does have to be at least 10 characters long.";
      textarea.parentNode?.insertBefore(lvInvalid, textarea.nextSibling);

      const taRect = textarea.getBoundingClientRect();
      const lvRect = lvInvalid.getBoundingClientRect();
      const counterRect = counter.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();

      // Validation message must sit below the bottom-left of the textarea (not off to the right edge in Firefox)
      expect(Math.abs(lvRect.left - taRect.left)).toBeLessThanOrEqual(2);
      expect(lvRect.top).toBeGreaterThanOrEqual(taRect.bottom);
      expect(lvRect.width).toBeGreaterThan(200);

      // Warning panel must clear both the validation message and the character counter without overlapping
      expect(panelRect.top).toBeGreaterThanOrEqual(lvRect.bottom);
      expect(panelRect.top).toBeGreaterThanOrEqual(counterRect.bottom);

      expect(await runAxe(document.body)).toHaveNoViolations();
    } finally {
      ao3FormStyle.remove();
    }
  });
});
