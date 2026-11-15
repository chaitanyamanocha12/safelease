/**
 * Generates ORIGINAL demo imagery and sample documents for SafeLease.
 * Everything produced here is fictional and owned by the project.
 * Usage: npx tsx scripts/generate-demo-assets.ts
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { fingerprintImage, hamming } from "../src/server/images/fingerprint";
import { LISTING_SCREENSHOT_TEXT, MESSAGE_TEXT, LEASE_V1_TEXT, LEASE_V2_TEXT } from "../src/server/seed/demo-texts";

const OUT = path.resolve("public/demo");

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function sceneSvg(seed: number): string {
  const r = rng(seed);
  const W = 960, H = 640;
  const hues = [200, 190, 210, 25, 160, 280, 340, 45, 120];
  const sky = hues[seed % hues.length]!;
  const layout = seed % 4;
  const parts: string[] = [];
  parts.push(`<defs><linearGradient id="sky" x1="0" y1="${layout % 2}" x2="${1 - (layout % 2)}" y2="1"><stop offset="0" stop-color="hsl(${sky},70%,${55 + r() * 25}%)"/><stop offset="1" stop-color="hsl(${(sky + 40) % 360},60%,${85 - r() * 20}%)"/></linearGradient></defs>`);
  parts.push(`<rect width="${W}" height="${H}" fill="url(#sky)"/>`);
  // ground band at varying height
  const ground = 420 + Math.floor(r() * 160);
  parts.push(`<rect y="${ground}" width="${W}" height="${H - ground}" fill="hsl(${90 + r() * 60},30%,${30 + r() * 25}%)"/>`);
  // buildings: count and placement differ strongly per seed
  const n = 1 + (seed % 3);
  for (let b = 0; b < n; b++) {
    const bw = 220 + r() * 300;
    const bh = 180 + r() * 320;
    const bx = (layout === 0 ? 60 : layout === 1 ? W - bw - 60 : 120 + b * 300 + r() * 80) % (W - bw);
    const by = ground - bh;
    const tone = Math.floor(r() * 360);
    const light = 20 + r() * 55;
    parts.push(`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="hsl(${tone},25%,${light}%)"/>`);
    if (r() > 0.5) parts.push(`<polygon points="${bx - 10},${by} ${bx + bw / 2},${by - 60 - r() * 60} ${bx + bw + 10},${by}" fill="hsl(${tone},30%,${light - 12}%)"/>`);
    const cols = 2 + Math.floor(r() * 4);
    const rows = 2 + Math.floor(r() * 5);
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) {
        const wx = bx + 20 + i * ((bw - 40) / cols);
        const wy = by + 20 + j * ((bh - 40) / rows);
        parts.push(`<rect x="${wx}" y="${wy}" width="${(bw - 40) / cols - 14}" height="${(bh - 40) / rows - 14}" rx="3" fill="hsl(${50 + r() * 20},${60 + r() * 30}%,${light > 50 ? 25 : 80}%)"/>`);
      }
  }
  // sun / moon
  parts.push(`<circle cx="${100 + r() * 760}" cy="${60 + r() * 120}" r="${30 + r() * 40}" fill="hsl(45,95%,${70 + r() * 20}%)" opacity="0.9"/>`);
  parts.push(`<text x="${W - 20}" y="${H - 18}" text-anchor="end" font-family="Helvetica, Arial" font-size="20" fill="#ffffff" opacity="0.85">SafeLease DEMO illustration · fictional</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join("")}</svg>`;
}

function textImageSvg(text: string, title: string): string {
  const lines = text.split("\n");
  const W = 900, lh = 30, H = 140 + lines.length * lh;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#ffffff"/><rect width="100%" height="64" fill="#3d3d6b"/><text x="24" y="42" font-family="Helvetica, Arial" font-size="26" font-weight="bold" fill="#ffffff">${esc(title)}</text>${lines
    .map((l, i) => `<text x="28" y="${110 + i * lh}" font-family="Helvetica, Arial" font-size="21" fill="#111111">${esc(l)}</text>`)
    .join("")}</svg>`;
}

async function pdfFromText(text: string, file: string) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pagesText = text.split("\f");
  for (const pt of pagesText) {
    const page = doc.addPage([612, 792]);
    let y = 740;
    for (const raw of pt.split("\n")) {
      const isHead = /^[A-Z0-9 ().-]{6,}$/.test(raw.trim());
      const words = raw.split(" ");
      let line = "";
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(test, 11) > 520) {
          page.drawText(line, { x: 46, y, size: 11, font, color: rgb(0.1, 0.1, 0.1) });
          y -= 16;
          line = w;
        } else line = test;
      }
      page.drawText(line, { x: 46, y, size: isHead ? 12 : 11, font: isHead ? bold : font, color: rgb(0.1, 0.1, 0.1) });
      y -= isHead ? 22 : 16;
    }
    page.drawText("FICTIONAL SAMPLE DOCUMENT — SafeLease demonstration only", { x: 46, y: 30, size: 8, font, color: rgb(0.5, 0.3, 0) });
  }
  fs.writeFileSync(path.join(OUT, "samples", file), await doc.save());
}

async function main() {
  fs.mkdirSync(path.join(OUT, "listings"), { recursive: true });
  fs.mkdirSync(path.join(OUT, "samples"), { recursive: true });
  const fps: Array<{ name: string; d: string }> = [];
  for (let i = 1; i <= 20; i++) {
    const file = path.join(OUT, "listings", `listing-${String(i).padStart(2, "0")}.png`);
    const buf = await sharp(Buffer.from(sceneSvg(i * 7919))).png().toBuffer();
    fs.writeFileSync(file, buf);
    fps.push({ name: path.basename(file), d: (await fingerprintImage(buf)).pHash });
  }
  // Near-duplicate of listing-03 (cropped + brightened) used by the image-reuse demo.
  const base = fs.readFileSync(path.join(OUT, "listings", "listing-03.png"));
  // Re-uploaded copy: downscaled, re-encoded as JPEG, slightly brighter.
  const dup = await sharp(base).resize(800, 533).modulate({ brightness: 1.04 }).jpeg({ quality: 78 }).toBuffer();
  fs.writeFileSync(path.join(OUT, "samples", "property-photo.jpg"), dup);
  const dupFp = await fingerprintImage(dup);
  console.log("near-duplicate distance to listing-03:", hamming(dupFp.pHash, fps[2]!.d));
  let min = 64;
  for (let i = 0; i < fps.length; i++) for (let j = i + 1; j < fps.length; j++) min = Math.min(min, hamming(fps[i]!.d, fps[j]!.d));
  console.log("minimum pHash distance between distinct demo images:", min);

  await sharp(Buffer.from(textImageSvg(LISTING_SCREENSHOT_TEXT, "RentFinder — listing (fictional)"))).png().toFile(path.join(OUT, "samples", "listing-screenshot.png"));
  fs.writeFileSync(path.join(OUT, "samples", "landlord-message.txt"), MESSAGE_TEXT);
  await pdfFromText(LEASE_V1_TEXT, "lease-v1.pdf");
  await pdfFromText(LEASE_V2_TEXT, "lease-v2-revised.pdf");
  console.log("demo assets written to public/demo");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
