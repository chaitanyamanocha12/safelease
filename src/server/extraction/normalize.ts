/** Canonicalization used for claim matching. Pure functions. */

const STREET_SUFFIX: Record<string, string> = {
  st: "street",
  "st.": "street",
  street: "street",
  rd: "road",
  "rd.": "road",
  road: "road",
  ave: "avenue",
  "ave.": "avenue",
  avenue: "avenue",
  dr: "drive",
  "dr.": "drive",
  drive: "drive",
  ln: "lane",
  "ln.": "lane",
  lane: "lane",
  ct: "court",
  "ct.": "court",
  crt: "court",
  court: "court",
  cres: "crescent",
  "cres.": "crescent",
  crescent: "crescent",
  terr: "terrace",
  terrace: "terrace",
  pl: "place",
  "pl.": "place",
  place: "place",
  blvd: "boulevard",
  "blvd.": "boulevard",
  boulevard: "boulevard",
  way: "way",
  row: "row",
  close: "close",
  grove: "grove",
  hwy: "highway",
  highway: "highway",
};

export function normalizeAddress(raw: string): string {
  const lower = raw
    .toLowerCase()
    .replace(/[,#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const unitMatch = lower.match(/\b(?:unit|apt|apartment|suite)\s*([a-z0-9-]+)\b/);
  let rest = lower.replace(/\b(?:unit|apt|apartment|suite)\s*[a-z0-9-]+\b/, "").trim();
  // "4-1234 example street" style unit prefix
  let unit = unitMatch?.[1];
  const prefixed = rest.match(/^([a-z0-9]+)-(\d+)\s/);
  if (!unit && prefixed) {
    unit = prefixed[1];
    rest = rest.replace(/^[a-z0-9]+-/, "");
  }
  const words = rest.split(" ").map((w) => STREET_SUFFIX[w] ?? w.replace(/\.$/, ""));
  const core = words.join(" ").replace(/\b(halifax|dartmouth|bedford|ns|nova scotia)\b.*$/, "").trim();
  return unit ? `${core} unit ${unit}` : core;
}

/** Civic number + street name, ignoring unit. */
export function addressCore(normalized: string): string {
  return normalized.replace(/\s+unit\s+\S+$/, "").trim();
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

export function normalizeName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Whether two person names plausibly refer to the same person ("Anna Kowalski" vs "Anna"). */
export function namesCompatible(a: string, b: string): boolean {
  const na = normalizeName(a).split(" ");
  const nb = normalizeName(b).split(" ");
  if (na.join(" ") === nb.join(" ")) return true;
  const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na];
  return shorter.every((part) => longer.includes(part));
}

export function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Line number (1-based) for a character offset. */
export function lineOf(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/** Page (1-based) for an offset in text joined from pageTexts with "\n\n". */
export function pageOf(pageTexts: string[] | null | undefined, offset: number): number | null {
  if (!pageTexts || pageTexts.length === 0) return null;
  let cursor = 0;
  for (let i = 0; i < pageTexts.length; i++) {
    const len = pageTexts[i]!.length;
    if (offset < cursor + len + 2) return i + 1;
    cursor += len + 2;
  }
  return pageTexts.length;
}

export function excerptAround(text: string, start: number, end: number, pad = 60): string {
  const s = Math.max(0, start - pad);
  const e = Math.min(text.length, end + pad);
  const prefix = s > 0 ? "…" : "";
  const suffix = e < text.length ? "…" : "";
  return (prefix + text.slice(s, e) + suffix).replace(/\s+/g, " ").trim();
}

/** The sentence-ish span containing an offset (bounded by . ! ? or newline). */
export function sentenceAround(text: string, start: number, end: number): { text: string; start: number } {
  let s = start;
  while (s > 0 && !/[.!?\n]/.test(text[s - 1]!)) s--;
  let e = end;
  while (e < text.length && !/[.!?\n]/.test(text[e]!)) e++;
  return { text: text.slice(s, e), start: s };
}
