import { expect, test } from "@playwright/test";

test("signup, onboarding, dashboard, logout", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.test`;
  await page.goto("/signup");
  await page.getByLabel("Name").fill("E2E Renter");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery");
  await page.getByLabel("Confirm password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByText("What SafeLease cannot verify")).toBeVisible();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: /Welcome back, E2E/ })).toBeVisible();
  await page.getByRole("button", { name: /Account menu/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
});

test("rejects wrong password and blocks renters from admin", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo.student@safelease.demo");
  await page.getByLabel("Password").fill("wrong-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
  await page.getByRole("button", { name: /Continue with the demo student account/ }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/dashboard\?denied=admin/);
});
