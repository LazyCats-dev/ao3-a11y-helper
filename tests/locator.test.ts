import { describe, expect, test } from "vitest";
import {
  createLintContext,
  createSourceIndex,
  findNthTagLocation,
  formatElementSnippet,
  getAccessibleText,
  offsetToLocation,
} from "../src/linter/source-locator.ts";

describe("source-locator & element-text", () => {
  test("offsetToLocation and createSourceIndex calculate 1-based line/column numbers and clamp out-of-bounds offsets", () => {
    const html = '<p>First line</p>\n<p>Second <img src="a.png"> line</p>';
    const imgStart = html.indexOf("<img");
    const imgEnd = html.indexOf(">", imgStart) + 1;

    const loc = offsetToLocation(html, imgStart, imgEnd);
    expect(loc).toEqual({
      startOffset: imgStart,
      endOffset: imgEnd,
      line: 2,
      column: 11,
    });

    const clamped = createSourceIndex(html).locateRange(-10, 9999);
    expect(clamped).toEqual({
      startOffset: 0,
      endOffset: html.length,
      line: 1,
      column: 1,
    });
  });

  test("findNthTagLocation finds the Nth tag, indexes raw-text opening tags, and skips comments, raw-text bodies, and quoted attributes", () => {
    const html = [
      '<!-- <img src="commented.png"> -->',
      '<div title="Quoted <img src=\'fake.png\'> inside attribute">',
      '<style data-note="a > b">/* <img src="in-style.png"> */</style>',
      '<p><img src="first.png" alt="a > b"></p>',
      "<p><img src=\"second.png\" alt='c > d'></p>",
      "</div>",
    ].join("\n");

    expect(findNthTagLocation(html, "img", -1)).toBeUndefined();

    // The <style> tag itself is a real element at line 3, while the <img> inside its CSS text is ignored
    const styleLoc = findNthTagLocation(html, "style", 0);
    expect(styleLoc?.line).toBe(3);
    expect(html.slice(styleLoc?.startOffset, styleLoc?.endOffset)).toBe(
      '<style data-note="a > b">'
    );

    const first = findNthTagLocation(html, "img", 0);
    expect(first).toBeDefined();
    expect(first?.line).toBe(4);
    expect(html.slice(first?.startOffset, first?.endOffset)).toBe(
      '<img src="first.png" alt="a > b">'
    );

    const second = findNthTagLocation(html, "img", 1);
    expect(second).toBeDefined();
    expect(second?.line).toBe(5);
    expect(html.slice(second?.startOffset, second?.endOffset)).toBe(
      "<img src=\"second.png\" alt='c > d'>"
    );

    const third = findNthTagLocation(html, "img", 2);
    expect(third).toBeUndefined();
  });

  test("createLintContext.locateElement maps parsed DOM elements to source locations and returns undefined for detached nodes", () => {
    const ctx = createLintContext('<p>Hello</p>\n<p><img src="a.png"></p>');
    const img = ctx.root.querySelector("img");
    expect(img).not.toBeNull();
    if (img) {
      expect(ctx.locateElement(img)?.line).toBe(2);
    }

    const detached = document.createElement("img");
    expect(ctx.locateElement(detached)).toBeUndefined();
  });

  test("getAccessibleText combines text nodes and <img alt> attributes in exact DOM reading order", () => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(
      [
        '<a id="order-test" href="https://example.com"><img src="icon.png" alt="Click"> <span>here</span></a>',
        '<a id="decorative-test" href="https://example.com"><img src="deco.png" alt="">Read Chapter 2</a>',
      ].join(""),
      "text/html"
    );

    const orderLink = doc.getElementById("order-test");
    const decorativeLink = doc.getElementById("decorative-test");
    expect(orderLink).not.toBeNull();
    expect(decorativeLink).not.toBeNull();

    if (orderLink && decorativeLink) {
      expect(getAccessibleText(orderLink)).toBe("Click here");
      expect(getAccessibleText(decorativeLink)).toBe("Read Chapter 2");
    }
  });

  test("formatElementSnippet formats void, short, and long elements with truncation", () => {
    const parser = new DOMParser();
    const longUrl = "https://archiveofourown.org/".repeat(5);
    const doc = parser.parseFromString(
      [
        '<img src="divider.png">',
        '<a href="https://example.com">click here</a>',
        `<a href="${longUrl}">This link has a very long text content that exceeds forty characters easily</a>`,
        "<h3></h3>",
      ].join(""),
      "text/html"
    );

    const img = doc.querySelector("img");
    const links = doc.querySelectorAll("a");
    const emptyHeading = doc.querySelector("h3");
    expect(img).not.toBeNull();
    expect(links).toHaveLength(2);
    expect(emptyHeading).not.toBeNull();

    if (img && links[0] && links[1] && emptyHeading) {
      expect(formatElementSnippet(img)).toBe('<img src="divider.png">');
      expect(formatElementSnippet(links[0])).toBe(
        '<a href="https://example.com">click here</a>'
      );
      const longSnippet = formatElementSnippet(links[1], 80);
      expect(longSnippet.length).toBeLessThanOrEqual(80);
      expect(longSnippet.endsWith("...")).toBe(true);
      expect(formatElementSnippet(emptyHeading)).toBe("<h3></h3>");
    }
  });
});
