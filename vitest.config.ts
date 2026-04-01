import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/bot/**"],
      exclude: ["src/bot/tick.ts", "src/bot/executor.ts", "src/bot/state.ts"],
      reporter: ["text", "lcov"],
    },
  },
});
