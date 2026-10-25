import axeCore, { type AxeResults, type ElementContext, type RunOptions } from "axe-core";
import { expect } from "vitest";
import type { AxeMatchers } from "vitest-axe/matchers";
import * as axeMatchers from "vitest-axe/matchers";
import type { EmulateMediaOptions } from "../vitest.config.ts";

export { createLintContext } from "../src/linter/source-locator.ts";

declare module "vitest" {
  interface Matchers<
    R extends void | Promise<void> = void | Promise<void>,
    T = unknown
  > extends AxeMatchers {}
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}

declare module "vitest/browser" {
  interface BrowserCommands {
    emulateMedia: (options: EmulateMediaOptions) => Promise<void>;
  }
}

expect.extend(axeMatchers);

/**
 * Runs axe-core directly against a real DOM element (or document body)
 * and returns the AxeResults for `expect(results).toHaveNoViolations()`.
 */
export async function runAxe(
  context: ElementContext = document.body,
  options?: RunOptions
): Promise<AxeResults> {
  return await axeCore.run(context, options ?? {});
}

/**
 * Queries for a required DOM element and narrows its type via `instanceof`,
 * throwing a descriptive error in tests instead of relying on `as` casts.
 */
export function getRequiredElement<T extends Element>(
  root: ParentNode,
  selector: string,
  ctor: abstract new (...args: never[]) => T
): T {
  const el = root.querySelector(selector);
  if (!(el instanceof ctor)) {
    throw new Error(
      `Expected selector "${selector}" to match an instance of ${ctor.name}, but got ${
        el ? el.tagName : "null"
      }`
    );
  }
  return el;
}
