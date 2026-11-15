/**
 * SSRF protection for fetching user-supplied public listing URLs.
 * - http(s) only, default ports only, no credentials in URL
 * - DNS-resolved addresses must be public (no loopback/private/link-local/metadata)
 * - redirects are followed manually and re-validated at every hop
 * - response size and time are capped; only text/html or text/plain accepted
 */
import dns from "node:dns/promises";
import net from "node:net";

export class UnsafeUrlError extends Error {}

function ipv4ToInt(ip: string) {
  return ip.split(".").reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}
function inCidr(ip: string, base: string, bits: number) {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    return [
      ["0.0.0.0", 8],
      ["10.0.0.0", 8],
      ["100.64.0.0", 10],
      ["127.0.0.0", 8],
      ["169.254.0.0", 16],
      ["172.16.0.0", 12],
      ["192.0.0.0", 24],
      ["192.0.2.0", 24],
      ["192.168.0.0", 16],
      ["198.18.0.0", 15],
      ["198.51.100.0", 24],
      ["203.0.113.0", 24],
      ["224.0.0.0", 4],
      ["240.0.0.0", 4],
    ].some(([base, bits]) => inCidr(ip, base as string, bits as number));
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (lower.startsWith("ff")) return true;
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]!);
    return false;
  }
  return true;
}

export function parsePublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new UnsafeUrlError("That doesn't look like a valid web address.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new UnsafeUrlError("Only http(s) links can be fetched.");
  if (url.username || url.password) throw new UnsafeUrlError("Links containing credentials are not allowed.");
  if (url.port && !["80", "443"].includes(url.port)) throw new UnsafeUrlError("Non-standard ports are not allowed.");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new UnsafeUrlError("Local network addresses are not allowed.");
  }
  if (net.isIP(host) && isPrivateAddress(host)) throw new UnsafeUrlError("Private network addresses are not allowed.");
  return url;
}

export async function assertPublicHost(hostname: string): Promise<void> {
  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new UnsafeUrlError("Private network addresses are not allowed.");
    return;
  }
  let addrs: { address: string }[];
  try {
    addrs = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new UnsafeUrlError("The website's address could not be resolved.");
  }
  if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) {
    throw new UnsafeUrlError("The link resolves to a private or reserved network address.");
  }
}

/** Domains whose terms restrict automated access or that require login; we never fetch them. */
const NO_AUTOMATED_FETCH = ["facebook.com", "fb.com", "instagram.com", "kijiji.ca", "realtor.ca", "rentals.ca", "craigslist.org", "zumper.com", "padmapper.com"];

export function automatedFetchRestricted(url: URL): string | null {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const match = NO_AUTOMATED_FETCH.find((d) => host === d || host.endsWith(`.${d}`));
  return match
    ? `SafeLease does not automatically fetch ${match} pages (login requirements or terms restricting automated access). Paste the listing text or upload a screenshot instead.`
    : null;
}

export interface FetchedPage {
  finalUrl: string;
  status: number;
  contentType: string;
  text: string;
  title: string | null;
  truncated: boolean;
}

export async function safeFetchPage(rawUrl: string, opts: { timeoutMs?: number; maxBytes?: number; maxRedirects?: number } = {}): Promise<FetchedPage> {
  const { timeoutMs = 10000, maxBytes = 1_500_000, maxRedirects = 3 } = opts;
  let url = parsePublicUrl(rawUrl);
  const restricted = automatedFetchRestricted(url);
  if (restricted) throw new UnsafeUrlError(restricted);

  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertPublicHost(url.hostname);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "SafeLease/1.0 (renter-initiated single page fetch)", Accept: "text/html,text/plain;q=0.9" },
      });
    } catch {
      clearTimeout(timer);
      throw new UnsafeUrlError("The page could not be reached.");
    }
    if (res.status >= 300 && res.status < 400) {
      clearTimeout(timer);
      const loc = res.headers.get("location");
      if (!loc) throw new UnsafeUrlError("Redirect without a destination.");
      url = parsePublicUrl(new URL(loc, url).toString());
      const r2 = automatedFetchRestricted(url);
      if (r2) throw new UnsafeUrlError(r2);
      continue;
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain|application\/xhtml/.test(contentType)) {
      clearTimeout(timer);
      throw new UnsafeUrlError("The link did not return a web page.");
    }
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    let truncated = false;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > maxBytes) {
          truncated = true;
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
    }
    clearTimeout(timer);
    const html = new TextDecoder("utf-8").decode(Buffer.concat(chunks));
    return { finalUrl: url.toString(), status: res.status, contentType, ...htmlToText(html), truncated };
  }
  throw new UnsafeUrlError("Too many redirects.");
}

export function htmlToText(html: string): { text: string; title: string | null } {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? null;
  const text = html
    .replace(/<(script|style|noscript|template|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim()
    .slice(0, 60_000);
  return { text, title: title ? title.replace(/\s+/g, " ").slice(0, 200) : null };
}
