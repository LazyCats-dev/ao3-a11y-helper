import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import type { BrowserCommand } from "vitest/node";

export interface EmulateMediaOptions {
  colorScheme?: "light" | "dark" | null;
  reducedMotion?: "reduce" | "no-preference" | null;
  forcedColors?: "active" | "none" | null;
}

const emulateMedia: BrowserCommand<[EmulateMediaOptions]> = async (
  ctx,
  options
) => {
  await ctx.page.emulateMedia(options);
};

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "browser",
          include: [
            "tests/content-ui.test.ts",
            "tests/locator.test.ts",
            "tests/rules-core.test.ts",
            "tests/rules-structure.test.ts",
          ],
          setupFiles: ["./tests/setup.ts"],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            commands: {
              emulateMedia,
            },
            instances: [{ browser: "chromium" }, { browser: "firefox" }],
          },
        },
      },
      {
        test: {
          name: "node",
          environment: "node",
          include: ["tests/build.test.ts"],
        },
      },
    ],
  },
});
