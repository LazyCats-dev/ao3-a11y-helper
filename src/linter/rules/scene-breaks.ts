import { formatElementSnippet, truncate } from "../element-text.ts";
import { maskPreservedFormatting } from "../source-locator.ts";
import type {
  A11yFix,
  A11yWarning,
  LintContext,
  SourceLocation,
} from "../types.ts";

const INLINE_WRAPPER_TAG =
  /^<\/?(?:span|strong|em|b|i|u|s|small|big)(?:\s[^>]*)?>$/i;

// Standard or slightly extended dialogue ellipses (3-5 dots, 1-2 Unicode ellipses, or 3-4 spaced dots)
const DIALOGUE_ELLIPSIS_PATTERN = /^(?:\.{3,5}|…{1,2}|\.(?:\s+\.){2,3})$/u;

// Symbols commonly typed by fanfiction authors for horizontal scene breaks
const SCENE_BREAK_CHAR_PATTERN =
  /^[\s*\-~_=+#•·♦❖✦✧★☆§—–.|/\\<>^◊○●◦]+$/u;

const NON_BREAKING_SPACE_ENTITY_PATTERN = /&(?:nbsp|#160|#xa0);/gi;

const NON_TEXT_OR_NESTED_BLOCK_SELECTOR =
  "p, div, center, blockquote, ul, ol, table, details, hr, pre, code, img, a, h1, h2, h3, h4, h5, h6";

export function isAsciiSceneBreakText(rawText: string): boolean {
  const trimmed = rawText
    .replace(NON_BREAKING_SPACE_ENTITY_PATTERN, " ")
    .trim();
  if (trimmed.length === 0) {
    return false;
  }

  // Do not flag standard dialogue ellipses ("...", "....", "…", ". . .") used for silent beats
  if (DIALOGUE_ELLIPSIS_PATTERN.test(trimmed)) {
    return false;
  }

  if (!SCENE_BREAK_CHAR_PATTERN.test(trimmed)) {
    return false;
  }

  // Count non-whitespace divider characters; require at least 3 symbols
  const nonSpaceChars = trimmed.replace(/\s+/g, "");
  return nonSpaceChars.length >= 3;
}

function findClosedBlockRange(
  rawHtml: string,
  openTagLocation: SourceLocation,
  tagName: string
): { startOffset: number; endOffset: number } | undefined {
  const afterOpenTag = rawHtml.slice(openTagLocation.endOffset);
  const closeMatch = new RegExp(`</${tagName}\\s*>`, "i").exec(afterOpenTag);
  if (!closeMatch) {
    return undefined;
  }
  const innerHtml = afterOpenTag.slice(0, closeMatch.index);
  // If another block tag opened before the closing tag, the element was implicitly closed
  if (/<(?:p|div|center|blockquote|ul|ol|table|details|hr|h[1-6])\b/i.test(innerHtml)) {
    return undefined;
  }
  return {
    startOffset: openTagLocation.startOffset,
    endOffset:
      openTagLocation.endOffset + closeMatch.index + closeMatch[0].length,
  };
}

function areInlineTagsBalanced(fragment: string): boolean {
  const stack: string[] = [];
  const tagRegex = /<\/?([a-zA-Z0-9]+)(?:\s[^>]*)?>/g;
  for (const match of fragment.matchAll(tagRegex)) {
    const fullTag = match[0];
    const tagName = (match[1] ?? "").toLowerCase();
    if (!INLINE_WRAPPER_TAG.test(fullTag)) {
      return false;
    }
    if (fullTag.startsWith("</")) {
      if (stack.pop() !== tagName) {
        return false;
      }
    } else if (!fullTag.endsWith("/>")) {
      stack.push(tagName);
    }
  }
  return stack.length === 0;
}

function createSceneBreakWarning(
  dividerText: string,
  snippet: string,
  location: SourceLocation | undefined,
  fix?: A11yFix
): A11yWarning {
  const normalizedDivider = dividerText
    .replace(NON_BREAKING_SPACE_ENTITY_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    ruleId: "ascii-scene-break",
    severity: "warning",
    title: `Non-semantic scene break ("${normalizedDivider.slice(0, 24)}")`,
    message:
      'Screen readers often read symbol dividers aloud literally (for example, "asterisk asterisk asterisk" or "tilde asterisk tilde"), interrupting the story flow.',
    suggestion:
      "Replace symbol scene breaks with a semantic <hr> tag. You can customize how <hr> looks using an AO3 Work Skin.",
    snippet: truncate(snippet, 80),
    location,
    fix,
  };
}

export function checkSceneBreaks(context: LintContext): A11yWarning[] {
  const warnings: A11yWarning[] = [];
  const { rawHtml, source } = context;
  const flaggedRanges: Array<readonly [number, number]> = [];

  // 1. Check leaf block elements (<p>, <div>, <center>) in DOM order
  for (const block of context.root.querySelectorAll("p, div, center")) {
    if (block.closest("pre, code")) {
      continue;
    }
    if (block.querySelector(NON_TEXT_OR_NESTED_BLOCK_SELECTOR) !== null) {
      continue;
    }
    const text = (block.textContent ?? "").trim();
    if (!isAsciiSceneBreakText(text)) {
      continue;
    }

    const openLoc = context.locateElement(block);
    const closedRange =
      openLoc !== undefined
        ? findClosedBlockRange(rawHtml, openLoc, block.localName)
        : undefined;

    if (closedRange) {
      flaggedRanges.push([closedRange.startOffset, closedRange.endOffset]);
      const fullSnippet = rawHtml
        .slice(closedRange.startOffset, closedRange.endOffset)
        .replace(/\s+/g, " ")
        .trim();
      const location = source.locateRange(
        closedRange.startOffset,
        closedRange.endOffset
      );
      const fix: A11yFix = {
        label: "Replace scene break with <hr>",
        startOffset: closedRange.startOffset,
        endOffset: closedRange.endOffset,
        replacement: "<hr>",
      };
      warnings.push(createSceneBreakWarning(text, fullSnippet, location, fix));
    } else {
      if (openLoc) {
        flaggedRanges.push([openLoc.startOffset, openLoc.endOffset]);
      }
      warnings.push(
        createSceneBreakWarning(text, formatElementSnippet(block, 80), openLoc)
      );
    }
  }

  // 2. Scan raw lines (masking out comments, <pre>, <code>, etc.) for bare scene break lines not inside a flagged block
  const maskedHtml = maskPreservedFormatting(rawHtml);
  const lines = maskedHtml.split("\n");
  let currentLineStart = 0;

  for (const line of lines) {
    const originalLine = rawHtml.slice(
      currentLineStart,
      currentLineStart + line.length
    );

    const textWithoutTags = line
      .replace(/<\/?[a-zA-Z0-9]+(?:\s[^>]*)?>/g, (tag) =>
        INLINE_WRAPPER_TAG.test(tag) ? "" : tag
      )
      .trim();

    if (isAsciiSceneBreakText(textWithoutTags)) {
      const trimmedOriginal = originalLine.trim();
      const leadingSpaces = originalLine.indexOf(trimmedOriginal);
      const startOffset = currentLineStart + Math.max(0, leadingSpaces);
      const endOffset = startOffset + trimmedOriginal.length;

      const alreadyFlagged = flaggedRanges.some(
        ([flaggedStart, flaggedEnd]) =>
          startOffset >= flaggedStart && startOffset < flaggedEnd
      );

      if (!alreadyFlagged) {
        const location = source.locateRange(startOffset, endOffset);
        const fix: A11yFix | undefined = areInlineTagsBalanced(trimmedOriginal)
          ? {
              label: "Replace scene break with <hr>",
              startOffset,
              endOffset,
              replacement: "<hr>",
            }
          : undefined;

        warnings.push(
          createSceneBreakWarning(
            textWithoutTags,
            trimmedOriginal,
            location,
            fix
          )
        );
      }
    }

    currentLineStart += line.length + 1;
  }

  return warnings.sort(
    (a, b) =>
      (a.location?.startOffset ?? Number.MAX_SAFE_INTEGER) -
      (b.location?.startOffset ?? Number.MAX_SAFE_INTEGER)
  );
}
