/**
 * Deterministic lease analysis: terms with page references, clause
 * segmentation and classification, rule checks, listing comparison,
 * revision diffs and clarification questions. Missing terms are reported,
 * never inferred.
 */
import { extractClaims, type ExtractedClaim } from "../extraction/extract-claims";
import { pageOf } from "../extraction/normalize";
import { formatCents } from "@/lib/money";
import { maxDepositCents } from "../legal/rules";
import { RULE_BY_KEY, SOURCE_BY_KEY } from "../legal/catalog";

export type ClauseClass = "standard" | "clear_rule_violation" | "potential_issue" | "unusual_term" | "incomplete_extraction" | "unverified_interpretation";

export interface LeaseClauseResult {
  clauseType: string;
  heading: string | null;
  text: string;
  page: number | null;
  startOffset: number;
  endOffset: number;
  classification: ClauseClass;
  explanation: string | null;
  ruleKey: string | null;
  citationUrl: string | null;
}

export interface LeaseTerms {
  rentCents: number | null;
  depositCents: number | null;
  leaseType: "fixed_term" | "year_to_year" | "month_to_month" | "week_to_week" | "unknown";
  leaseTermLabel: string | null;
  startDate: string | null;
  endDate: string | null;
  utilitiesIncluded: string[];
  utilitiesTenantPays: string[];
  parking: string | null;
  pets: string | null;
  lateFee: string | null;
  otherFees: string[];
  landlordName: string | null;
  address: string | null;
  sources: Record<string, { excerpt: string; locator: string }>;
}

export interface LeaseAnalysis {
  terms: LeaseTerms;
  clauses: LeaseClauseResult[];
  missingTerms: string[];
  comparison: Array<{ field: string; lease: string; listing: string; match: boolean }>;
  questions: string[];
  counts: Record<ClauseClass, number>;
}

const CLAUSE_TYPES: Array<[string, RegExp]> = [
  ["rent", /\brent\b/i],
  ["deposit", /\bdeposit\b/i],
  ["utilities", /\b(utilit|heat|hot water|electric|power|internet)/i],
  ["parking", /\bparking|driveway|garage\b/i],
  ["entry", /\b(enter|entry|access|inspect)/i],
  ["termination", /\b(terminat|notice to quit|end of (the )?lease|vacate|renew)/i],
  ["pets", /\bpets?\b|\bdogs?\b|\bcats?\b/i],
  ["maintenance", /\b(repair|maintain|maintenance|damage)/i],
  ["fees", /\bfee|charge|penalt/i],
  ["subletting", /\bsublet|assign/i],
  ["insurance", /\binsurance\b/i],
  ["rules", /\brules?\b|\bquiet|smok/i],
];

const cite = (k: string) => {
  const r = RULE_BY_KEY.get(k);
  return { ruleKey: k, citationUrl: r ? SOURCE_BY_KEY.get(r.sourceKey)?.url ?? null : null };
};

export function segmentClauses(text: string): Array<{ heading: string | null; text: string; start: number; end: number }> {
  const out: Array<{ heading: string | null; text: string; start: number; end: number }> = [];
  const re = /(^|\n)\s*((?:\d{1,2}(?:\.\d+)?[.)]|[A-Z][A-Za-z ]{2,40}:)\s*)/g;
  const marks: Array<{ idx: number; heading: string }> = [];
  for (const m of text.matchAll(re)) marks.push({ idx: (m.index ?? 0) + (m[1]?.length ?? 0), heading: m[2]!.trim() });
  if (marks.length < 2) {
    let cursor = 0;
    for (const para of text.split(/\n\s*\n|\n(?=[A-Z])/)) {
      const start = text.indexOf(para, cursor);
      cursor = start + para.length;
      if (para.trim().length > 15) out.push({ heading: null, text: para.trim(), start, end: start + para.length });
    }
    return out;
  }
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i]!.idx;
    const end = i + 1 < marks.length ? marks[i + 1]!.idx : text.length;
    const body = text.slice(start, end).trim();
    if (body.length > 10) out.push({ heading: marks[i]!.heading.replace(/[:.)]$/, ""), text: body, start, end });
  }
  return out;
}

function firstClaim(claims: ExtractedClaim[], t: string) {
  return claims.find((c) => c.claimType === t);
}

export function analyzeLease(text: string, pageTexts: string[] | null, listing?: { rentCents?: number | null; depositCents?: number | null; utilitiesIncluded?: string[] } | null): LeaseAnalysis {
  const claims = extractClaims(text, { sourceKind: "lease", pageTexts });
  const sources: LeaseTerms["sources"] = {};
  const take = (k: string, c?: ExtractedClaim) => {
    if (c) sources[k] = { excerpt: c.excerpt, locator: c.locator };
    return c;
  };
  const rent = take("rent", firstClaim(claims, "rent"));
  const deposit = take("deposit", firstClaim(claims, "deposit"));
  const term = take("leaseTerm", firstClaim(claims, "lease_term"));
  const start = take("startDate", firstClaim(claims, "move_in_date"));
  const endMatch = text.match(/\b(?:ending|ends|terminat(?:es|ing)|expir(?:es|ing))\s+(?:on\s+)?((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s*\d{4}|\d{4}-\d{2}-\d{2})/i);
  const util = claims.filter((c) => c.claimType === "utilities");
  const inc = util.filter((u) => u.normalized.startsWith("included:")).flatMap((u) => u.normalized.split(":")[1]!.split(","));
  const pays = util.filter((u) => u.normalized.startsWith("tenant_pays:")).flatMap((u) => u.normalized.split(":")[1]!.split(","));
  const late = take("lateFee", firstClaim(claims, "late_fee"));
  const fees = claims.filter((c) => ["application_fee", "holding_fee", "pet_deposit", "other_upfront_fee"].includes(c.claimType));
  const landlord = text.match(/\bLandlord\s*(?:name)?\s*[:\-]\s*([A-Z][\w.'-]+(?:\s+[A-Z][\w.'-]+){0,3})/);

  const leaseType: LeaseTerms["leaseType"] = term?.normalized.startsWith("fixed_term") || (term && /months:/.test(term.normalized) && /fixed/i.test(text))
    ? "fixed_term"
    : term?.normalized === "year_to_year" || /months:12/.test(term?.normalized ?? "")
      ? "year_to_year"
      : term?.normalized === "month_to_month"
        ? "month_to_month"
        : term?.normalized === "week_to_week"
          ? "week_to_week"
          : "unknown";

  const terms: LeaseTerms = {
    rentCents: rent ? Number(rent.normalized) : null,
    depositCents: deposit ? Number(deposit.normalized) : null,
    leaseType,
    leaseTermLabel: term?.value ?? null,
    startDate: start?.value ?? null,
    endDate: endMatch?.[1] ?? null,
    utilitiesIncluded: [...new Set(inc)],
    utilitiesTenantPays: [...new Set(pays)],
    parking: firstClaim(claims, "parking")?.value ?? null,
    pets: firstClaim(claims, "pets")?.value ?? null,
    lateFee: late?.value ?? null,
    otherFees: fees.map((f) => `${f.claimType.replace(/_/g, " ")}: ${f.value}`),
    landlordName: landlord?.[1] ?? firstClaim(claims, "contact_name")?.value ?? null,
    address: firstClaim(claims, "address")?.value ?? null,
    sources,
  };

  const clauses: LeaseClauseResult[] = segmentClauses(text).map((seg) => {
    const type = CLAUSE_TYPES.find(([, re]) => re.test(seg.text))?.[0] ?? "general";
    const page = pageOf(pageTexts, seg.start);
    let classification: ClauseClass = "standard";
    let explanation: string | null = null;
    let rule: { ruleKey: string | null; citationUrl: string | null } = { ruleKey: null, citationUrl: null };
    const lower = seg.text.toLowerCase();

    if (type === "deposit" && terms.rentCents && terms.depositCents && seg.text.includes(formatCents(terms.depositCents).replace(/^\$/, "").split(".")[0]!)) {
      const max = maxDepositCents(terms.rentCents);
      if (terms.depositCents > max) {
        classification = "clear_rule_violation";
        explanation = `Deposit of ${formatCents(terms.depositCents)} exceeds the ${formatCents(max)} maximum (half of ${formatCents(terms.rentCents)} rent), based on the amounts in this lease.`;
        rule = cite("NS-DEPOSIT-MAX");
      }
    }
    if (/non-?refundable/.test(lower) && /deposit/.test(lower)) {
      classification = "potential_issue";
      explanation = "A “non-refundable” deposit conflicts with the requirement that deposits be returned (or claimed through the Director) within 10 days of the lease ending.";
      rule = cite("NS-DEPOSIT-RETURN");
    }
    if (/application fee|processing fee|screening fee/.test(lower)) {
      classification = "clear_rule_violation";
      explanation = "Application fees are prohibited in Nova Scotia.";
      rule = cite("NS-APPLICATION-FEE");
    }
    if (/pet (deposit|fee)/.test(lower)) {
      classification = "clear_rule_violation";
      explanation = "The official Renting Guide states a landlord can't charge an additional deposit for pets.";
      rule = cite("NS-PET-DEPOSIT");
    }
    if (type === "fees" && /late/.test(lower)) {
      const pct = lower.match(/(\d+(?:\.\d+)?)\s?%/);
      const amt = seg.text.match(/\$\s?(\d+(?:\.\d{2})?)/);
      const perDay = /per day|daily|each day/.test(lower);
      const over = pct ? Number(pct[1]) > 1 : amt && terms.rentCents ? Number(amt[1]) * 100 * (perDay ? 30 : 1) > terms.rentCents * 0.01 : false;
      if (over) {
        classification = "potential_issue";
        explanation = `This late charge appears higher than the 1% of monthly rent per month described in the official Renting Guide${perDay ? " (it is charged per day)" : ""}.`;
        rule = cite("NS-LATE-FEE");
      }
    }
    if (type === "entry" && /(at any time|without (prior )?notice|any time)/.test(lower)) {
      classification = "potential_issue";
      explanation = "Entry without notice conflicts with the official guidance of 24 hours' written notice (except emergencies), during daylight hours.";
      rule = cite("NS-ENTRY-NOTICE");
    }
    if (/(tenant|tenants) (is|are|shall be) responsible for all (repairs|maintenance)|waives?|give[s]? up (any|all) rights/.test(lower)) {
      classification = "potential_issue";
      explanation = "This clause may try to remove obligations that apply under the Standard Form of Lease (for example, the landlord's duty to keep the premises fit). Interpretation requires review.";
      rule = cite("NS-STANDARD-FORM");
    }
    if (classification === "standard" && /(at the landlord'?s (sole )?discretion|as determined by the landlord|reasonable (fees|charges)|any other charges)/.test(lower)) {
      classification = "unusual_term";
      explanation = "Open-ended wording — ask for the specific amounts or conditions in writing.";
    }
    if (classification === "standard" && /\bincrease/.test(lower) && /rent/.test(lower) && leaseType === "fixed_term" && !/\$\s?\d/.test(seg.text)) {
      classification = "unverified_interpretation";
      explanation = "For fixed-term leases, the amounts and dates of any rent increases must be stated in the lease. This clause mentions increases without specific amounts.";
      rule = cite("NS-RENT-INCREASE-NOTICE");
    }
    if (classification === "standard" && seg.text.length < 25) classification = "incomplete_extraction";
    return { clauseType: type, heading: seg.heading, text: seg.text.slice(0, 2000), page, startOffset: seg.start, endOffset: seg.end, classification, explanation, ...rule };
  });

  const missingTerms: string[] = [];
  if (!terms.rentCents) missingTerms.push("Monthly rent amount");
  if (!terms.startDate) missingTerms.push("Start date of the lease");
  if (terms.leaseType === "unknown") missingTerms.push("Lease type (fixed-term or periodic)");
  if (terms.depositCents === null) missingTerms.push("Security deposit amount (or a statement that there is none)");
  if (!terms.landlordName && !/landlord/i.test(text)) missingTerms.push("Landlord or agent contact information");
  if (terms.utilitiesIncluded.length === 0 && terms.utilitiesTenantPays.length === 0) missingTerms.push("Which utilities and services are included in rent");
  if (!/(notice|terminat|end)/i.test(text)) missingTerms.push("Requirements for ending the lease");

  const comparison: LeaseAnalysis["comparison"] = [];
  if (listing) {
    if (listing.rentCents && terms.rentCents) comparison.push({ field: "Monthly rent", lease: formatCents(terms.rentCents), listing: formatCents(listing.rentCents), match: listing.rentCents === terms.rentCents });
    if (listing.depositCents && terms.depositCents) comparison.push({ field: "Deposit", lease: formatCents(terms.depositCents), listing: formatCents(listing.depositCents), match: listing.depositCents === terms.depositCents });
    if (listing.utilitiesIncluded?.length) {
      const conflicts = listing.utilitiesIncluded.filter((u) => terms.utilitiesTenantPays.includes(u));
      comparison.push({ field: "Utilities", lease: terms.utilitiesTenantPays.length ? `Tenant pays: ${terms.utilitiesTenantPays.join(", ")}` : terms.utilitiesIncluded.join(", ") || "Not stated", listing: `Included: ${listing.utilitiesIncluded.join(", ")}`, match: conflicts.length === 0 });
    }
  }

  const questions: string[] = [];
  for (const c of clauses.filter((x) => x.classification === "clear_rule_violation" || x.classification === "potential_issue")) {
    questions.push(`Regarding “${(c.heading ?? c.text).slice(0, 60)}…”: ${c.explanation} Could this be corrected in the lease?`);
  }
  for (const m of missingTerms) questions.push(`The lease doesn't clearly state: ${m}. Could you add it?`);
  for (const x of comparison.filter((y) => !y.match)) questions.push(`The ${x.field.toLowerCase()} in the lease (${x.lease}) differs from the advertisement (${x.listing}). Which is correct?`);

  const counts = { standard: 0, clear_rule_violation: 0, potential_issue: 0, unusual_term: 0, incomplete_extraction: 0, unverified_interpretation: 0 } as Record<ClauseClass, number>;
  for (const c of clauses) counts[c.classification]++;
  return { terms, clauses, missingTerms, comparison, questions: questions.slice(0, 10), counts };
}

export function diffTerms(prev: LeaseTerms, next: LeaseTerms): Array<{ field: string; before: string; after: string }> {
  const f = (v: unknown) => (v === null || v === undefined || (Array.isArray(v) && v.length === 0) ? "—" : Array.isArray(v) ? v.join(", ") : typeof v === "number" ? formatCents(v) : String(v));
  const fields: Array<[string, keyof LeaseTerms]> = [
    ["Monthly rent", "rentCents"],
    ["Deposit", "depositCents"],
    ["Lease type", "leaseType"],
    ["Start date", "startDate"],
    ["End date", "endDate"],
    ["Utilities included", "utilitiesIncluded"],
    ["Tenant pays", "utilitiesTenantPays"],
    ["Late fee", "lateFee"],
    ["Parking", "parking"],
  ];
  return fields.map(([label, k]) => ({ field: label, before: f(prev[k]), after: f(next[k]) })).filter((r) => r.before !== r.after);
}
