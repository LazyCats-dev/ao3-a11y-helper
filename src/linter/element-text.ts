/**
 * Returns `text` unchanged if it fits in `maxLength`, otherwise truncates it and
 * appends an ellipsis so the result is exactly `maxLength` characters long.
 */
export function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

/**
 * Computes the text a screen reader would announce for an element's contents,
 * combining text nodes and `<img alt="...">` values in DOM reading order.
 */
export function getAccessibleText(root: Node): string {
  const parts: string[] = [];

  function walk(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? "");
      return;
    }
    if (node instanceof Element && node.localName === "img") {
      parts.push(` ${node.getAttribute("alt") ?? ""} `);
      return;
    }
    for (const child of node.childNodes) {
      walk(child);
    }
  }

  walk(root);
  return parts.join("").replace(/\s+/g, " ").trim();
}

/**
 * Formats a concise, single-line preview of an element for the warning card:
 * its opening tag, a short excerpt of its text, and its closing tag.
 */
export function formatElementSnippet(element: Element, maxLength = 100): string {
  const shallowClone = element.cloneNode(false);
  const outer =
    shallowClone instanceof Element ? shallowClone.outerHTML : element.outerHTML;
  const closingTag = `</${element.localName}>`;
  const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();

  const hasClosingTag = outer.endsWith(closingTag);
  const preview =
    hasClosingTag && text.length > 0
      ? `${outer.slice(0, -closingTag.length)}${truncate(text, 40)}${closingTag}`
      : outer;

  return truncate(preview, maxLength);
}
