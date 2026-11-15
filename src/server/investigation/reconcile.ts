/**
 * Evidence reconciliation: compares current claims across different
 * evidence items and produces claim links plus contradiction / change
 * findings. Agreement between two statements by the same advertiser is
 * recorded as "supports" but never upgrades a claim to verified.
 */
import { formatCents } from "@/lib/money";
import type { ClaimType } from "../db/schema/investigations";
import { addressCore, namesCompatible } from "../extraction/normalize";
import {
  activeClaims,
  byType,
  centsOf,
  evidenceLabel,
  evidenceMap,
  evidenceTime,
  isLeaseEvidence,
  isListingEvidence,
  isMessageEvidence,
} from "./active";
import type { CaseSnapshot, ClaimRecord, FindingDraft, LinkDraft } from "./types";

const SINGLE_VALUED: ClaimType[] = [
  "rent",
  "deposit",
  "address",
  "bedrooms",
  "bathrooms",
  "lease_term",
  "move_in_date",
  "postal_code",
];

const LABEL: Partial<Record<ClaimType, string>> = {
  rent: "Monthly rent",
  deposit: "Security deposit",
  address: "Property address",
  bedrooms: "Number of bedrooms",
  bathrooms: "Number of bathrooms",
  lease_term: "Lease term",
  move_in_date: "Move-in date",
  postal_code: "Postal code",
  utilities: "Utilities",
};

function comparable(type: ClaimType, c: ClaimRecord): string {
  if (type === "address") return addressCore(c.normalized);
  return c.normalized;
}

function display(type: ClaimType, c: ClaimRecord): string {
  if (type === "rent" || type === "deposit") {
    const cents = centsOf(c);
    return cents !== null ? formatCents(cents) : c.value;
  }
  return c.value;
}

const RECOMMEND: Partial<Record<ClaimType, string>> = {
  rent: "Ask for the correct monthly rent in writing and, if a lease is involved, a corrected lease before signing or paying anything.",
  deposit: "Ask the landlord to confirm the deposit amount in writing. Remember the deposit cannot exceed half a month's rent.",
  address: "Confirm the exact unit address in writing and check that it matches the lease and any viewing.",
  bedrooms: "Clarify the unit layout and confirm it during a viewing.",
  bathrooms: "Clarify the unit layout and confirm it during a viewing.",
  lease_term: "Confirm the lease type (periodic or fixed-term) and its dates before signing.",
  move_in_date: "Confirm the move-in date in writing.",
  postal_code: "Confirm the full address including the postal code.",
};

export interface ReconcileResult {
  links: LinkDraft[];
  findings: FindingDraft[];
  contradictedClaimIds: Set<string>;
}

export function reconcile(s: CaseSnapshot): ReconcileResult {
  const claims = activeClaims(s);
  const evById = evidenceMap(s);
  const links: LinkDraft[] = [];
  const findings: FindingDraft[] = [];
  const contradicted = new Set<string>();

  for (const type of SINGLE_VALUED) {
    const list = byType(claims, type);
    if (list.length < 2) continue;
    // Compare across different evidence items only.
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        if (a.evidenceId === b.evidenceId) continue;
        const same = comparable(type, a) === comparable(type, b);
        const [earlier, later] = evidenceTime(evById.get(a.evidenceId)) <= evidenceTime(evById.get(b.evidenceId)) ? [a, b] : [b, a];
        const bothMessages = isMessageEvidence(evById.get(a.evidenceId)) && isMessageEvidence(evById.get(b.evidenceId));
        links.push({
          fromClaimId: later.id,
          toClaimId: earlier.id,
          relation: same ? "supports" : bothMessages ? "updates" : "contradicts",
          explanation: same
            ? `${LABEL[type]} matches between ${evidenceLabel(evById.get(later.evidenceId))} and ${evidenceLabel(evById.get(earlier.evidenceId))}.`
            : `${LABEL[type]} differs: ${display(type, later)} vs ${display(type, earlier)}.`,
        });
      }
    }

    // Distinct values present → contradiction finding.
    const groups = new Map<string, ClaimRecord[]>();
    for (const c of list) {
      const k = comparable(type, c);
      groups.set(k, [...(groups.get(k) ?? []), c]);
    }
    const distinctEvidence = new Set(list.map((c) => c.evidenceId));
    if (groups.size < 2 || distinctEvidence.size < 2) continue;
    // Ignore when all differing values come from the same single evidence item.
    const valueEvidence = [...groups.values()].map((g) => new Set(g.map((c) => c.evidenceId)));
    const crossEvidence = valueEvidence.some((setA, i) => valueEvidence.some((setB, j) => i !== j && [...setA].some((x) => !setB.has(x)) && [...setB].some((y) => !setA.has(y))));
    if (!crossEvidence) continue;

    for (const c of list) contradicted.add(c.id);
    const lines = [...groups.values()].map((g) => {
      const sources = g.map((c) => `${evidenceLabel(evById.get(c.evidenceId))}${c.locator ? ` (${c.locator})` : ""}`).join("; ");
      return `${display(type, g[0]!)} — ${sources}`;
    });
    const involvesLease = list.some((c) => isLeaseEvidence(evById.get(c.evidenceId)));
    const involvesListing = list.some((c) => isListingEvidence(evById.get(c.evidenceId)));
    const allMessages = list.every((c) => isMessageEvidence(evById.get(c.evidenceId)));

    let title = `${LABEL[type]} is inconsistent across sources`;
    if (involvesLease && involvesListing) title = `${LABEL[type]} in the lease differs from the advertisement`;
    else if (allMessages) title = `${LABEL[type]} changed between messages`;

    // Note when a later message agrees with the listing but the lease still differs.
    let note = "";
    if (involvesLease) {
      const leaseVals = new Set(list.filter((c) => isLeaseEvidence(evById.get(c.evidenceId))).map((c) => comparable(type, c)));
      const msgAgreesWithListing = list.some(
        (c) => isMessageEvidence(evById.get(c.evidenceId)) && !leaseVals.has(comparable(type, c)),
      );
      if (msgAgreesWithListing) {
        note =
          " A message states a different amount than the lease, but a message does not change a written lease; a corrected lease would resolve this.";
      }
    }

    findings.push({
      key: `contradiction:${type}`,
      category: "contradiction",
      label: "contradicted",
      severity: type === "rent" || type === "deposit" || type === "address" ? "serious" : "caution",
      title,
      explanation: `The evidence contains different values: ${lines.join(" | ")}.${note} This is a documented discrepancy — it does not by itself establish intent.`,
      recommendation: RECOMMEND[type],
      claimIds: list.map((c) => c.id),
      evidenceIds: [...distinctEvidence],
      requiresHumanReview: false,
    });
  }

  findings.push(...utilitiesConflicts(claims, evById, contradicted));
  findings.push(...contactAndRecipientChecks(claims, evById));
  return { links, findings, contradictedClaimIds: contradicted };
}

function utilitiesConflicts(claims: ClaimRecord[], evById: ReturnType<typeof evidenceMap>, contradicted: Set<string>): FindingDraft[] {
  const util = byType(claims, "utilities");
  const included = new Map<string, ClaimRecord[]>();
  const tenantPays = new Map<string, ClaimRecord[]>();
  for (const c of util) {
    const [mode, items] = c.normalized.split(":");
    for (const item of (items ?? "").split(",").filter(Boolean)) {
      const key = item === "power" ? "electricity" : item;
      const target = mode === "included" ? included : tenantPays;
      target.set(key, [...(target.get(key) ?? []), c]);
    }
  }
  const out: FindingDraft[] = [];
  for (const [item, inc] of included) {
    const pays = tenantPays.get(item) ?? (item !== "utilities" ? tenantPays.get("utilities") : undefined);
    if (!pays) continue;
    const pairs = [...inc, ...pays];
    if (new Set(pairs.map((c) => c.evidenceId)).size < 2) continue;
    pairs.forEach((c) => contradicted.add(c.id));
    out.push({
      key: `contradiction:utilities:${item}`,
      category: "contradiction",
      label: "contradicted",
      severity: "caution",
      title: `Conflicting information about who pays for ${item}`,
      explanation: `${inc.map((c) => `“${c.value}” in ${evidenceLabel(evById.get(c.evidenceId))}`).join("; ")} conflicts with ${pays
        .map((c) => `“${c.value}” in ${evidenceLabel(evById.get(c.evidenceId))}`)
        .join("; ")}.`,
      recommendation: "Ask which utilities are included in rent and make sure the lease states it.",
      claimIds: pairs.map((c) => c.id),
      evidenceIds: [...new Set(pairs.map((c) => c.evidenceId))],
      requiresHumanReview: false,
    });
  }
  return out;
}

function contactAndRecipientChecks(claims: ClaimRecord[], evById: ReturnType<typeof evidenceMap>): FindingDraft[] {
  const out: FindingDraft[] = [];
  const names = byType(claims, "contact_name");
  const emails = byType(claims, "contact_email");
  const recipients = byType(claims, "payment_recipient");

  // Payment recipient vs advertiser identity
  const unmatched = recipients.filter((r) => {
    const [kind, val] = [r.normalized.slice(0, r.normalized.indexOf(":")), r.normalized.slice(r.normalized.indexOf(":") + 1)];
    if (kind === "email") return !emails.some((e) => e.normalized === val && isListingEvidence(evById.get(e.evidenceId)));
    return !names.some((n) => namesCompatible(n.value, val));
  });
  if (unmatched.length > 0 && (names.length > 0 || emails.length > 0)) {
    const uniqueNames = [...new Set(names.map((n) => n.value))].sort((a, b) => b.length - a.length).filter((n, i, arr) => !arr.slice(0, i).some((longer) => namesCompatible(longer, n)));
    const advertised = uniqueNames.join(", ") || [...new Set(emails.map((e) => e.value))].join(", ");
    out.push({
      key: "warning:payment_recipient_differs",
      category: "warning",
      label: "warning",
      severity: "caution",
      title: "Payment recipient differs from the person you've been dealing with",
      explanation: `Payment is directed to ${unmatched.map((r) => `“${r.value}”`).join(", ")}, while the rental contact is ${advertised}. There can be legitimate reasons (for example, a property manager), but this should be explained and independently verified before any money is sent.`,
      recommendation: "Ask who the recipient is and request verifiable proof of their authority to collect payment on the owner's behalf.",
      claimIds: [...unmatched.map((r) => r.id), ...names.map((n) => n.id)],
      evidenceIds: [...new Set([...unmatched, ...names].map((c) => c.evidenceId))],
      requiresHumanReview: false,
    });
  }

  // Recipient changed across evidence
  const recipientValues = new Map<string, ClaimRecord[]>();
  for (const r of recipients) recipientValues.set(r.normalized, [...(recipientValues.get(r.normalized) ?? []), r]);
  if (recipientValues.size > 1 && new Set(recipients.map((r) => r.evidenceId)).size > 1) {
    out.push({
      key: "contradiction:payment_recipient_changed",
      category: "contradiction",
      label: "contradicted",
      severity: "serious",
      title: "The payment recipient changed",
      explanation: `Different payment recipients appear across the evidence: ${[...recipientValues.values()]
        .map((g) => `“${g[0]!.value}” (${evidenceLabel(evById.get(g[0]!.evidenceId))})`)
        .join(" → ")}. Changed payment details are a common point of failure; confirm through an independently found contact before paying.`,
      recommendation: "Do not send money to new payment details without confirming them through an independently verified channel.",
      claimIds: recipients.map((r) => r.id),
      evidenceIds: [...new Set(recipients.map((r) => r.evidenceId))],
      requiresHumanReview: false,
    });
  }

  // Contact names that don't match each other across evidence
  const incompatible: ClaimRecord[][] = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      if (names[i]!.evidenceId !== names[j]!.evidenceId && !namesCompatible(names[i]!.value, names[j]!.value)) incompatible.push([names[i]!, names[j]!]);
    }
  }
  if (incompatible.length > 0) {
    const involved = [...new Set(incompatible.flat())];
    out.push({
      key: "warning:contact_name_changed",
      category: "warning",
      label: "warning",
      severity: "caution",
      title: "Different names are used for the rental contact",
      explanation: `The evidence names ${[...new Set(involved.map((c) => `“${c.value}”`))].join(" and ")} as the contact. This may be a property manager and owner, but the relationship should be clarified.`,
      recommendation: "Ask who owns the unit and who manages it, and how to confirm each independently.",
      claimIds: involved.map((c) => c.id),
      evidenceIds: [...new Set(involved.map((c) => c.evidenceId))],
      requiresHumanReview: false,
    });
  }
  return out;
}
