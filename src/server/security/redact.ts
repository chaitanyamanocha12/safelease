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
