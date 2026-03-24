import { test, expect } from "@playwright/test";

const apiURL = process.env.E2E_API_URL || "http://127.0.0.1:3000";

test.describe("Express API (trainer + user backends)", () => {
  test("GET /api/stats responds", async ({ request }) => {
    const res = await request.get(`${apiURL}/api/stats`);
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json).toBeTruthy();
    expect(json).toHaveProperty("pending_requests");
  });
});

test.describe("Next.js member/trainer UI", () => {
  test("login page renders (frontend stack)", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /^Login$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /signing in|login/i })).toBeVisible();
  });

  test("dashboard redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    expect(page.url()).toMatch(/login/);
  });
});
