/**
 * Demo environment seeding. Every scenario is created through the same
 * service and agent code paths a real renter uses (no hardcoded findings).
 * All data is fictional and flagged isDemo.
 */
import fs from "node:fs";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import type { DB } from "../db/client";
import { account, imageFingerprint, listingImage, organization, rentalListing, user, userProfile, notificationPreference } from "../db/schema";
import { newId } from "@/lib/ids";
import { fingerprintImage } from "../images/fingerprint";
import { validateBuffer } from "./upload-helper";
import { DEMO_ACCOUNTS } from "../demo";
import { DEMO_LISTINGS, IMAGE_REUSE_LISTING_KEY } from "./listings";
import * as T from "./demo-texts";
import { addEvidence, createInvestigation } from "../services/investigations";
import { runAgentNow } from "../agent/orchestrator";
import { createLeaseReview } from "../services/leases";
import { addDepositEvent, addInspectionItem, addInspectionPhoto, addMaintenanceEvent, createDeposit, createInspection, createMaintenanceCase, createTenancy, updateInspection } from "../services/tenancy";
import { createDispute } from "../services/disputes";
import { createOrganization, grantConsent } from "../services/organizations";
import { saveProperty, updateSaved } from "../services/discovery";
import { storage } from "../storage";

const PUBLIC = path.resolve(process.cwd(), "public");

async function createDemoUser(db: DB, a: { email: string; password: string; name: string }, role: "renter" | "platform_admin") {
  const id = crypto.randomUUID();
  await db.insert(user).values({ id, name: a.name, email: a.email, emailVerified: true, role, isDemo: true });
  await db.insert(account).values({ id: crypto.randomUUID(), accountId: id, providerId: "credential", userId: id, password: await hashPassword(a.password) });
  await db.insert(userProfile).values({ userId: id, city: "Halifax", province: "NS", renterType: role === "renter" ? "international_student" : "general", budgetMaxCents: 180000, bedrooms: 2, onboardingCompletedAt: new Date() });
  await db.insert(notificationPreference).values({ userId: id });
  return id;
}

async function seedListings(db: DB) {
  const ids = new Map<string, string>();
  for (const l of DEMO_LISTINGS) {
    const id = newId("lst");
    ids.set(l.key, id);
    await db.insert(rentalListing).values({
      id,
      sourceKey: "demo_inventory",
      externalId: l.key,
      isDemo: true,
      title: l.title,
      description: `${l.description} This is a fictional demonstration listing.`,
      address: l.address,
      neighbourhood: l.neighbourhood,
      city: l.city,
      lat: l.lat,
      lng: l.lng,
      coordinatesSource: "fictional_demo",
      rentCents: l.rent * 100,
      depositCents: l.deposit ? l.deposit * 100 : null,
      bedrooms: l.bedrooms,
      bathrooms: l.bathrooms,
      propertyType: l.propertyType,
      furnished: l.furnished,
      parking: l.parking,
      petsAllowed: l.pets,
      utilitiesIncluded: l.utilities,
      accessibilityFeatures: l.accessibility,
      features: l.features,
      leaseType: l.leaseType,
      availableFrom: l.availableFrom,
      publishedAt: new Date(Date.now() - (5 + l.image) * 86400_000),
      dataConfidence: "demo",
      availabilityStatus: "unverified",
      contactName: l.contactName,
    });
    const url = `/demo/listings/listing-${String(l.image).padStart(2, "0")}.png`;
    const imgId = newId("limg");
    await db.insert(listingImage).values({ id: imgId, listingId: id, url, caption: "Generated demo illustration", provenance: "generated_demo" });
    const fp = await fingerprintImage(fs.readFileSync(path.join(PUBLIC, url)));
    await db.insert(imageFingerprint).values({ id: newId("fp"), listingImageId: imgId, pHash: fp.pHash, aHash: fp.aHash, width: fp.width, height: fp.height, metadata: {} });
  }
  return ids;
}

const sample = (f: string) => fs.readFileSync(path.join(PUBLIC, "demo", "samples", f));

export async function seedDemo(db: DB, log: (s: string) => void = console.log) {
  const renterId = await createDemoUser(db, DEMO_ACCOUNTS.renter, "renter");
  const adviserId = await createDemoUser(db, DEMO_ACCOUNTS.adviser, "renter");
  const adminId = await createDemoUser(db, DEMO_ACCOUNTS.admin, "platform_admin");
  log("demo users created");
  const listingIds = await seedListings(db);
  log(`${listingIds.size} demo listings created`);
  const run = (inv: string) => runAgentNow(renterId, inv, { trigger: "demo_seed" });

  // A + G: potential scam with payment pressure; agent proposes alternatives.
  const a = await createInvestigation(renterId, { title: "South End 2BR — RentFinder ad", city: "Halifax", isDemo: true, demoScenario: "A" });
  await addEvidence(renterId, a, { kind: "listing_screenshot", title: "Listing screenshot", file: await validateBuffer(sample("listing-screenshot.png"), "listing-screenshot.png"), isDemo: true });
  await addEvidence(renterId, a, { kind: "landlord_message", title: "Message from “Daniel”", text: T.MESSAGE_TEXT, occurredAt: new Date(Date.now() - 2 * 86400_000) });
  await run(a);
  await addEvidence(renterId, a, { kind: "lease", title: "Lease sent by advertiser", file: await validateBuffer(sample("lease-v1.pdf"), "lease-v1.pdf"), isDemo: true });
  await run(a);
  log("scenario A/G seeded");

  // B: apparently normal; key facts still unverified.
  const b = await createInvestigation(renterId, { title: "Clayton Park 1BR — managed building", city: "Halifax", isDemo: true, demoScenario: "B" });
  await addEvidence(renterId, b, { kind: "listing_text", title: "Listing text", text: T.CASE_B_LISTING });
  await addEvidence(renterId, b, { kind: "landlord_message", title: "Reply from Priya (manager)", text: T.CASE_B_MESSAGE });
  await run(b);

  // C: lease with excessive deposit (via Lease review).
  const c = await createInvestigation(renterId, { title: "Pinecrest Drive 1BR — lease check", city: "Dartmouth", isDemo: true, demoScenario: "C" });
  await createLeaseReview(renterId, { title: "Pinecrest Drive lease", investigationId: c, text: T.CASE_C_LEASE, isDemo: true });
  await run(c);

  // D: listing and lease rents differ.
  const d = await createInvestigation(renterId, { title: "Bedford 3BR townhouse", city: "Bedford", isDemo: true, demoScenario: "D" });
  await addEvidence(renterId, d, { kind: "listing_text", title: "Listing", text: T.CASE_D_LISTING });
  await addEvidence(renterId, d, { kind: "lease", title: "Lease draft", text: T.CASE_D_LEASE });
  await run(d);

  // E: duplicated photo attached to a conflicting listing.
  const e = await createInvestigation(renterId, { title: "Downtown Dartmouth 2BR — photo check", city: "Dartmouth", isDemo: true, demoScenario: "E" });
  await addEvidence(renterId, e, { kind: "listing_text", title: "Listing", text: T.CASE_E_LISTING });
  await addEvidence(renterId, e, { kind: "property_photo", title: "Photo from the ad", file: await validateBuffer(sample("property-photo.jpg"), "property-photo.jpg"), isDemo: true });
  await run(e);

  // F: revised lease resolves the rent contradiction; deposit concern remains.
  const f = await createInvestigation(renterId, { title: "Harbourview Lane — after landlord's reply", city: "Halifax", isDemo: true, demoScenario: "F" });
  await addEvidence(renterId, f, { kind: "listing_text", title: "Listing", text: T.LISTING_SCREENSHOT_TEXT });
  await addEvidence(renterId, f, { kind: "landlord_message", title: "First message", text: T.MESSAGE_TEXT });
  const leaseV1 = await addEvidence(renterId, f, { kind: "lease", title: "Lease v1", text: T.LEASE_V1_TEXT });
  await run(f);
  await addEvidence(renterId, f, { kind: "landlord_response", title: "Landlord reply", text: T.LANDLORD_REPLY_TEXT });
  await addEvidence(renterId, f, { kind: "lease", title: "Lease v2 (revised)", text: T.LEASE_V2_TEXT, supersedesEvidenceId: leaseV1 });
  await run(f);
  log("scenarios B–F seeded");

  // Saved properties for compare (Case G continuation)
  for (const k of ["d01", "d05", "d08", "d18"]) {
    const id = listingIds.get(k)!;
    await saveProperty(renterId, id);
    await updateSaved(renterId, id, { inComparison: true });
  }
  await updateSaved(renterId, listingIds.get("d02")!, { watch: true, notes: "Elevator building — good for move-in." });
  void IMAGE_REUSE_LISTING_KEY;

  // H: move-in inspection with pre-existing damage + later repair request.
  const ten = await createTenancy(renterId, { label: "Agricola Street 2BR (demo tenancy)", address: "Agricola Street area (fictional unit)", landlordName: "Agricola Homes (demo)", leaseType: "year_to_year", startDate: "2026-09-01", moveInDate: "2026-09-01", monthlyRentCents: 170000, status: "active", isDemo: true });
  const mi = await createInspection(renterId, ten, "move_in", "2026-09-01");
  const counter = await addInspectionItem(renterId, mi, { room: "kitchen", itemName: "Countertop", condition: "damaged", description: "Burn mark ~5 cm near the stove, present at move-in.", preExisting: true });
  await addInspectionPhoto(renterId, counter, await validateBuffer(fs.readFileSync(path.join(PUBLIC, "demo/listings/listing-05.png")), "kitchen-placeholder.png"), "DEMO placeholder image (not a real photo)");
  const fan = await addInspectionItem(renterId, mi, { room: "bathroom", itemName: "Exhaust fan", condition: "not_working", description: "Fan does not turn on.", preExisting: true, repairPromised: true, repairDueDate: "2026-09-15" });
  await addInspectionItem(renterId, mi, { room: "bedroom", roomLabel: "Bedroom 1", itemName: "Window", condition: "fair", description: "Small crack in lower corner of the glass.", preExisting: true });
  await addInspectionItem(renterId, mi, { room: "living_room", itemName: "Walls", condition: "good" });
  await addInspectionItem(renterId, mi, { room: "hallway", itemName: "Smoke alarm", condition: "good", description: "Tested — working." });
  await updateInspection(renterId, mi, { landlordPresent: false, witnessName: "Sam (roommate)", status: "completed", notes: "Landlord could not attend; completed with a witness per official guidance." });
  const m = await createMaintenanceCase(renterId, { title: "Bathroom exhaust fan not working", description: "Fan noted at move-in; landlord agreed to repair by Sept 15.", tenancyId: ten, location: "Bathroom", severity: "medium", discoveredOn: "2026-09-01", inspectionItemId: fan, isDemo: true });
  await addMaintenanceEvent(renterId, m, { eventType: "reported", occurredOn: "2026-09-02", description: "Emailed landlord with photo of the fan." });
  await addMaintenanceEvent(renterId, m, { eventType: "repair_promised", occurredOn: "2026-09-03", description: "Landlord replied: electrician will fix it by Sept 15.", promisedDate: "2026-09-15" });
  await addMaintenanceEvent(renterId, m, { eventType: "repair_promised", occurredOn: "2026-09-20", description: "Landlord: new date, end of September.", promisedDate: "2026-09-30" });
  log("scenario H seeded");

  // I: deposit dispute evidence package.
  const ended = await createTenancy(renterId, { label: "Quinpool 1BR (ended, demo)", address: "Quinpool area (fictional unit)", landlordName: "R. Gallant (demo)", leaseType: "year_to_year", startDate: "2025-09-01", endDate: "2026-08-31", monthlyRentCents: 140000, status: "ended", isDemo: true });
  const mi2 = await createInspection(renterId, ended, "move_in", "2025-09-01");
  await addInspectionItem(renterId, mi2, { room: "living_room", itemName: "Walls", condition: "fair", description: "Scuffs and nail holes near the window.", preExisting: true });
  await addInspectionItem(renterId, mi2, { room: "kitchen", itemName: "Oven", condition: "good" });
  const mo2 = await createInspection(renterId, ended, "move_out", "2026-08-31");
  await addInspectionItem(renterId, mo2, { room: "living_room", itemName: "Walls", condition: "fair", description: "Same scuffs as move-in." });
  await addInspectionItem(renterId, mo2, { room: "kitchen", itemName: "Oven", condition: "good", description: "Cleaned." });
  const dep = await createDeposit(renterId, { amountCents: 70000, tenancyId: ended, monthlyRentCents: 140000, paidOn: "2025-08-20", paidTo: "R. Gallant", paymentMethod: "e-transfer", isDemo: true });
  await addDepositEvent(renterId, dep, { eventType: "receipt_uploaded", occurredOn: "2025-08-20", description: "E-transfer confirmation saved (demo)." });
  await addDepositEvent(renterId, dep, { eventType: "tenancy_ended", occurredOn: "2026-08-31", description: "Moved out and returned keys." });
  await addDepositEvent(renterId, dep, { eventType: "return_requested", occurredOn: "2026-09-01", amountCents: 70000, description: "Requested full deposit by email." });
  await addDepositEvent(renterId, dep, { eventType: "landlord_claim_received", occurredOn: "2026-09-08", amountCents: 40000, description: "Landlord says $400 is kept for wall repairs and cleaning." });
  await addDepositEvent(renterId, dep, { eventType: "deduction_claimed", occurredOn: "2026-09-08", amountCents: 40000, description: "Wall repair and cleaning." });
  await addDepositEvent(renterId, dep, { eventType: "amount_returned", occurredOn: "2026-09-09", amountCents: 30000, description: "Received $300 by e-transfer." });
  await addDepositEvent(renterId, dep, { eventType: "deduction_disputed", occurredOn: "2026-09-10", amountCents: 40000, description: "Disputed: wall scuffs were recorded at move-in." });
  await createDispute(renterId, { disputeType: "deposit", title: "Quinpool deposit — $400 deduction", tenancyId: ended, depositId: dep, isDemo: true });
  log("scenario I seeded");

  // J: organization + consent-based redacted sharing.
  const org = await createOrganization(adminId, { name: "Harbourview University Students' Union (DEMO)", orgType: "student_union", isDemo: true });
  const { organizationMembership } = await import("../db/schema");
  await db.insert(organizationMembership).values({ id: newId("mem"), orgId: org, userId: adviserId, role: "adviser" });
  await db.insert(organizationMembership).values({ id: newId("mem"), orgId: org, userId: renterId, role: "member" });
  await createOrganization(adminId, { name: "Halifax Newcomer Housing Help (DEMO)", orgType: "settlement", isDemo: true });
  await grantConsent(renterId, { orgId: org, investigationId: a, scope: "redacted", message: "Could someone look at this before I pay? The landlord wants the deposit today." });
  await db.update(organization).set({ minAggregateGroupSize: 5 }).where(eq(organization.id, org));
  log("scenario J seeded");
  return { renterId, adviserId, adminId };
}

/** Removes all demo-flagged users (cascading their data), listings and organizations. */
export async function clearDemo(db: DB) {
  const demoUsers = await db.select({ id: user.id }).from(user).where(eq(user.isDemo, true));
  for (const u of demoUsers) {
    try {
      const dir = path.resolve(process.env.STORAGE_LOCAL_DIR ?? "./storage/private", u.id.replace(/[^a-z0-9_-]/gi, ""));
      if (storage().id === "local") fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  if (demoUsers.length) await db.delete(user).where(inArray(user.id, demoUsers.map((u) => u.id)));
  await db.delete(rentalListing).where(eq(rentalListing.isDemo, true));
  await db.delete(organization).where(eq(organization.isDemo, true));
}
