/**
 * Redaction helpers for logs, audit metadata, LLM prompts and
 * organization-shared (redacted-scope) case views.
 */
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
const SIN = /\b\d{3}[\s-]?\d{3}[\s-]?\d{3}\b/g;
const CARD = /\b(?:\d[ -]?){13,19}\b/g;
const POSTAL = /\b[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d\b/gi;
const CIVIC = /\b\d{1,6}[A-Z]?\s+(?:[A-Z][a-z]+\s){0,3}(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Lane|Ln|Court|Ct|Crescent|Cres|Terrace|Place|Pl|Boulevard|Blvd|Way|Row|Close|Highway|Hwy)\b\.?/g;

const SENSITIVE_KEYS = /pass(word)?|secret|token|api[_-]?key|authorization|cookie|body|text|content|message|email|phone|address|excerpt|note/i;

export function redactText(input: string, opts: { addresses?: boolean } = {}): string {
  let out = input
    .replace(EMAIL, "[email]")
    .replace(CARD, (m) => (m.replace(/\D/g, "").length >= 13 ? "[card-number]" : m))
    .replace(PHONE, "[phone]")
    .replace(SIN, "[id-number]")
    .replace(POSTAL, "[postal-code]");
  if (opts.addresses) out = out.replace(CIVIC, "[street-address]");
  return out;
}

export function redactMetadata(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SENSITIVE_KEYS.test(k)) {
      out[k] = typeof v === "string" ? `[redacted:${v.length} chars]` : "[redacted]";
    } else if (typeof v === "string") {
      out[k] = redactText(v).slice(0, 200);
    } else if (typeof v === "number" || typeof v === "boolean" || v === null) {
      out[k] = v;
    } else if (Array.isArray(v)) {
      out[k] = `[array:${v.length}]`;
    } else {
      out[k] = "[object]";
    }
  }
  return out;
}

/**
 * Build a masker for values known to identify people in a specific case (names, contacts,
 * evidence titles). Pattern-based redaction cannot recognise names, so redacted org views
 * also mask the exact values the case itself extracted. Full names and their individual
 * parts (≥3 letters) are replaced, longest first, case-insensitively on word boundaries.
 */
const COMMON_WORDS = new Set(["demo", "test", "student", "landlord", "agent", "property", "properties", "management", "rentals", "rental", "realty", "homes", "apartments", "inc", "ltd", "the", "and", "mr", "mrs", "ms", "dr"]);

export function termMasker(terms: Array<{ value: string | null | undefined; label: string; splitWords?: boolean }>): (s: string) => string {
  const pairs = new Map<string, string>();
  for (const t of terms) {
    const v = t.value?.trim();
    if (!v || v.length < 3) continue;
    pairs.set(v.toLowerCase(), t.label);
    if (t.splitWords)
      for (const w of v.replace(/\([^)]*\)/g, " ").split(/[\s,.'"“”]+/))
        if (w.length >= 3 && /^\p{Lu}/u.test(w) && !COMMON_WORDS.has(w.toLowerCase())) pairs.set(w.toLowerCase(), t.label);
  }
  if (pairs.size === 0) return (s) => s;
  const keys = [...pairs.keys()].sort((a, b) => b.length - a.length);
  const esc = (k: string) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${keys.map(esc).join("|")})(?![\\p{L}\\p{N}])`, "giu");
  return (s) => s.replace(re, (m) => pairs.get(m.toLowerCase()) ?? "[redacted]");
}

/** Replace a person's name with initials for redacted organization views. */
export function initials(name: string | null | undefined): string {
  if (!name) return "Renter";
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p[0]!.toUpperCase() + ".")
      .join(" ") || "Renter"
  );
}
