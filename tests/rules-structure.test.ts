import { describe, expect, test } from "vitest";
import { analyzeHtml, RULE_IDS } from "../src/linter/index.ts";
import { checkDetails } from "../src/linter/rules/details.ts";
import { checkParagraphs } from "../src/linter/rules/paragraphs.ts";
import { checkSceneBreaks } from "../src/linter/rules/scene-breaks.ts";
import { checkSemantics } from "../src/linter/rules/semantics.ts";
import { checkTables } from "../src/linter/rules/tables.ts";
import { createLintContext } from "./setup.ts";

describe("checkSceneBreaks rule", () => {
  test("passes semantic <hr>, standard dialogue ellipses (3-5 dots), HTML comments, <pre>, and <code> blocks", () => {
    const ctx = createLintContext(
      [
        "<p>First scene.</p>",
        "<hr>",
        "<p>...</p>",
        "<p>....</p>",
        "<p>…</p>",
        "<p>……</p>",
        "<p>. . .</p>",
        "<p>. . . .</p>",
        "<!-- *** commented out divider *** -->",
        "<pre>\n---\ncode block\n---\n</pre>",
        "<code>***</code>",
        "<p>Second scene.</p>",
      ].join("\n")
    );
    expect(checkSceneBreaks(ctx)).toEqual([]);
  });

  test("flags standalone, same-line, &nbsp;-separated, and dotted scene dividers, provides <hr> fixes for closed/balanced dividers, and omits fix for unclosed tags", () => {
    const longDivider = `<p>${"*".repeat(90)}</p>`;
    const html = [
      "<p>Scene 1</p>",
      "<p>***</p>",
      "<p>Scene 2</p><p>---</p><p>Scene 3</p>",
      "~ * ~ * ~",
      "<center>♦ ♦ ♦</center>",
      "<p>*&nbsp;*&nbsp;*</p>",
      "<p>..........</p>",
      longDivider,
      "<em>* * *</em>",
      "<em>* * *",
      "<p>***\n<p>Scene after unclosed p</p>",
    ].join("\n");
    const ctx = createLintContext(html);
    const warnings = checkSceneBreaks(ctx);
    expect(warnings).toHaveLength(10);
    expect(warnings.every((w) => w.ruleId === "ascii-scene-break")).toBe(true);
    expect(warnings.map((w) => w.location?.line)).toEqual([
      2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
    expect(warnings[6]?.snippet.length).toBeLessThanOrEqual(80);
    expect(warnings[6]?.snippet.endsWith("...")).toBe(true);

    // Closed blocks and balanced inline lines have deterministic <hr> fixes
    expect(warnings[0]?.fix).toBeDefined();
    if (warnings[0]?.fix) {
      expect(
        html.slice(warnings[0].fix.startOffset, warnings[0].fix.endOffset)
      ).toBe("<p>***</p>");
      expect(warnings[0].fix.replacement).toBe("<hr>");
    }

    // Same-line <p>---</p> between paragraphs replaces only <p>---</p>
    expect(warnings[1]?.fix).toBeDefined();
    if (warnings[1]?.fix) {
      expect(
        html.slice(warnings[1].fix.startOffset, warnings[1].fix.endOffset)
      ).toBe("<p>---</p>");
      expect(warnings[1].fix.replacement).toBe("<hr>");
    }

    // Bare line ~ * ~ * ~ and balanced <em>* * *</em> have deterministic <hr> fixes
    expect(warnings[2]?.fix?.replacement).toBe("<hr>");
    expect(warnings[7]?.fix?.replacement).toBe("<hr>");

    // Unbalanced inline tag (line 10: `<em>* * *`) and unclosed `<p>***` (line 11) must NOT offer a fix
    expect(warnings[8]?.fix).toBeUndefined();
    expect(warnings[9]?.fix).toBeUndefined();
  });
});

describe("checkParagraphs rule", () => {
  test("passes single <br> for poetry/addresses, comments, and <br> inside <pre> or <code>", () => {
    const ctx = createLintContext(
      "<p>Line 1<br>Line 2</p>\n<!-- <br><br> -->\n<pre>Code<br><br>Block</pre>\n<code>inline<br><br>code</code>"
    );
    expect(checkParagraphs(ctx)).toEqual([]);
  });

  test("flags consecutive <br><br> used as paragraph breaks", () => {
    const ctx = createLintContext(
      "<p>First paragraph.<br>\n<br />Second paragraph.</p>"
    );
    const warnings = checkParagraphs(ctx);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.ruleId).toBe("double-br-paragraphs");
    expect(warnings[0]?.location?.line).toBe(1);
  });
});

describe("checkTables rule", () => {
  test("passes accessible data tables with <caption> and <th scope>", () => {
    const ctx = createLintContext(
      `<table>
        <caption>Character Status</caption>
        <thead>
          <tr><th scope="col">Name</th><th scope="col">Role</th></tr>
        </thead>
        <tbody>
          <tr><th scope="row">Alex</th><td>Pilot</td></tr>
        </tbody>
      </table>`
    );
    expect(checkTables(ctx)).toEqual([]);
  });

  test("flags tables missing <th> headers, tables with empty <th> headers, or tables missing caption/scope", () => {
    const ctx = createLintContext(
      [
        "<table><tr><td>Layout cell 1</td><td>Layout cell 2</td></tr></table>",
        '<table><caption>Stats</caption><tr><th scope="col"></th><th scope="col">Score</th></tr><tr><td>A</td><td>10</td></tr></table>',
        "<table><tr><th>Name</th></tr><tr><td>Sam</td></tr></table>",
      ].join("\n")
    );
    const warnings = checkTables(ctx);
    expect(warnings).toHaveLength(3);
    expect(warnings[0]?.title).toContain("missing header cells");
    expect(warnings[1]?.title).toContain("empty header cell");
    expect(warnings[2]?.title).toContain("<caption> and <th scope>");
  });
});

describe("checkDetails rule", () => {
  test("passes <details> with non-empty <summary> (text or <img alt>) as first child and no heading inside summary", () => {
    const ctx = createLintContext(
      [
        "<details><summary>Content Notes</summary><p>Spoilers inside.</p></details>",
        '<details><summary><img src="banner.png" alt="Expand Content Warnings"></summary><p>Spoilers inside.</p></details>',
      ].join("\n")
    );
    expect(checkDetails(ctx)).toEqual([]);
  });

  test("flags missing summary (pointing to <details>) and out-of-order, empty, or heading-containing <summary> (pointing to <summary>)", () => {
    const html = [
      "<details><p>No summary here</p></details>",
      "<details>\n  <p>Before summary</p>\n  <summary>Out of order label</summary>\n</details>",
      "<details><summary>   </summary><p>Empty summary</p></details>",
      "<details><summary><h3>Chapter Warnings</h3></summary><p>Text</p></details>",
    ].join("\n");
    const ctx = createLintContext(html);
    const warnings = checkDetails(ctx);
    expect(warnings).toHaveLength(4);
    expect(warnings[0]?.severity).toBe("error");
    expect(warnings[0]?.title).toContain("missing a <summary>");
    expect(warnings[0]?.location?.line).toBe(1);

    // Out-of-order summary is on line 4 (not line 2 where <details> starts)
    expect(warnings[1]?.severity).toBe("warning");
    expect(warnings[1]?.title).toContain("first child");
    expect(warnings[1]?.location?.line).toBe(4);

    expect(warnings[2]?.severity).toBe("error");
    expect(warnings[2]?.title).toContain("empty");
    expect(warnings[3]?.severity).toBe("warning");
    expect(warnings[3]?.title).toContain("<h3>");
  });
});

describe("checkSemantics rule", () => {
  test("passes semantic tags and <abbr> with title", () => {
    const ctx = createLintContext(
      '<p>Welcome to <abbr title="Archive of Our Own">AO3</abbr>! <strong>Bold</strong> and <code>monospace</code>.</p>'
    );
    expect(checkSemantics(ctx)).toEqual([]);
  });

  test("flags all deprecated presentational tags (<center>, <font>, <big>, <strike>, <tt>) and <abbr>/<acronym> missing title", () => {
    const ctx = createLintContext(
      [
        "<center>Centered text</center>",
        '<p><font color="red">Warning</font> <big>Big</big> <strike>Old</strike> <tt>Mono</tt></p>',
        "<p><abbr>AU</abbr> and <acronym>OOC</acronym></p>",
      ].join("\n")
    );
    const warnings = checkSemantics(ctx);
    expect(warnings).toHaveLength(7);
    expect(warnings.map((w) => w.ruleId)).toEqual([
      "deprecated-tags",
      "deprecated-tags",
      "deprecated-tags",
      "deprecated-tags",
      "deprecated-tags",
      "abbr-missing-title",
      "abbr-missing-title",
    ]);
  });
});

describe("analyzeHtml integration & AO3 sanitizer invariants", () => {
  test("returns empty array for empty or accessible HTML", () => {
    expect(analyzeHtml("")).toEqual([]);
    expect(analyzeHtml("   \n  ")).toEqual([]);
    expect(
      analyzeHtml(
        '<p>A clean chapter with an <img src="divider.png" alt=""> and a semantic scene break.</p><hr><p>End of chapter.</p>'
      )
    ).toEqual([]);
  });

  test("sorts warnings in document order and is resilient to unbalanced closing tags like </div>", () => {
    const html = [
      '</div><center>Chapter 1</center>',
      '<p><img src="art.png"></p>',
      "<p>***</p>",
      '<p>Read <a href="https://example.com">here</a>.</p>',
    ].join("\n");

    const warnings = analyzeHtml(html);
    expect(warnings.map((w) => w.ruleId)).toEqual([
      "deprecated-tags",
      "img-missing-alt",
      "ascii-scene-break",
      "link-text-clarity",
    ]);
    expect(warnings.map((w) => w.location?.line)).toEqual([1, 2, 3, 4]);
  });

  test("AO3 Sanitizer Compatibility Invariant: exercises every RuleId and verifies no suggestion ever recommends aria-*, role, or inline style attributes", () => {
    const kitchenSinkHtml = [
      '<img src="missing.png">',
      '<img src="space.png" alt=" ">',
      '<img src="file.png" alt="IMG_1234.png">',
      '<img src="generic.png" alt="fanart">',
      '<img src="redundant.png" alt="Image of a dragon">',
      "<a>No href</a>",
      '<a href="">Empty href</a>',
      '<a href="https://example.com"></a>',
      '<a href="https://example.com">click here</a>',
      '<a href="https://example.com">https://example.com</a>',
      '<a href="https://ia803204.us.archive.org/16/items/podfic/ch1.mp3">Listen to Podfic</a>',
      "<h2></h2>",
      "<h2>Title</h2><h4>Skipped</h4>",
      "<p>***</p>",
      "<p>Line 1<br><br>Line 2</p>",
      "<table><tr><td>No headers</td></tr></table>",
      "<table><tr><th></th></tr></table>",
      "<table><tr><th>Missing scope and caption</th></tr></table>",
      "<details><p>Missing summary</p></details>",
      "<details><p>Before</p><summary>After</summary></details>",
      "<details><summary></summary></details>",
      "<details><summary><h3>Heading in summary</h3></summary></details>",
      "<center>Center</center><font>Font</font><big>Big</big><strike>Strike</strike><tt>TT</tt>",
      "<abbr>AO3</abbr><acronym>WIP</acronym>",
    ].join("\n");

    const warnings = analyzeHtml(kitchenSinkHtml);
    const triggeredRuleIds = new Set(warnings.map((w) => w.ruleId));
    expect(triggeredRuleIds).toEqual(new Set(RULE_IDS));
    expect(warnings.length).toBeGreaterThanOrEqual(24);

    for (const warning of warnings) {
      expect(warning.suggestion).not.toMatch(/\baria-[a-z]+=/i);
      expect(warning.suggestion).not.toMatch(/\brole\s*=/i);
      expect(warning.suggestion).not.toMatch(/\bstyle\s*=/i);

      if (
        warning.ruleId === "fragile-archive-link" ||
        warning.ruleId === "ascii-scene-break"
      ) {
        expect(warning.fix).toBeDefined();
      } else {
        expect(warning.fix).toBeUndefined();
      }
    }
  });
});
