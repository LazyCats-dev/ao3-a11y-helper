import {
  formatElementSnippet,
  getAccessibleText,
  truncate,
} from "./element-text.ts";
import type { LintContext, SourceLocation } from "./types.ts";

export { formatElementSnippet, getAccessibleText, truncate };

/**
 * Regions of raw HTML whose contents the HTML parser never turns into elements
 * (comments and raw-text / escapable raw-text elements). Tag-like text inside them
 * must not be counted when mapping DOM elements back to source offsets.
 */
const NON_ELEMENT_REGION_SOURCE =
  "<!--[\\s\\S]*?-->|(<(script|style|textarea|title)\\b(?:[^\"'>]|\"[^\"]*\"|'[^']*')*>)[\\s\\S]*?<\\/\\2\\s*>";

/**
 * Matches either a non-element region (group 1 = opening tag of raw-text element,
 * group 2 = raw-text tag name) or a normal opening tag (group 3 = tag name).
 * Quoted attribute values are consumed so a `>` or a tag-like string inside
 * `title="<img>"` does not split or fake a tag.
 */
const TOKEN_PATTERN_SOURCE = `${NON_ELEMENT_REGION_SOURCE}|<([a-zA-Z][a-zA-Z0-9:-]*)(?=[\\s/>])(?:[^>"']|"[^"]*"|'[^']*')*>`;

/** Regions whose line breaks / symbols are intentional and must not be linted as prose. */
const PRESERVED_FORMATTING_PATTERN =
  /<!--[\s\S]*?-->|<(pre|code|script|style|textarea)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

export interface SourceIndex {
  readonly rawHtml: string;
  /** Converts a 0-based `[start, end)` character range into a `SourceLocation`, clamping to bounds. */
  locateRange(startOffset: number, endOffset: number): SourceLocation;
  /** Returns the location of the Nth (0-based) opening `<tagName>` tag in source order. */
  locateTag(tagName: string, occurrenceIndex: number): SourceLocation | undefined;
}

/**
 * Builds a reusable index over `rawHtml` so that repeated location lookups are
 * O(log n) instead of rescanning the whole string for every warning.
 */
export function createSourceIndex(rawHtml: string): SourceIndex {
  const lineStartOffsets = computeLineStartOffsets(rawHtml);
  let tagRanges: Map<string, Array<readonly [number, number]>> | undefined;

  function locateRange(startOffset: number, endOffset: number): SourceLocation {
    const start = clamp(startOffset, 0, rawHtml.length);
    const end = clamp(endOffset, start, rawHtml.length);
    const lineIndex = findLineIndex(lineStartOffsets, start);
    const lineStart = lineStartOffsets[lineIndex] ?? 0;
    return {
      startOffset: start,
      endOffset: end,
      line: lineIndex + 1,
      column: start - lineStart + 1,
    };
  }

  function locateTag(
    tagName: string,
    occurrenceIndex: number
  ): SourceLocation | undefined {
    if (occurrenceIndex < 0) {
      return undefined;
    }
    tagRanges ??= collectOpeningTagRanges(rawHtml);
    const range = tagRanges.get(tagName.toLowerCase())?.[occurrenceIndex];
    return range ? locateRange(range[0], range[1]) : undefined;
  }

  return { rawHtml, locateRange, locateTag };
}

/**
 * Converts a 0-based character range `[startOffset, endOffset)` in `rawHtml`
 * into a `SourceLocation` with 1-based line and column numbers.
 */
export function offsetToLocation(
  rawHtml: string,
  startOffset: number,
  endOffset: number
): SourceLocation {
  return createSourceIndex(rawHtml).locateRange(startOffset, endOffset);
}

/**
 * Finds the Nth occurrence (0-indexed) of an opening HTML tag `<tagName ...>`
 * in `rawHtml`, ignoring HTML comments, `<script>`/`<style>`/`<textarea>`/`<title>`
 * bodies, and tag-like strings inside quoted attributes of other elements.
 */
export function findNthTagLocation(
  rawHtml: string,
  tagName: string,
  occurrenceIndex: number
): SourceLocation | undefined {
  return createSourceIndex(rawHtml).locateTag(tagName, occurrenceIndex);
}

/**
 * Replaces comments and `<pre>`/`<code>`/`<script>`/`<style>`/`<textarea>` blocks with
 * spaces (preserving newlines) so text-based rules skip them while every character
 * offset still lines up with the original `rawHtml`.
 */
export function maskPreservedFormatting(rawHtml: string): string {
  return rawHtml.replace(PRESERVED_FORMATTING_PATTERN, (region) =>
    region.replace(/[^\n]/g, " ")
  );
}

/**
 * Parses `rawHtml` into an inert fragment and prepares source-location helpers.
 *
 * A `<template>` is used (rather than wrapping the HTML in a `<div>`) so that
 * unbalanced closing tags such as a stray `</div>` cannot move later content
 * outside the linted root. Template contents are inert: images do not load and
 * scripts never run.
 */
export function createLintContext(rawHtml: string): LintContext {
  const doc = document.implementation.createHTMLDocument("");
  const template = doc.createElement("template");
  template.innerHTML = rawHtml;
  const root = template.content;
  const source = createSourceIndex(rawHtml);

  let occurrenceByElement: Map<Element, number> | undefined;

  function locateElement(element: Element): SourceLocation | undefined {
    if (!occurrenceByElement) {
      // One pass over the fragment: the Nth <tag> in DOM order is the Nth <tag> in source order.
      occurrenceByElement = new Map();
      const countsByTag = new Map<string, number>();
      for (const el of root.querySelectorAll("*")) {
        const count = countsByTag.get(el.localName) ?? 0;
        occurrenceByElement.set(el, count);
        countsByTag.set(el.localName, count + 1);
      }
    }
    const occurrence = occurrenceByElement.get(element);
    return occurrence === undefined
      ? undefined
      : source.locateTag(element.localName, occurrence);
  }

  return { rawHtml, root, source, locateElement };
}

function collectOpeningTagRanges(
  rawHtml: string
): Map<string, Array<readonly [number, number]>> {
  const ranges = new Map<string, Array<readonly [number, number]>>();
  const pattern = new RegExp(TOKEN_PATTERN_SOURCE, "gi");

  for (const match of rawHtml.matchAll(pattern)) {
    const rawTextOpenTag = match[1];
    const rawTextTagName = match[2];
    const normalTagName = match[3];
    const start = match.index;

    if (rawTextOpenTag !== undefined && rawTextTagName !== undefined) {
      // The raw-text element's own opening tag is a real DOM element; its inner text is not.
      pushRange(ranges, rawTextTagName.toLowerCase(), [
        start,
        start + rawTextOpenTag.length,
      ]);
    } else if (normalTagName !== undefined) {
      pushRange(ranges, normalTagName.toLowerCase(), [
        start,
        start + match[0].length,
      ]);
    }
  }

  return ranges;
}

function pushRange(
  ranges: Map<string, Array<readonly [number, number]>>,
  tagName: string,
  range: readonly [number, number]
): void {
  const existing = ranges.get(tagName);
  if (existing) {
    existing.push(range);
  } else {
    ranges.set(tagName, [range]);
  }
}

function computeLineStartOffsets(text: string): number[] {
  const offsets = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10 /* \n */) {
      offsets.push(i + 1);
    }
  }
  return offsets;
}

/** Binary search for the last line whose start offset is <= `offset`. */
function findLineIndex(lineStartOffsets: readonly number[], offset: number): number {
  let low = 0;
  let high = lineStartOffsets.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if ((lineStartOffsets[mid] ?? 0) <= offset) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return low;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
