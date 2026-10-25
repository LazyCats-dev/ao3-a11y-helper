import { formatElementSnippet } from "../element-text.ts";
import type { A11yWarning, LintContext } from "../types.ts";

const FILENAME_OR_URL_PATTERN =
  /^(https?:\/\/\S+|\S+\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)|(?:img|dsc|image|photo|screenshot|pic|untitled)[_-]?\d+)$/i;

const GENERIC_ALT_WORDS = new Set([
  "image",
  "photo",
  "photograph",
  "picture",
  "graphic",
  "art",
  "fanart",
  "artwork",
  "banner",
  "divider",
  "spacer",
  "icon",
  "alt",
  "img",
]);

const REDUNDANT_PREFIX_PATTERN = /^(image|picture|photo|photograph|graphic)\s+of\b/i;

type AltTextProblem = Pick<A11yWarning, "title" | "message" | "suggestion">;

/**
 * Returns a description of what is wrong with a non-empty `alt` value,
 * or `undefined` if the alt text looks like a genuine description.
 */
function diagnoseAltText(rawAlt: string): AltTextProblem | undefined {
  const alt = rawAlt.trim();

  if (alt === "") {
    return {
      title: "Image alt attribute contains only whitespace",
      message:
        'Whitespace-only alt text (such as alt=" ") can cause screen readers to pause or announce an unlabeled graphic instead of skipping it.',
      suggestion:
        'Use completely empty quotes (alt="") if the image is decorative, or provide a text description.',
    };
  }

  if (FILENAME_OR_URL_PATTERN.test(alt)) {
    return {
      title: "Image alt text looks like a filename or URL",
      message: `The alt text "${alt}" reads like a filename or URL rather than a description of the image.`,
      suggestion:
        'Replace the filename/URL in alt="..." with a brief description of what the image shows, or use alt="" if decorative.',
    };
  }

  if (GENERIC_ALT_WORDS.has(alt.toLowerCase().replace(/[.!?]+$/, ""))) {
    return {
      title: "Image alt text is too generic",
      message: `The alt text "${alt}" tells screen reader users that an image exists, but not what it depicts.`,
      suggestion:
        'Describe the specific subject and mood of the artwork in alt="...", or use alt="" if it is purely decorative.',
    };
  }

  if (REDUNDANT_PREFIX_PATTERN.test(alt)) {
    return {
      title: 'Image alt text starts with redundant "image of" / "picture of"',
      message:
        'Screen readers already announce that an <img> element is an image, so starting with "Image of" or "Picture of" is repetitive.',
      suggestion:
        'Remove the "Image of" / "Picture of" prefix and jump straight into describing the scene (or mention the medium if relevant, e.g., "Watercolor painting of...").',
    };
  }

  return undefined;
}

export function checkImages(context: LintContext): A11yWarning[] {
  const warnings: A11yWarning[] = [];

  for (const img of context.root.querySelectorAll("img")) {
    const alt = img.getAttribute("alt");
    const location = context.locateElement(img);
    const snippet = formatElementSnippet(img);

    if (alt === null) {
      warnings.push({
        ruleId: "img-missing-alt",
        severity: "error",
        title: "Image is missing an alt attribute",
        message:
          "When an <img> tag has no alt attribute, screen readers often read the raw image filename or full URL aloud.",
        suggestion:
          'Add alt="Description of the image" for meaningful artwork, or alt="" (empty quotes) for decorative dividers and banners.',
        snippet,
        location,
      });
      continue;
    }

    // Empty alt="" is valid and intentional for decorative images.
    if (alt === "") {
      continue;
    }

    const problem = diagnoseAltText(alt);
    if (problem) {
      warnings.push({
        ruleId: "img-suspicious-alt",
        severity: "warning",
        ...problem,
        snippet,
        location,
      });
    }
  }

  return warnings;
}
