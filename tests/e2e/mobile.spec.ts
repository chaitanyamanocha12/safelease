import { expect, test } from "@playwright/test";

test("landing and app navigation work on mobile without horizontal scroll", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.goto("/login");
  await page.getByRole("button", { name: /Continue with the demo student account/ }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Investigations" }).click();
  await expect(page).toHaveURL(/\/investigations/);
  const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow2).toBeLessThanOrEqual(1);
});
