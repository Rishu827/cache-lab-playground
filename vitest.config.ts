import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Retry once on CI to absorb timing noise on shared runners; local runs never retry.
    retry: process.env.CI ? 1 : 0,
    include: ["packages/*/test/**/*.test.ts", "apps/*/src/**/*.test.ts"],
  },
});
