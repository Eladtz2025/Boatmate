import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Deliberately west of UTC. Postgres `date` values arrive as "YYYY-MM-DD",
    // which naive parsing reads as UTC midnight — that renders as the previous
    // day only for users behind UTC, so a test run in Israel (UTC+3) would
    // never catch it. Running here makes the failure mode the default.
    env: { TZ: "America/Los_Angeles" },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
