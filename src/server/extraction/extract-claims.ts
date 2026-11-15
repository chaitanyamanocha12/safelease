/**
 * Deterministic claim extraction from listing text, landlord messages and
 * lease text. Every claim carries the exact source excerpt and a locator.
 *
 * Design rules:
 *  - Extraction ≠ verification. Every claim starts "unverified".
 *  - Ambiguous amounts (no context keyword) are NOT assigned a meaning.
 *  - Writing style, landlord nationality/location and low rent are never
 *    treated as fraud signals on their own.
 */
import type { ClaimType } from "../db/schema/investigations";
import { parseMoneyToCents } from "@/lib/money";
import {
  excerptAround,
  hostnameOf,
  lineOf,
  normalizeAddress,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  pageOf,
  sentenceAround,
} from "./normalize";

export interface ExtractedClaim {
  claimType: ClaimType;
  value: string;
  normalized: string;
  excerpt: string;
  locator: string;
  confidence: "high" | "medium" | "low";
  start: number;
  end: number;
}

export interface ExtractOptions {
  /** Per-page text for PDF locators. The full text must equal pageTexts.join("\n\n"). */
  pageTexts?: string[] | null;
  /** Context of the source — affects which claims are meaningful. */
  sourceKind?: "listing" | "message" | "lease" | "other";
}

const MONTHS = "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";

const NS_COMMUNITIES = [
  "Halifax",
  "Dartmouth",
  "Bedford",
  "Lower Sackville",
  "Middle Sackville",
  "Sackville",
  "Clayton Park",
  "Spryfield",
  "Cole Harbour",
  "Fall River",
  "Timberlea",
  "Hammonds Plains",
  "Eastern Passage",
  "Truro",
  "Wolfville",
  "Antigonish",
  "Sydney",
  "Kentville",
  "Lunenburg",
  "Windsor",
  "New Glasgow",
  "Yarmouth",
];

const NAME_STOPWORDS = new Set(
  [
    "currently",
    "interested",
    "available",
    "sorry",
    "happy",
    "away",
    "out",
    "not",
    "the",
    "very",
    "glad",
    "looking",
    "writing",
    "here",
    "ready",
    "sure",
    "just",
    "also",
    "back",
    "still",
    "unable",
    "the landlord",
    "landlord",
    "owner",
    "renting",
    "travelling",
    "traveling",
    "working",
    "please",
    "hello",
    "hi",
    "thanks",
    "thank",
    "regards",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
    "interac",
    "halifax",
    "dartmouth",
    "bedford",
  ].map((s) => s.toLowerCase()),
);

const NAME = "([A-Z][a-z]+(?:[-'][A-Z][a-z]+)?(?:\\s+[A-Z][a-z]+(?:[-'][A-Z][a-z]+)?){0,2})";

function makeLocator(text: string, start: number, opts: ExtractOptions): string {
  const page = pageOf(opts.pageTexts, start);
  if (page !== null) {
    // line within page
    let cursor = 0;
    for (let i = 0; i < page - 1; i++) cursor += opts.pageTexts![i]!.length + 2;
    return `page ${page}, line ${lineOf(text.slice(cursor), start - cursor)}`;
  }
  return `line ${lineOf(text, start)}`;
}

class Collector {
  readonly claims: ExtractedClaim[] = [];
  private seen = new Set<string>();
  constructor(
    private text: string,
    private opts: ExtractOptions,
  ) {}

  add(claimType: ClaimType, value: string, normalized: string, start: number, end: number, confidence: ExtractedClaim["confidence"] = "high") {
    const key = `${claimType}|${normalized}`;
    if (this.seen.has(key) || !normalized) return;
    this.seen.add(key);
    this.claims.push({
      claimType,
      value: value.trim(),
      normalized,
      excerpt: excerptAround(this.text, start, end),
      locator: makeLocator(this.text, start, this.opts),
      confidence,
      start,
      end,
    });
  }
}

// ── Money ──────────────────────────────────────────────────────────────────

const MONEY_RE = /(?:\$\s?(\d{1,3}(?:,\d{3})+|\d{2,6})(?:\.(\d{2}))?)|(?:\b(\d{3,5})(?:\.\d{2})?\s?(?:dollars|CAD|\$)(?![\w]))/gi;

type MoneyKind = "application_fee" | "holding_fee" | "pet_deposit" | "deposit" | "rent" | "late_fee" | null;

function classifyMoney(before: string, after: string): MoneyKind {
  const b = before.toLowerCase();
  const a = after.toLowerCase();
  const near = `${b} §§ ${a}`;
  // Labels that FOLLOW the amount ("$200 holding fee") take precedence.
  const head = a.slice(0, 30);
  if (/^\s*(non-?refundable\s+)?(holding|reservation|key)\s+(fee|deposit)/.test(head)) return "holding_fee";
  if (/^\s*pet\s+(fee|deposit)/.test(head)) return "pet_deposit";
  if (/^\s*(non-?refundable\s+)?(application|processing|screening|admin(istration)?)\s+fee/.test(head)) return "application_fee";
  if (/^\s*late\s+(fee|charge)/.test(head)) return "late_fee";
  if (/late\s+(fee|charge|payment|penalty)/.test(b)) return "late_fee";
  if (/(application|applying|processing|screening|admin(istration)?|background[\s-]check|credit[\s-]check)\s+(fee|charge|cost)/.test(near)) return "application_fee";
  if (/\bfee\b/.test(a.slice(0, 25)) && /(application|processing|screening|admin)/.test(a.slice(0, 40))) return "application_fee";
  if (/(holding|hold the|reserve|reservation|to secure the|key)\s*(fee|deposit|unit|place|apartment|money)?/.test(b.slice(-45))) return "holding_fee";
  if (/pet\s+(deposit|fee)/.test(near)) return "pet_deposit";
  if (/(security|damage)\s+deposit|\bdeposit\b/.test(b.slice(-40)) || /^\s*(security\s+|damage\s+)?deposit/.test(a)) return "deposit";
  if (/^\s*(\/\s?(mo|month)|per\s+month|a\s+month|monthly|\/\s?mth|pm\b|month\b)/.test(a)) return "rent";
  if (/(rent|rental (price|rate|amount)|monthly|per month|price)\s*(is|of|:|=|at|will be|would be)?\s*(only\s+|just\s+)?$/.test(b.slice(-40))) return "rent";
  return null;
}

function extractMoney(text: string, c: Collector) {
  for (const m of text.matchAll(MONEY_RE)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    const sentence = sentenceAround(text, start, end);
    const before = text.slice(Math.max(sentence.start, start - 70), start);
    const after = text.slice(end, Math.min(text.length, end + 45));
    const cents = parseMoneyToCents(m[0]);
    if (cents === null || cents < 1000) continue; // ignore < $10
    const kind = classifyMoney(before, after);
    const display = `$${(cents / 100).toLocaleString("en-CA", { minimumFractionDigits: cents % 100 ? 2 : 0 })}`;
    if (kind && kind !== "late_fee") c.add(kind, display, String(cents), start, end, "high");
    if (kind === "late_fee") c.add("late_fee", display, `amount:${cents}`, start, end, "medium");

    // Payment being requested now (send/pay/transfer + amount in same sentence).
    if (/\b(send|e-?transfer|transfer|pay|wire|need|require|want)\b/i.test(sentence.text) && /\b(send|e-?transfer|transfer|pay|wire|need (?:the|a|your)|require)\b/i.test(sentence.text)) {
      c.add("requested_payment", display, String(cents), start, end, kind ? "high" : "medium");
    }
  }
  // "first and last month's rent" upfront
  for (const m of text.matchAll(/first\s+(?:and|&)\s+last\s+month'?s?(?:\s+rent)?/gi)) {
    const s = m.index ?? 0;
    c.add("other_upfront_fee", "First and last month's rent requested upfront", "first_and_last", s, s + m[0].length, "high");
  }
  // Mentions of an application fee without amount
  for (const m of text.matchAll(/\b(non-?refundable\s+)?(application|processing|screening)\s+fee\b/gi)) {
    const s = m.index ?? 0;
    c.add("application_fee", m[0], "mentioned", s, s + m[0].length, "high");
  }
  // Late fee as percentage
  for (const m of text.matchAll(/late\s+(?:fee|charge|payment|penalty)[^.\n]{0,60}?(\d+(?:\.\d+)?)\s?%/gi)) {
    const s = m.index ?? 0;
    c.add("late_fee", `${m[1]}%`, `percent:${m[1]}`, s, s + m[0].length, "medium");
  }
}

// ── Property facts ─────────────────────────────────────────────────────────

const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, single: 1 };

function extractPropertyFacts(text: string, c: Collector) {
  for (const m of text.matchAll(/\b(\d|one|two|three|four|five|six)\s*[-\s]?\s*(?:bed(?:room)?s?|br|bdrm|bd)\b/gi)) {
    const raw = m[1]!.toLowerCase();
    const n = WORD_NUM[raw] ?? Number.parseInt(raw, 10);
    const s = m.index ?? 0;
    if (n >= 0 && n <= 8) c.add("bedrooms", `${n} bedroom${n === 1 ? "" : "s"}`, String(n), s, s + m[0].length);
  }
  for (const m of text.matchAll(/\b(studio|bachelor)\b(?:\s+(?:apartment|unit|suite))?/gi)) {
    const s = m.index ?? 0;
    c.add("bedrooms", "Studio / bachelor (0 bedrooms)", "0", s, s + m[0].length, "medium");
  }
  for (const m of text.matchAll(/\b(\d(?:\.5)?|one|two|three)\s*[-\s]?\s*(?:bath(?:room)?s?|ba)\b/gi)) {
    const raw = m[1]!.toLowerCase();
    const n = WORD_NUM[raw] ?? Number.parseFloat(raw);
    const s = m.index ?? 0;
    if (n > 0 && n <= 6) c.add("bathrooms", `${n} bathroom${n === 1 ? "" : "s"}`, String(n), s, s + m[0].length);
  }
  const types: Array<[RegExp, string]> = [
    [/\bbasement\s+(?:suite|apartment|unit)\b/i, "basement_suite"],
    [/\btown\s?house\b/i, "townhouse"],
    [/\bcondo(?:minium)?\b/i, "condo"],
    [/\bduplex\b/i, "duplex"],
    [/\b(?:detached\s+)?house\b(?!\s+rules)/i, "house"],
    [/\b(?:room|bedroom)\s+(?:for\s+rent|in\s+a\s+shared)\b/i, "room"],
    [/\bapartment\b|\bapt\b|\bflat\b/i, "apartment"],
  ];
  for (const [re, t] of types) {
    const m = text.match(re);
    if (m && m.index !== undefined) {
      c.add("property_type", t.replace("_", " "), t, m.index, m.index + m[0].length, "medium");
      break;
    }
  }

  // Address: civic number + street (+ optional unit)
  const ADDRESS_RE =
    /\b(?:(?:[Uu]nit|[Aa]pt\.?|[Aa]partment|[Ss]uite|#)\s*([A-Za-z0-9-]+)\s*[,-]?\s*)?(\d{1,6}[A-Za-z]?)\s+((?:[A-Z][a-zA-Z'.-]+\s){1,4})(Street|St\.?|Road|Rd\.?|Avenue|Ave\.?|Drive|Dr\.?|Lane|Ln\.?|Court|Ct\.?|Crescent|Cres\.?|Terrace|Place|Pl\.?|Boulevard|Blvd\.?|Way|Row|Close|Grove|Highway|Hwy)\b\.?(?:\s*,?\s*(?:[Uu]nit|UNIT|[Aa]pt\.?|[Aa]partment|[Ss]uite|#)\s*([A-Za-z0-9-]+))?/g;
  for (const m of text.matchAll(ADDRESS_RE)) {
    const s = m.index ?? 0;
    const unit = m[1] ?? m[5];
    const civic = `${m[2]} ${m[3]!.trim()} ${m[4]!.replace(/\.$/, "")}`;
    const display = unit ? `${civic}, Unit ${unit}` : civic;
    const norm = normalizeAddress(unit ? `${civic} unit ${unit}` : civic);
    // Ignore obvious non-addresses like "2 Bed Room" false positives (suffix list prevents most)
    c.add("address", display, norm, s, s + m[0].length);
  }
  for (const community of NS_COMMUNITIES) {
    const re = new RegExp(`\\b${community}\\b`, "i");
    const m = text.match(re);
    if (m && m.index !== undefined) {
      c.add("city", community, community.toLowerCase(), m.index, m.index + m[0].length, "medium");
      break;
    }
  }
  for (const m of text.matchAll(/\b([ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z])\s?(\d[ABCEGHJ-NPRSTV-Z]\d)\b/g)) {
    const s = m.index ?? 0;
    c.add("postal_code", `${m[1]} ${m[2]}`, `${m[1]}${m[2]}`.toUpperCase(), s, s + m[0].length);
  }

  // Lease term
  const terms: Array<[RegExp, (m: RegExpMatchArray) => [string, string]]> = [
    [/\byear[\s-]to[\s-]year\b/i, () => ["Year-to-year (periodic)", "year_to_year"]],
    [/\bmonth[\s-]to[\s-]month\b/i, () => ["Month-to-month (periodic)", "month_to_month"]],
    [/\bweek[\s-]to[\s-]week\b/i, () => ["Week-to-week (periodic)", "week_to_week"]],
    [/\bfixed[\s-]term\b(?:[^.\n]{0,40}?(\d{1,2})[\s-]?months?)?/i, (m) => [m[1] ? `Fixed-term, ${m[1]} months` : "Fixed-term", m[1] ? `fixed_term:${m[1]}` : "fixed_term"]],
    [/\b(\d{1,2})[\s-]?month\s+lease\b/i, (m) => [`${m[1]}-month lease`, `months:${m[1]}`]],
    [/\b(?:one|1)[\s-]year\s+lease\b/i, () => ["1-year lease", "months:12"]],
  ];
  for (const [re, fn] of terms) {
    const m = text.match(re);
    if (m && m.index !== undefined) {
      const [v, n] = fn(m);
      c.add("lease_term", v, n, m.index, m.index + m[0].length, "medium");
    }
  }

  // Move-in date
  const moveRe = new RegExp(
    `\\b(?:available|move[\\s-]?in|starting|start(?:s|ing)?\\s+(?:date|on)|possession|lease\\s+(?:begins|starts|commences)|commencing)\\s*(?:date)?\\s*(?:on|from|:|as of)?\\s*((?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s*\\d{4})?|\\d{4}-\\d{2}-\\d{2}|immediately|now)`,
    "i",
  );
  const mm = text.match(moveRe);
  if (mm && mm.index !== undefined) {
    const v = mm[1]!.replace(/\s+/g, " ").trim();
    c.add("move_in_date", v, v.toLowerCase().replace(/(st|nd|rd|th)\b/, "").replace(/,/g, ""), mm.index, mm.index + mm[0].length, "medium");
  }

  // Utilities
  for (const m of text.matchAll(/\b((?:heat|hot water|electricity|power|water|internet|wi-?fi|cable|utilities)(?:\s*(?:,|and|&|\+)\s*(?:heat|hot water|electricity|power|water|internet|wi-?fi|cable))*)\s+(?:is\s+|are\s+)?(?:all\s+)?(?:included|incl\.?)\b/gi)) {
    const s = m.index ?? 0;
    const items = m[1]!
      .toLowerCase()
      .split(/\s*(?:,|and|&|\+)\s*/)
      .map((x) => x.replace("power", "electricity").replace(/wi-?fi/, "internet"))
      .filter(Boolean)
      .sort();
    c.add("utilities", `${m[1]} included`, `included:${[...new Set(items)].join(",")}`, s, s + m[0].length, "medium");
  }
  const UTIL = "(?:heat|hot water|electricity|power|water|internet|wi-?fi|cable|utilities)";
  const tenantPaysRes = [
    new RegExp(`\\b(${UTIL}(?:\\s*(?:,|and|&|\\+)\\s*${UTIL})*)\\s+(?:are\\s+|is\\s+)?(?:extra|not included|separate|paid by (?:the\\s+)?tenant|the tenant'?s responsibility)\\b`, "gi"),
    new RegExp(`\\btenant\\s+(?:pays|is responsible for|shall pay)\\s+(?:for\\s+)?(?:all\\s+)?(${UTIL}(?:\\s*(?:,|and|&|\\+)\\s*${UTIL})*)`, "gi"),
  ];
  for (const re of tenantPaysRes) {
    for (const m of text.matchAll(re)) {
      const s = m.index ?? 0;
      const items = m[1]!
        .toLowerCase()
        .split(/\s*(?:,|and|&|\+)\s*/)
        .map((x) => x.replace("power", "electricity").replace(/wi-?fi/, "internet"))
        .filter(Boolean)
        .sort();
      c.add("utilities", m[0], `tenant_pays:${[...new Set(items)].join(",")}`, s, s + m[0].length, "medium");
    }
  }


  for (const m of text.matchAll(/\b(no parking|(?:\d\s+)?(?:parking\s+(?:spot|space|stall)s?|parking|driveway|garage)\s*(?:is\s+)?(?:included|available|for\s+\$?\d+|extra|\(\$?\d+[^)]*\)))/gi)) {
    const s = m.index ?? 0;
    const v = m[0].trim();
    c.add("parking", v, v.toLowerCase().startsWith("no") ? "none" : v.toLowerCase().includes("extra") || /\$/.test(v) ? "paid" : "included", s, s + m[0].length, "medium");
  }
  for (const m of text.matchAll(/\b(fully\s+furnished|semi[\s-]furnished|unfurnished|furnished)\b/gi)) {
    const s = m.index ?? 0;
    const v = m[1]!.toLowerCase().replace(/\s+/g, " ");
    c.add("furnished", m[1]!, v.startsWith("un") ? "no" : v.startsWith("semi") ? "partial" : "yes", s, s + m[0].length, "medium");
  }
  for (const m of text.matchAll(/\b(no pets|pets?\s+(?:are\s+)?(?:allowed|welcome|friendly|ok|considered)|pet[\s-]friendly|cats?\s+(?:ok|allowed|welcome)|dogs?\s+(?:ok|allowed|welcome))\b/gi)) {
    const s = m.index ?? 0;
    c.add("pets", m[1]!, m[1]!.toLowerCase().startsWith("no") ? "no" : "yes", s, s + m[0].length, "medium");
  }
}

// ── Contacts & conduct ─────────────────────────────────────────────────────

function cleanName(raw: string): string | null {
  const name = raw.replace(/\s+/g, " ").trim();
  const first = name.split(" ")[0]!.toLowerCase();
  if (NAME_STOPWORDS.has(first) || NAME_STOPWORDS.has(name.toLowerCase())) return null;
  if (name.length < 2 || name.length > 40) return null;
  return name;
}

function extractContacts(text: string, c: Collector) {
  for (const m of text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) {
    const s = m.index ?? 0;
    c.add("contact_email", m[0], normalizeEmail(m[0]), s, s + m[0].length);
  }
  for (const m of text.matchAll(/(?:\+?1[\s.-]?)?\(?\b(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})\b/g)) {
    const s = m.index ?? 0;
    const digits = normalizePhone(m[0]);
    if (digits.length === 10) c.add("contact_phone", m[0].trim(), digits, s, s + m[0].length);
  }
  for (const m of text.matchAll(/\+(?!1\b)(\d{1,3})[\s.-]?\d{2,4}[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/g)) {
    const s = m.index ?? 0;
    c.add("contact_phone", m[0].trim(), m[0].replace(/\D/g, ""), s, s + m[0].length, "medium");
  }

  const namePatterns: RegExp[] = [
    new RegExp(`\\b(?:my name is|this is|I am|I'm)\\s+${NAME}`, "g"),
    new RegExp(`\\b(?:contact|landlord|owner|property manager|manager|agent|leasing agent|signed)\\s*(?:name)?\\s*[:\\-–]\\s*${NAME}`, "gi"),
    new RegExp(`(?:^|\\n)\\s*(?:[-—–]+|regards,?|thanks,?|thank you,?|sincerely,?|cheers,?|best,?)\\s*\\n?\\s*${NAME}\\s*(?:$|\\n)`, "gi"),
  ];
  for (const re of namePatterns) {
    for (const m of text.matchAll(re)) {
      const raw = m[1];
      if (!raw) continue;
      const name = cleanName(raw);
      if (!name) continue;
      const offset = (m.index ?? 0) + m[0].indexOf(raw);
      c.add("contact_name", name, normalizeName(name), offset, offset + raw.length, "medium");
    }
  }

  // Payment recipient
  const recipientRe = new RegExp(
    `\\b(?:e-?transfer(?:red)?|send|pay|payable|wire|transfer|make (?:the )?(?:payment|cheque) (?:out )?)\\b[^.\\n]{0,50}?\\bto\\s+(?:my\\s+(?:agent|assistant|brother|sister|wife|husband|son|daughter|cousin|colleague|lawyer|partner|friend|associate|manager)\\s*,?\\s*)?(${NAME.slice(1, -1)}|[\\w.+-]+@[\\w-]+\\.[\\w.]+)`,
    "g",
  );
  for (const m of text.matchAll(recipientRe)) {
    const raw = m[1]!;
    const isEmail = raw.includes("@");
    const value = isEmail ? raw : cleanName(raw);
    if (!value) continue;
    const offset = (m.index ?? 0) + m[0].lastIndexOf(raw);
    c.add("payment_recipient", value, isEmail ? `email:${normalizeEmail(value)}` : `name:${normalizeName(value)}`, offset, offset + raw.length, "medium");
  }
  for (const m of text.matchAll(new RegExp(`\\b(?:payable to|in the name of|recipient(?: name)?\\s*[:\\-]|account holder(?: name)?\\s*[:\\-]?)\\s*${NAME}`, "gi"))) {
    const name = cleanName(m[1]!);
    if (!name) continue;
    const offset = (m.index ?? 0) + m[0].lastIndexOf(m[1]!);
    c.add("payment_recipient", name, `name:${normalizeName(name)}`, offset, offset + m[1]!.length, "medium");
  }

  const methods: Array<[RegExp, string, string]> = [
    [/\binterac\s+e-?transfer\b|\be-?transfer\b|\betransfer\b/i, "Interac e-Transfer", "etransfer"],
    [/\bwire\s+transfer\b|\bbank\s+wire\b|\bwire\s+(?:the\s+)?(?:money|funds|deposit)\b/i, "Wire transfer", "wire"],
    [/\bwestern\s+union\b/i, "Western Union", "money_transfer_service"],
    [/\bmoney\s?gram\b/i, "MoneyGram", "money_transfer_service"],
    [/\b(?:bitcoin|btc|crypto(?:currency)?|usdt|ethereum|tether)\b/i, "Cryptocurrency", "crypto"],
    [/\b(?:gift\s+cards?|itunes\s+cards?|steam\s+cards?|google\s+play\s+cards?)\b/i, "Gift cards", "gift_card"],
    [/\bcash\b(?:\s+only)?/i, "Cash", "cash"],
    [/\bpaypal\b/i, "PayPal", "paypal"],
    [/\bcertified\s+cheque\b|\bbank\s+draft\b/i, "Certified cheque / bank draft", "certified_cheque"],
    [/\bpost[\s-]dated\s+cheques?\b|\bcheques?\b/i, "Cheque", "cheque"],
  ];
  for (const [re, label, norm] of methods) {
    const m = text.match(re);
    if (m && m.index !== undefined) c.add("payment_method", label, norm, m.index, m.index + m[0].length);
  }
}

function extractConduct(text: string, c: Collector) {
  const awayRe =
    /\b(out of (?:the )?(?:country|province|town)|overseas|abroad|currently (?:living |working |based )?(?:in|out of) [A-Z][a-z]+|on a (?:mission|missionary)|working offshore|deployed|relocated (?:to|for work)|not (?:currently )?in (?:halifax|nova scotia|canada)|away for work)\b/gi;
  for (const m of text.matchAll(awayRe)) {
    const s = m.index ?? 0;
    c.add("landlord_location", m[1]!, "unavailable_in_person", s, s + m[0].length, "medium");
  }

  const refuseRe =
    /\b(?:can(?:'|no)?t|cannot|unable to|not able to|won'?t be able to|no)\s+(?:do\s+|arrange\s+|offer\s+)?(?:a\s+|any\s+)?(?:in[\s-]person\s+)?(?:viewings?|showings?|show(?:\s+(?:you\s+)?(?:the|it))?|tours?)\b|\bkeys?\s+(?:will|can)\s+be\s+(?:mailed|couriered|sent|shipped|delivered)\b|\b(?:drive|walk)\s+by\s+(?:and\s+)?(?:look|see)\b|\bviewing\s+(?:only\s+)?after\s+(?:the\s+)?(?:deposit|payment)\b|\b(?:look|see)\s+(?:at\s+it\s+)?from\s+(?:the\s+)?outside\b/gi;
  for (const m of text.matchAll(refuseRe)) {
    const s = m.index ?? 0;
    c.add("viewing_availability", m[0], "refused_or_unavailable", s, s + m[0].length, "high");
  }
  const offerRe =
    /\b(?:happy to|can|available to|glad to|would be pleased to)\s+(?:show|arrange\s+a\s+(?:viewing|showing|tour)|give\s+(?:you\s+)?a\s+tour)\b|\bopen\s+house\b|\bviewings?\s+(?:are\s+)?(?:available|on|this|by appointment)\b|\bbook\s+a\s+(?:viewing|showing)\b/gi;
  for (const m of text.matchAll(offerRe)) {
    const s = m.index ?? 0;
    c.add("viewing_availability", m[0], "offered", s, s + m[0].length, "high");
  }

  const urgencyRe =
    /\b(today only|today|tonight|immediately|right away|asap|as soon as possible|within (?:the next )?(?:24|48|12|2) hours|first[\s-]come,?\s*first[\s-]served|lots of (?:people|interest)|(?:many|several|other) (?:people|applicants|renters|students|others) (?:are )?(?:interested|asking|waiting)|before someone else|someone else (?:wants|is ready|will take)|end of (?:the )?day|act fast|won'?t last|send (?:it )?now|or (?:i|we) will (?:give|rent) it to)\b/gi;
  for (const m of text.matchAll(urgencyRe)) {
    const s = m.index ?? 0;
    const sentence = sentenceAround(text, s, s + m[0].length).text;
    // Only count urgency attached to payment/decision language, not "available today".
    if (/\b(send|pay|transfer|deposit|decide|confirm|secure|hold|money|e-?transfer|someone|others|people|interest)\b/i.test(sentence)) {
      c.add("urgency", m[1]!, `pressure:${m[1]!.toLowerCase().replace(/\s+/g, "_")}`, s, s + m[0].length, "high");
    }
  }

  const sensitiveRe =
    /\b(social insurance(?: number)?|\bSIN\b(?: number)?|passport(?: (?:copy|photo|number|scan))?|driver'?s licen[cs]e (?:photo|copy|scan|number)|bank (?:login|password|statement|card)|online banking (?:login|password|details)|credit card (?:number|details|info)|photo of your (?:id|card|passport)|copy of your (?:id|passport|licen[cs]e)|mother'?s maiden name|date of birth)\b/gi;
  for (const m of text.matchAll(sensitiveRe)) {
    const s = m.index ?? 0;
    const sentence = sentenceAround(text, s, s + m[0].length).text;
    // "SIN" must be in a request context to avoid matching "sin" as a word.
    if (/\b(send|provide|need|require|share|give|upload|attach|include|submit)\b/i.test(sentence)) {
      const kind = m[1]!.toLowerCase();
      const norm = /social|sin/.test(kind)
        ? "sin"
        : /passport/.test(kind)
          ? "passport"
          : /bank|banking/.test(kind)
            ? "bank_credentials"
            : /credit/.test(kind)
              ? "credit_card"
              : /licen/.test(kind)
                ? "drivers_licence"
                : "identity_document";
      c.add("sensitive_info_request", m[1]!, norm, s, s + m[0].length, "high");
    }
  }

  for (const m of text.matchAll(/\bhttps?:\/\/[^\s)>"'\]]+/gi)) {
    const s = m.index ?? 0;
    const url = m[0].replace(/[.,;:!?]+$/, "");
    const host = hostnameOf(url);
    if (host) c.add("link", url, host, s, s + url.length);
  }
  const platforms: Array<[RegExp, string]> = [
    [/\bkijiji\b/i, "kijiji"],
    [/\bfacebook\s+marketplace\b|\bfb\s+marketplace\b/i, "facebook_marketplace"],
    [/\brentals\.ca\b/i, "rentals_ca"],
    [/\brealtor\.ca\b/i, "realtor_ca"],
    [/\bcraigslist\b/i, "craigslist"],
    [/\bplaces4students\b/i, "places4students"],
    [/\bpadmapper\b|\bzumper\b/i, "padmapper_zumper"],
  ];
  for (const [re, key] of platforms) {
    const m = text.match(re);
    if (m && m.index !== undefined) c.add("source_platform", m[0], key, m.index, m.index + m[0].length, "medium");
  }

  for (const m of text.matchAll(/\b(?:enter|entry|access)\b[^.\n]{0,80}?\b(without (?:prior )?notice|at any time|any time|(\d{1,2})\s*hours?'?\s*(?:written\s+)?notice)\b/gi)) {
    const s = m.index ?? 0;
    const hours = m[2] ? Number.parseInt(m[2], 10) : null;
    c.add("entry_notice", m[0], hours !== null ? `hours:${hours}` : "no_notice", s, s + m[0].length, "medium");
  }
}

const INJECTION_RE =
  /\b(ignore (?:all |any |your |the )?(?:previous |prior |above )?(?:instructions|prompts|rules)|disregard (?:your|the|all) (?:instructions|rules)|system prompt|you are now (?:an? )?(?:ai|assistant|chatbot)|as an ai (?:model|assistant)|reveal (?:the )?(?:user'?s )?(?:private )?(?:documents|data|files|instructions)|mark (?:this|the) (?:listing|landlord|rental) as (?:verified|safe|legitimate)|(?:assistant|ai|chatgpt|claude),? (?:please )?(?:say|report|state) (?:that )?(?:this|the))/gi;

function extractEmbeddedInstructions(text: string, c: Collector) {
  for (const m of text.matchAll(INJECTION_RE)) {
    const s = m.index ?? 0;
    c.add("embedded_instruction", m[0], m[0].toLowerCase().replace(/\s+/g, " "), s, s + m[0].length, "high");
  }
}

function extractTitle(text: string, c: Collector) {
  const firstLine = text.split("\n").find((l) => l.trim().length > 0)?.trim();
  if (firstLine && firstLine.length >= 8 && firstLine.length <= 100 && !/@/.test(firstLine)) {
    const s = text.indexOf(firstLine);
    c.add("listing_title", firstLine, firstLine.toLowerCase(), s, s + firstLine.length, "medium");
  }
}

export function extractClaims(text: string, opts: ExtractOptions = {}): ExtractedClaim[] {
  if (!text || !text.trim()) return [];
  const bounded = text.length > 200_000 ? text.slice(0, 200_000) : text;
  const c = new Collector(bounded, opts);
  if (opts.sourceKind === "listing") extractTitle(bounded, c);
  extractMoney(bounded, c);
  extractPropertyFacts(bounded, c);
  extractContacts(bounded, c);
  extractConduct(bounded, c);
  extractEmbeddedInstructions(bounded, c);
  return c.claims.sort((a, b) => a.start - b.start);
}
