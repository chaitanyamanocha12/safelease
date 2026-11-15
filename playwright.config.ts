import { defineConfig, devices } from "@playwright/test";

/** E2E runs against a production build (`npm run build` first) on an isolated DB. */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: { command: "bash scripts/e2e-server.sh", url: "http://localhost:3100/login", timeout: 180_000, reuseExistingServer: false, stdout: "ignore", stderr: "pipe" },
});
