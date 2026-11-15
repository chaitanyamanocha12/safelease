/**
 * Risk indicator assessment. Indicators are "potential warning signs" with
 * the evidence that triggered them — never a fraud probability.
 *
 * Deliberately NOT indicators on their own: low rent, a foreign phone
 * number, writing style, or the landlord living elsewhere.
 */
import { formatCents } from "@/lib/money";
import { hostnameOf } from "../extraction/normalize";
import { activeClaims, byType, centsOf, evidenceLabel, evidenceMap } from "./active";
import type { CaseSnapshot, ClaimRecord, FindingDraft } from "./types";

const SHORTENERS = new Set(["bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "cutt.ly", "rb.gy", "ow.ly", "shorturl.at", "tiny.cc"]);
const OFFICIAL: Record<string, string[]> = {
  kijiji: ["kijiji.ca"],
  facebook: ["facebook.com", "fb.com", "m.facebook.com"],
  rentals: ["rentals.ca"],
  realtor: ["realtor.ca"],
  interac: ["interac.ca"],
  paypal: ["paypal.com"],
  airbnb: ["airbnb.ca", "airbnb.com"],
};

export function linkConcern(url: string): string | null {
  const host = hostnameOf(url);
  if (!host) return "The link could not be parsed.";
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return "The link points to a raw IP address rather than a named website.";
  if (host.includes("xn--")) return "The link uses an internationalized (punycode) domain, which can imitate other sites.";
  if (SHORTENERS.has(host)) return "The link uses a URL shortener that hides the destination.";
  for (const [brand, domains] of Object.entries(OFFICIAL)) {
    if (host.includes(brand) && !domains.some((d) => host === d || host.endsWith(`.${d}`))) {
      return `The domain “${host}” contains “${brand}” but is not an official ${brand} domain.`;
    }
  }
  if (url.startsWith("http://")) return "The link does not use HTTPS.";
  return null;
}

function f(
  key: string,
  severity: FindingDraft["severity"],
  title: string,
  explanation: string,
  recommendation: string,
  claims: ClaimRecord[],
  category: FindingDraft["category"] = "warning",
  label: FindingDraft["label"] = "warning",
): FindingDraft {
  return {
    key,
    category,
    label,
    severity,
    title,
    explanation,
    recommendation,
    claimIds: claims.map((c) => c.id),
    evidenceIds: [...new Set(claims.map((c) => c.evidenceId))],
    requiresHumanReview: false,
  };
}

export function assessIndicators(s: CaseSnapshot): FindingDraft[] {
  const claims = activeClaims(s);
  const ev = evidenceMap(s);
  const out: FindingDraft[] = [];
  const quote = (c: ClaimRecord) => `“${c.value}” (${evidenceLabel(ev.get(c.evidenceId))}${c.locator ? `, ${c.locator}` : ""})`;

  const urgency = byType(claims, "urgency");
  const requested = byType(claims, "requested_payment");
  const deposits = byType(claims, "deposit");
  const viewing = byType(claims, "viewing_availability");
  const refused = viewing.filter((v) => v.normalized === "refused_or_unavailable");
  const offered = viewing.filter((v) => v.normalized === "offered");
  const away = byType(claims, "landlord_location");
  const methods = byType(claims, "payment_method");
  const sensitive = byType(claims, "sensitive_info_request");
  const links = byType(claims, "link");
  const viewingConfirmed = s.checks.some((c) => c.checkType === "viewing_confirmed" && c.status === "supported");
  const paymentAsked = requested.length > 0 || (deposits.length > 0 && urgency.length > 0);

  if (urgency.length > 0 && paymentAsked) {
    out.push(
      f(
        "warning:payment_pressure",
        "serious",
        "Pressure to pay quickly",
        `The advertiser urges a fast payment: ${urgency.map(quote).join("; ")}. Time pressure discourages verification. Legitimate landlords can usually wait for a viewing and a signed lease.`,
        "Do not pay under time pressure. Ask for a viewing and a written lease first.",
        [...urgency, ...requested],
      ),
    );
  } else if (urgency.length > 0) {
    out.push(
      f(
        "context:urgency_language",
        "info",
        "Urgency language noted",
        `The evidence includes urgency wording: ${urgency.map(quote).join("; ")}. This is common in busy rental markets and is not a warning sign by itself.`,
        "Take the time you need to verify before committing.",
        urgency,
        "context",
        "unverified",
      ),
    );
  }

  if (refused.length > 0) {
    out.push(
      f(
        "warning:viewing_refused",
        paymentAsked ? "serious" : "caution",
        paymentAsked ? "Payment requested without an opportunity to view the unit" : "In-person viewing not offered",
        `${refused.map(quote).join("; ")}.${paymentAsked ? " Money has been requested before you could confirm the unit exists and is available." : ""} Requests to pay before any viewing or independent verification are a frequently reported rental-scam pattern, though not proof of one.`,
        "Ask for an in-person viewing, or a live video tour with someone you can verify, before paying.",
        [...refused, ...requested],
      ),
    );
  } else if (paymentAsked && offered.length === 0 && !viewingConfirmed) {
    out.push(
      f(
        "warning:payment_before_viewing",
        "caution",
        "Payment requested before a viewing is recorded",
        `A payment was requested (${requested.map(quote).join("; ") || "deposit"}), and no viewing is recorded in this case yet.`,
        "Record a viewing (or why it isn't possible) before paying.",
        requested,
      ),
    );
  }

  if (away.length > 0) {
    out.push(
      f(
        "context:landlord_not_local",
        "info",
        "Advertiser says they are not available in person",
        `${away.map(quote).join("; ")}. Living elsewhere is not a warning sign on its own; it matters when no one can show the unit or be independently verified.`,
        "Ask who can show the unit locally and how their authority can be confirmed.",
        away,
        "context",
        "unverified",
      ),
    );
  }

  const hardToReverse = methods.filter((m) => ["wire", "money_transfer_service", "crypto", "gift_card"].includes(m.normalized));
  if (hardToReverse.length > 0) {
    out.push(
      f(
        "warning:unusual_payment_method",
        "serious",
        "Unusual, hard-to-reverse payment method requested",
        `${hardToReverse.map(quote).join("; ")}. Wire transfers, money-transfer services, cryptocurrency and gift cards are very difficult to recover if something goes wrong.`,
        "Use a traceable payment method, and only after verifying the landlord and signing a lease.",
        hardToReverse,
      ),
    );
  }

  const bankish = sensitive.filter((x) => ["bank_credentials", "credit_card"].includes(x.normalized));
  const idDocs = sensitive.filter((x) => ["passport", "drivers_licence", "identity_document"].includes(x.normalized));
  if (bankish.length > 0) {
    out.push(
      f(
        "warning:sensitive_financial_info",
        "serious",
        "Request for banking credentials or card details",
        `${bankish.map(quote).join("; ")}. A landlord never needs your online-banking login or full card details.`,
        "Do not share banking logins or card numbers.",
        bankish,
      ),
    );
  }
  if (idDocs.length > 0) {
    out.push(
      f(
        "warning:identity_documents_requested",
        "caution",
        "Identity documents requested before verification",
        `${idDocs.map(quote).join("; ")}. Copies of identity documents can be misused. Share the minimum necessary, and only after you have verified who you're dealing with.`,
        "Ask what the document is needed for, and consider redacting numbers not required.",
        idDocs,
      ),
    );
  }

  const suspicious = links.map((l) => ({ l, concern: linkConcern(l.value) })).filter((x) => x.concern);
  if (suspicious.length > 0) {
    out.push(
      f(
        "warning:suspicious_link",
        "caution",
        "Link with unusual characteristics",
        suspicious.map((x) => `${x.l.value}: ${x.concern}`).join(" "),
        "Don't enter personal or payment details through links sent by the advertiser; go to platforms directly.",
        suspicious.map((x) => x.l),
      ),
    );
  }

  // Implausible layout combinations (structural only; rent is not used).
  const beds = byType(claims, "bedrooms").map((c) => Number(c.normalized));
  const baths = byType(claims, "bathrooms").map((c) => Number(c.normalized));
  if (beds.length && baths.length && Math.max(...baths) > Math.max(...beds) + 2) {
    out.push(
      f(
        "warning:implausible_layout",
        "info",
        "Unusual combination of bedrooms and bathrooms",
        `The evidence lists ${Math.max(...beds)} bedroom(s) and ${Math.max(...baths)} bathroom(s). This may be an extraction or typing error.`,
        "Confirm the layout with the advertiser and during a viewing.",
        [...byType(claims, "bedrooms"), ...byType(claims, "bathrooms")],
      ),
    );
  }

  // Image reuse
  for (const m of s.imageMatches ?? []) {
    const conflicts = m.conflictingDetails?.length ? ` The other listing shows different details: ${m.conflictingDetails.join("; ")}.` : "";
    out.push({
      key: `image:${m.matchType}:${m.evidenceId}:${m.matchedListingId ?? m.matchedEvidenceId ?? m.matchedLabel}`,
      category: "image",
      label: "warning",
      severity: m.conflictingDetails?.length ? "caution" : "info",
      title: m.matchType === "local_exact" ? "Identical photo found elsewhere" : m.matchType === "web_match" ? "Photo found on other web pages" : "Visually similar photo found elsewhere",
      explanation: `A photo in this case ${m.matchType === "local_exact" ? "is identical to" : "closely matches"} an image from ${m.matchedLabel} (perceptual distance ${m.distance}).${conflicts} Reused photos can be legitimate (for example, a building's marketing images) and are not proof of fraud.`,
      recommendation: "Ask the advertiser about the photos and confirm the unit during a viewing.",
      claimIds: [],
      evidenceIds: [m.evidenceId, ...(m.matchedEvidenceId ? [m.matchedEvidenceId] : [])],
      requiresHumanReview: Boolean(m.conflictingDetails?.length),
    });
  }

  // Rent context (informational only).
  const rents = byType(claims, "rent").map(centsOf).filter((x): x is number => x !== null);
  if (s.rentContext && rents.length > 0 && s.rentContext.count >= 3) {
    const rent = Math.max(...rents);
    const diff = ((rent - s.rentContext.medianCents) / s.rentContext.medianCents) * 100;
    out.push({
      key: "context:rent_comparison",
      category: "context",
      label: "unverified",
      severity: "info",
      title: `Asking rent is ${Math.abs(diff).toFixed(0)}% ${diff < 0 ? "below" : "above"} comparable ${s.rentContext.isDemo ? "DEMO " : ""}listings`,
      explanation: `${formatCents(rent)} compared with a median of ${formatCents(s.rentContext.medianCents)} across ${s.rentContext.count} ${s.rentContext.sourceLabel} listings${s.rentContext.bedrooms !== null ? ` with ${s.rentContext.bedrooms} bedroom(s)` : ""}. Price alone is never evidence of fraud.${s.rentContext.isDemo ? " The comparison set is fictional demonstration inventory, not market data." : ""}`,
      recommendation: undefined,
      claimIds: byType(claims, "rent").map((c) => c.id),
      evidenceIds: [...new Set(byType(claims, "rent").map((c) => c.evidenceId))],
      requiresHumanReview: false,
    });
  }

  return out;
}
