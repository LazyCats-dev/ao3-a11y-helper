import { describe, expect, test } from "vitest";
import { checkHeadings } from "../src/linter/rules/headings.ts";
import { checkImages } from "../src/linter/rules/images.ts";
import {
  checkLinks,
  parseFragileArchiveUrl,
} from "../src/linter/rules/links.ts";
import { createLintContext } from "./setup.ts";

describe("checkImages rule", () => {
  test("passes valid descriptive alt text and decorative empty alt", () => {
    const ctx = createLintContext(
      '<p><img src="cover.png" alt="Two astronauts holding hands in orbit"></p>' +
        '<p><img src="divider.png" alt=""></p>'
    );
    expect(checkImages(ctx)).toEqual([]);
  });

  test("flags <img> missing alt attribute as an error", () => {
    const ctx = createLintContext('<p><img src="chapter-banner.png"></p>');
    const warnings = checkImages(ctx);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.ruleId).toBe("img-missing-alt");
    expect(warnings[0]?.severity).toBe("error");
    expect(warnings[0]?.location?.line).toBe(1);
  });

  test("flags whitespace-only, filename, URL, generic, and redundant prefix alt text", () => {
    const ctx = createLintContext(
      [
        '<img src="1.png" alt="   ">',
        '<img src="2.png" alt="IMG_4021.JPG">',
        '<img src="3.png" alt="https://example.com/banner.webp">',
        '<img src="4.png" alt="fanart.">',
        '<img src="5.png" alt="Image of a castle in the snow">',
      ].join("\n")
    );
    const warnings = checkImages(ctx);
    expect(warnings).toHaveLength(5);
    expect(warnings.map((w) => w.ruleId)).toEqual([
      "img-suspicious-alt",
      "img-suspicious-alt",
      "img-suspicious-alt",
      "img-suspicious-alt",
      "img-suspicious-alt",
    ]);
    expect(warnings.map((w) => w.location?.line)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("checkLinks rule", () => {
  test("passes descriptive links and named anchor targets (both empty and with text)", () => {
    const ctx = createLintContext(
      '<p><a id="top"></a><a name="fn1">1</a>Read <a href="https://archiveofourown.org/works/123">Part 2 of the series</a> or <a href="https://example.com"><img src="btn.png" alt="Listen to the podfic"></a>.</p>'
    );
    expect(checkLinks(ctx)).toEqual([]);
  });

  test("flags links missing href, links with empty href, and links with no accessible text", () => {
    const ctx = createLintContext(
      [
        "<a>Unlinked text</a>",
        '<a href="   ">Empty href link</a>',
        '<a href="https://example.com"></a>',
        '<a href="https://example.com"><img src="art.png" alt=""></a>',
      ].join("\n")
    );
    const warnings = checkLinks(ctx);
    expect(warnings).toHaveLength(4);
    expect(warnings[0]?.title).toContain("missing an href");
    expect(warnings[0]?.severity).toBe("warning");
    expect(warnings[1]?.title).toContain("empty href");
    expect(warnings[1]?.severity).toBe("error");
    expect(warnings[2]?.title).toContain("no accessible text");
    expect(warnings[2]?.severity).toBe("error");
    expect(warnings[3]?.title).toContain("no accessible text");
    expect(warnings[3]?.severity).toBe("error");
  });

  test("flags vague link phrases (including combined <img alt> + text in DOM order) and raw URL link text", () => {
    const ctx = createLintContext(
      [
        '<p>For the art, <a href="https://example.com/art">click here!</a></p>',
        '<p>Or <a href="https://example.com/bonus"><img src="icon.png" alt="Click"> here</a></p>',
        '<p>Or visit <a href="https://example.com/post">https://example.com/post</a>.</p>',
      ].join("\n")
    );
    const warnings = checkLinks(ctx);
    expect(warnings).toHaveLength(3);
    expect(warnings[0]?.severity).toBe("warning");
    expect(warnings[0]?.title).toContain("click here!");
    expect(warnings[1]?.severity).toBe("warning");
    expect(warnings[1]?.title).toContain("Click here");
    expect(warnings[2]?.severity).toBe("warning");
    expect(warnings[2]?.title).toContain("raw URL");
  });

  test("identifies fragile archive.org links in [href] and [src] attributes and provides exact replacement fixes", () => {
    expect(parseFragileArchiveUrl("")).toBeUndefined();
    expect(parseFragileArchiveUrl("not-a-valid-url")).toBeUndefined();
    expect(
      parseFragileArchiveUrl(
        "https://archive.org/download/my-podfic/chapter1.mp3"
      )
    ).toBeUndefined();
    expect(
      parseFragileArchiveUrl("https://archive.org/details/my-podfic")
    ).toBeUndefined();

    const parsed = parseFragileArchiveUrl(
      "https://ia803204.us.archive.org/16/items/my-podfic/chapter1.mp3"
    );
    expect(parsed).toEqual({
      originalUrl:
        "https://ia803204.us.archive.org/16/items/my-podfic/chapter1.mp3",
      permanentUrl: "https://archive.org/download/my-podfic/chapter1.mp3",
      detailsUrl: "https://archive.org/details/my-podfic",
    });

    const html = [
      '<p><a href="https://ia803204.us.archive.org/16/items/my-podfic/chapter1.mp3">Download Podfic MP3</a></p>',
      "<p><img src='https://dn720004.ca.archive.org/0/items/my-fanart/sub/cover.png' alt='Cover illustration'></p>",
      "<p><audio src=http://ia601500.us.archive.org/22/items/audio-work/track01.mp3 controls></audio></p>",
      '<p><a href="https://archive.org/download/my-podfic/chapter1.mp3">Permanent Podfic Link</a></p>',
    ].join("\n");

    const ctx = createLintContext(html);
    const warnings = checkLinks(ctx);
    expect(warnings).toHaveLength(3);
    expect(warnings.every((w) => w.ruleId === "fragile-archive-link")).toBe(
      true
    );

    // Verify 1st fix (double-quoted href)
    const fix0 = warnings[0]?.fix;
    expect(fix0).toBeDefined();
    if (fix0) {
      expect(html.slice(fix0.startOffset, fix0.endOffset)).toBe(
        "https://ia803204.us.archive.org/16/items/my-podfic/chapter1.mp3"
      );
      expect(fix0.replacement).toBe(
        "https://archive.org/download/my-podfic/chapter1.mp3"
      );
    }

    // Verify 2nd fix (single-quoted src)
    const fix1 = warnings[1]?.fix;
    expect(fix1).toBeDefined();
    if (fix1) {
      expect(html.slice(fix1.startOffset, fix1.endOffset)).toBe(
        "https://dn720004.ca.archive.org/0/items/my-fanart/sub/cover.png"
      );
      expect(fix1.replacement).toBe(
        "https://archive.org/download/my-fanart/sub/cover.png"
      );
    }

    // Verify 3rd fix (unquoted src)
    const fix2 = warnings[2]?.fix;
    expect(fix2).toBeDefined();
    if (fix2) {
      expect(html.slice(fix2.startOffset, fix2.endOffset)).toBe(
        "http://ia601500.us.archive.org/22/items/audio-work/track01.mp3"
      );
      expect(fix2.replacement).toBe(
        "https://archive.org/download/audio-work/track01.mp3"
      );
    }
  });
});

describe("checkHeadings rule", () => {
  test("passes sequential non-empty headings and headings containing an <img> with descriptive alt text", () => {
    const ctx = createLintContext(
      '<h2><img src="ch1.png" alt="Act I: The Departure"></h2>\n<h3>Scene 1</h3>\n<h3>Scene 2</h3>\n<h2>Act II</h2>'
    );
    expect(checkHeadings(ctx)).toEqual([]);
  });

  test("flags empty headings (including headings with only decorative alt=\"\" images) and skipped heading levels", () => {
    const ctx = createLintContext(
      '<h2>Part One</h2>\n<h4>Subsection</h4>\n<h3><img src="ornament.png" alt=""></h3>'
    );
    const warnings = checkHeadings(ctx);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]?.ruleId).toBe("heading-hierarchy");
    expect(warnings[0]?.severity).toBe("warning");
    expect(warnings[0]?.title).toContain("<h2> to <h4>");
    expect(warnings[0]?.location?.line).toBe(2);

    expect(warnings[1]?.ruleId).toBe("heading-hierarchy");
    expect(warnings[1]?.severity).toBe("error");
    expect(warnings[1]?.title).toContain("Empty heading (<h3>)");
    expect(warnings[1]?.location?.line).toBe(3);
  });
});
