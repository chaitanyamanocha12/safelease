/**
 * Minimal, dependency-light PDF layout engine on pdf-lib (standard fonts).
 * Handles wrapping, page breaks, a branded header, and a footer carrying
 * the generation time and the informational-use limitation on every page.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const NAVY = rgb(16 / 255, 29 / 255, 52 / 255);
const TEAL = rgb(20 / 255, 184 / 255, 166 / 255);
const GREY = rgb(0.38, 0.42, 0.48);
const INK = rgb(0.1, 0.12, 0.16);
const TONES = {
  bad: { bg: rgb(0.996, 0.949, 0.949), fg: rgb(0.73, 0.11, 0.11) },
  warn: { bg: rgb(1, 0.97, 0.9), fg: rgb(0.71, 0.33, 0.04) },
  ok: { bg: rgb(0.93, 0.99, 0.95), fg: rgb(0.08, 0.5, 0.24) },
  info: { bg: rgb(0.94, 0.96, 1), fg: rgb(0.11, 0.3, 0.85) },
  neutral: { bg: rgb(0.95, 0.96, 0.97), fg: rgb(0.28, 0.33, 0.41) },
};
export type Tone = keyof typeof TONES;

/** Map text to the WinAnsi set supported by the standard fonts. */
export function pdfSafe(s: string): string {
  return s
    .replace(/[→⇒]/g, "->")
    .replace(/[←]/g, "<-")
    .replace(/[≤]/g, "<=")
    .replace(/[≥]/g, ">=")
    .replace(/[≈]/g, "~")
    .replace(/[✓✔]/g, "v")
    .replace(/[★☆]/g, "*")
    .replace(/[   ]/g, " ")
    .replace(/[‐‑‒]/g, "-")
    .replace(/\t/g, "  ")
    .replace(/[^\x0A\x20-\x7E¡-ÿ–—‘’“”•…€]/g, "");
}

const W = 612;
const H = 792;
const M = 48;

export class ReportPdf {
  private doc!: PDFDocument;
  private font!: PDFFont;
  private bold!: PDFFont;
  private italic!: PDFFont;
  private page!: PDFPage;
  private y = 0;
  private generatedAt = new Date();

  private constructor(
    private title: string,
    private reference: string,
    private subtitle?: string,
  ) {}

  static async create(title: string, reference: string, subtitle?: string) {
    const r = new ReportPdf(title, reference, subtitle);
    r.doc = await PDFDocument.create();
    r.doc.setTitle(`SafeLease — ${title}`);
    r.doc.setProducer("SafeLease");
    r.doc.setCreator("SafeLease report generator");
    r.font = await r.doc.embedFont(StandardFonts.Helvetica);
    r.bold = await r.doc.embedFont(StandardFonts.HelveticaBold);
    r.italic = await r.doc.embedFont(StandardFonts.HelveticaOblique);
    r.firstPage();
    return r;
  }

  private firstPage() {
    this.page = this.doc.addPage([W, H]);
    this.page.drawRectangle({ x: 0, y: H - 96, width: W, height: 96, color: NAVY });
    this.page.drawRectangle({ x: M, y: H - 60, width: 18, height: 18, color: TEAL });
    this.page.drawText("SafeLease", { x: M + 26, y: H - 56, size: 15, font: this.bold, color: rgb(1, 1, 1) });
    this.page.drawText("Investigate before you pay.", { x: M + 26, y: H - 72, size: 8.5, font: this.font, color: rgb(0.75, 0.8, 0.88) });
    this.page.drawText(pdfSafe(this.reference), { x: W - M - this.font.widthOfTextAtSize(pdfSafe(this.reference), 9), y: H - 56, size: 9, font: this.font, color: rgb(0.8, 0.85, 0.9) });
    this.y = H - 128;
    this.text(this.title, { font: this.bold, size: 19 });
    if (this.subtitle) this.text(this.subtitle, { size: 10, color: GREY });
    this.text(`Generated ${this.generatedAt.toLocaleString("en-CA", { dateStyle: "long", timeStyle: "short" })}`, { size: 8.5, color: GREY });
    this.y -= 8;
  }

  private newPage() {
    this.page = this.doc.addPage([W, H]);
    this.page.drawRectangle({ x: 0, y: H - 30, width: W, height: 30, color: NAVY });
    this.page.drawText(pdfSafe(`SafeLease · ${this.title}`), { x: M, y: H - 20, size: 8.5, font: this.font, color: rgb(1, 1, 1) });
    this.y = H - 56;
  }

  private ensure(h: number) {
    if (this.y - h < 64) this.newPage();
  }

  private wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const out: string[] = [];
    for (const para of pdfSafe(text).split("\n")) {
      const words = para.split(/\s+/);
      let line = "";
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(test, size) > width && line) {
          out.push(line);
          line = w;
          while (font.widthOfTextAtSize(line, size) > width) {
            let cut = line.length - 1;
            while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > width) cut--;
            out.push(line.slice(0, cut));
            line = line.slice(cut);
          }
        } else line = test;
      }
      out.push(line);
    }
    return out;
  }

  text(t: string, o: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; indent?: number; gap?: number } = {}) {
    const size = o.size ?? 10;
    const font = o.font ?? this.font;
    const indent = o.indent ?? 0;
    const lines = this.wrap(t, font, size, W - 2 * M - indent);
    for (const l of lines) {
      this.ensure(size + 4);
      this.page.drawText(l, { x: M + indent, y: this.y, size, font, color: o.color ?? INK });
      this.y -= size + 4;
    }
    this.y -= o.gap ?? 2;
    return this;
  }

  heading(t: string) {
    this.ensure(40);
    this.y -= 8;
    this.page.drawRectangle({ x: M, y: this.y - 3, width: 3, height: 14, color: TEAL });
    this.page.drawText(pdfSafe(t), { x: M + 9, y: this.y, size: 12.5, font: this.bold, color: NAVY });
    this.y -= 22;
    return this;
  }

  paragraph(t: string, opts: { muted?: boolean; italic?: boolean } = {}) {
    return this.text(t, { color: opts.muted ? GREY : INK, font: opts.italic ? this.italic : this.font, gap: 6 });
  }

  bullets(items: string[]) {
    for (const i of items) {
      const lines = this.wrap(i, this.font, 10, W - 2 * M - 14);
      this.ensure(14);
      this.page.drawText("•", { x: M + 2, y: this.y, size: 10, font: this.bold, color: TEAL });
      lines.forEach((l, k) => {
        if (k > 0) this.ensure(14);
        this.page.drawText(l, { x: M + 14, y: this.y, size: 10, font: this.font, color: INK });
        this.y -= 14;
      });
    }
    this.y -= 4;
    return this;
  }

  keyValues(rows: Array<[string, string]>) {
    const kw = 170;
    for (const [k, v] of rows) {
      const lines = this.wrap(v || "—", this.font, 10, W - 2 * M - kw);
      this.ensure(lines.length * 14 + 4);
      this.page.drawText(pdfSafe(k), { x: M, y: this.y, size: 9.5, font: this.bold, color: GREY });
      lines.forEach((l, i) => this.page.drawText(l, { x: M + kw, y: this.y - i * 14, size: 10, font: this.font, color: INK }));
      this.y -= lines.length * 14 + 4;
      this.page.drawLine({ start: { x: M, y: this.y + 6 }, end: { x: W - M, y: this.y + 6 }, thickness: 0.4, color: rgb(0.88, 0.9, 0.93) });
    }
    this.y -= 6;
    return this;
  }

  table(headers: string[], rows: string[][], widths?: number[]) {
    const total = W - 2 * M;
    const ws = widths ?? headers.map(() => total / headers.length);
    const draw = (cells: string[], bold: boolean) => {
      const wrapped = cells.map((c, i) => this.wrap(c ?? "", bold ? this.bold : this.font, 8.5, ws[i]! - 8));
      const h = Math.max(...wrapped.map((w) => w.length)) * 11 + 6;
      this.ensure(h + 2);
      if (bold) this.page.drawRectangle({ x: M, y: this.y - h + 9, width: total, height: h, color: rgb(0.95, 0.96, 0.97) });
      let x = M;
      wrapped.forEach((lines, i) => {
        lines.forEach((l, k) => this.page.drawText(l, { x: x + 4, y: this.y - k * 11, size: 8.5, font: bold ? this.bold : this.font, color: INK }));
        x += ws[i]!;
      });
      this.y -= h;
      this.page.drawLine({ start: { x: M, y: this.y + 8 }, end: { x: W - M, y: this.y + 8 }, thickness: 0.4, color: rgb(0.86, 0.88, 0.91) });
    };
    draw(headers, true);
    for (const r of rows) draw(r, false);
    this.y -= 8;
    return this;
  }

  callout(t: string, tone: Tone = "info", title?: string) {
    const lines = this.wrap(t, this.font, 9.5, W - 2 * M - 24);
    const h = lines.length * 13 + (title ? 16 : 0) + 14;
    this.ensure(h + 6);
    const c = TONES[tone];
    this.page.drawRectangle({ x: M, y: this.y - h + 10, width: W - 2 * M, height: h, color: c.bg });
    this.page.drawRectangle({ x: M, y: this.y - h + 10, width: 3, height: h, color: c.fg });
    let y = this.y - 4;
    if (title) {
      this.page.drawText(pdfSafe(title), { x: M + 12, y, size: 10, font: this.bold, color: c.fg });
      y -= 16;
    }
    for (const l of lines) {
      this.page.drawText(l, { x: M + 12, y, size: 9.5, font: this.font, color: INK });
      y -= 13;
    }
    this.y -= h + 6;
    return this;
  }

  async finish(limitations: string[]): Promise<Uint8Array> {
    this.heading("Limitations");
    this.bullets(limitations);
    const pages = this.doc.getPages();
    pages.forEach((p, i) => {
      p.drawText(pdfSafe(`SafeLease · ${this.reference} · Page ${i + 1} of ${pages.length}`), { x: M, y: 30, size: 7.5, font: this.font, color: GREY });
      p.drawText("Information only — not legal advice, not a landlord certification.", { x: W - M - this.font.widthOfTextAtSize("Information only — not legal advice, not a landlord certification.", 7.5), y: 30, size: 7.5, font: this.font, color: GREY });
    });
    return this.doc.save();
  }
}

export const STANDARD_LIMITATIONS = [
  "SafeLease provides legal information, not legal advice. Confirm decisions with the Nova Scotia Residential Tenancies Program (1-800-670-4357) or a legal clinic.",
  "Statements extracted from listings, messages and documents are reported as stated in those sources. Extraction is not verification.",
  "Absence of warning signs does not establish that a listing, landlord or payment is legitimate or safe.",
  "Provider-based checks (address, web research, image search) are only as complete as the provider; unavailable providers are reported as such.",
  "Items labeled DEMO are fictional demonstration data.",
];
