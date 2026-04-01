import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: "<your-project-ref>",
  dirs: ["./src/trigger"],
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 1, // Trading ticks should not auto-retry (could cause duplicate trades)
    },
  },
  maxDuration: 120, // 2 minutes max per tick
});
