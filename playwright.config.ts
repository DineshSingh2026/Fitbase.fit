import { defineConfig, devices } from "@playwright/test";

const nextURL = process.env.E2E_NEXT_URL || "http://127.0.0.1:3102";
const apiURL = process.env.E2E_API_URL || "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "tests/playwright",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  timeout: 60_000,
  use: {
    baseURL: nextURL,
    trace: "on-first-retry"
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  /* Set E2E_START_SERVERS=1 to run `npm run dev:local` before tests (needs DATABASE_URL). */
  webServer:
    process.env.E2E_START_SERVERS === "1"
      ? {
          command: "npm run dev:local",
          url: `${apiURL}/api/stats`,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
          stdout: "pipe",
          stderr: "pipe"
        }
      : undefined
});
