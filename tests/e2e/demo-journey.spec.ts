import path from "node:path";
import { expect, test } from "@playwright/test";

const SAMPLES = path.resolve("public/demo/samples");

test.describe.configure({ mode: "serial" });

test("hackathon demo journey: investigate, contradictions, lease, draft, discover, compare, report", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/login");
  await page.getByRole("button", { name: /Continue with the demo student account/ }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // Create investigation
  await page.goto("/investigations/new");
  await page.getByLabel("Name this investigation").fill("E2E South End 2BR");
  await page.getByRole("button", { name: /Continue to evidence/ }).click();
  await expect(page).toHaveURL(/\/evidence\?new=1/);
  const caseUrl = page.url().replace(/\/evidence.*$/, "");

  // Step 1: upload the listing screenshot (OCR)
  await page.getByRole("tab", { name: /Screenshot \/ photos \/ PDF/ }).click();
  await page.getByLabel("Title").fill("Listing screenshot");
  await page.getByLabel("Files").setInputFiles(path.join(SAMPLES, "listing-screenshot.png"));
  await page.getByRole("button", { name: "Add evidence" }).click();
  await expect(page.getByText("Evidence saved")).toBeVisible({ timeout: 60_000 });

  // Step 2: landlord message
  await page.getByRole("tab", { name: "Landlord message" }).click();
  await page.getByLabel("Title").fill("Message from Daniel");
  await page.locator("#ev-text2").fill((await import("node:fs")).readFileSync(path.join(SAMPLES, "landlord-message.txt"), "utf8"));
  await page.getByRole("button", { name: "Add evidence" }).click();
  await expect(page.getByText("Evidence saved").first()).toBeVisible();

  // Step 3: board shows findings once the agent finishes
  await page.goto(caseUrl);
  await expect(page.getByRole("heading", { name: "Pressure to pay quickly" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Payment recipient differs from the person you've been dealing with" })).toBeVisible();
  await expect(page.getByText("Rental authority has not been independently verified.").first()).toBeVisible();

  // Step 4: lease PDF → rent contradiction + deposit rule with citation
  await page.goto(`${caseUrl}/evidence`);
  await page.getByRole("tab", { name: "Lease" }).click();
  await page.getByLabel("Title").fill("Lease from advertiser");
  await page.getByLabel(/Lease file/).setInputFiles(path.join(SAMPLES, "lease-v1.pdf"));
  await page.getByRole("button", { name: "Add evidence" }).click();
  await expect(page.getByText("Evidence saved").first()).toBeVisible();
  await page.goto(caseUrl);
  await expect(page.getByRole("heading", { name: "Monthly rent in the lease differs from the advertisement" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("heading", { name: /Rule concern: Security deposit maximum/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Residential Tenancies Act, R\.S\.N\.S\. 1989, c\. 401, s\. 12\(2\)/ }).first()).toBeVisible();

  // Step 5–6: verification questions and a draft that is NOT sent
  await page.goto(`${caseUrl}/communications`);
  await expect(page.getByText("Draft — not sent").first()).toBeVisible();
  await expect(page.locator("textarea").first()).toContainText(/half of one month's rent|different monthly rent/);

  // Step 7–8: discover alternatives (DEMO labelled), save and compare
  await page.goto("/discover?city=Halifax&bedroomsMin=2&budgetMax=2000");
  await expect(page.getByText("Showing DEMO inventory")).toBeVisible();
  const compareButtons = page.getByRole("button", { name: "Compare", exact: true });
  await compareButtons.first().click();
  await expect(page.getByText("Added to comparison")).toBeVisible();
  await page.goto("/compare");
  await expect(page.getByText("Why it ranks here")).toBeVisible();

  // Step 9: new evidence — revised lease resolves the rent contradiction, deposit remains
  await page.goto(`${caseUrl}/evidence`);
  await page.getByRole("tab", { name: "Lease" }).click();
  await page.getByLabel("Title").fill("Revised lease");
  await page.getByLabel(/Lease file/).setInputFiles(path.join(SAMPLES, "lease-v2-revised.pdf"));
  await page.getByLabel(/new version of earlier evidence/).selectOption({ label: "Replaces: Lease from advertiser" });
  await page.getByRole("button", { name: "Add evidence" }).click();
  await expect(page.getByText("Evidence saved").first()).toBeVisible();
  await page.goto(caseUrl);
  await expect(page.getByRole("heading", { name: /Resolved & dismissed/ })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("heading", { name: /Rule concern: Security deposit maximum/ }).first()).toBeVisible();

  // Step 10: report download
  const res = await page.request.get(`${caseUrl.replace("/investigations/", "/api/reports/investigation/")}?format=pdf`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/pdf");
});
