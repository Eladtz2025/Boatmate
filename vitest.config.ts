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
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // `server-only` is a marker package: its default entry throws on import
      // so that a Server Component module cannot be pulled into a client
      // bundle. Vitest is neither, and picking the default entry means any
      // server module — `google-calendar.ts`, `push.ts` — is untestable.
      // React itself resolves this to `empty.js` under the `react-server`
      // condition; pointing at the same file is that condition, by hand.
      "server-only": path.resolve(__dirname, "./node_modules/server-only/empty.js"),
    },
  },
});
