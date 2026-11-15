/**
 * Perceptual image fingerprints for local duplicate / near-duplicate detection.
 * dHash (gradient) + aHash (mean), 64-bit each, hex encoded. Hamming distance
 * ≤ 5 on dHash ≈ near-duplicate; 0 on both ≈ identical content.
 */
import sharp from "sharp";
import exifr from "exifr";

export interface Fingerprint {
  dHash: string;
  aHash: string;
  width: number | null;
  height: number | null;
}

function bitsToHex(bits: number[]): string {
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) {
    hex += ((bits[i]! << 3) | (bits[i + 1]! << 2) | (bits[i + 2]! << 1) | bits[i + 3]!).toString(16);
  }
  return hex;
}

export async function fingerprintImage(bytes: Buffer): Promise<Fingerprint> {
  const img = sharp(bytes, { failOn: "none" }).rotate();
  const meta = await img.metadata();
  const d = await sharp(bytes, { failOn: "none" }).rotate().greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  const dbits: number[] = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) dbits.push(d[y * 9 + x]! > d[y * 9 + x + 1]! ? 1 : 0);
  const a = await sharp(bytes, { failOn: "none" }).rotate().greyscale().resize(8, 8, { fit: "fill" }).raw().toBuffer();
  const mean = a.reduce((s, v) => s + v, 0) / a.length;
  const abits = [...a].map((v) => (v > mean ? 1 : 0));
  return { dHash: bitsToHex(dbits), aHash: bitsToHex(abits), width: meta.width ?? null, height: meta.height ?? null };
}

export function hamming(hexA: string, hexB: string): number {
  if (hexA.length !== hexB.length) return 64;
  let dist = 0;
  for (let i = 0; i < hexA.length; i++) {
    let x = Number.parseInt(hexA[i]!, 16) ^ Number.parseInt(hexB[i]!, 16);
    while (x) {
      dist += x & 1;
      x >>= 1;
    }
  }
  return dist;
}

export type MatchKind = "local_exact" | "local_near" | null;

export function compareFingerprints(a: Pick<Fingerprint, "dHash" | "aHash">, b: Pick<Fingerprint, "dHash" | "aHash">): { kind: MatchKind; distance: number } {
  const dd = hamming(a.dHash, b.dHash);
  const ad = hamming(a.aHash, b.aHash);
  if (dd === 0 && ad <= 1) return { kind: "local_exact", distance: dd };
  if (dd <= 6 && ad <= 10) return { kind: "local_near", distance: dd };
  return { kind: null, distance: dd };
}

/** Only metadata actually present in the file. GPS coordinates are not stored — only whether they exist. */
export async function readImageMetadata(bytes: Buffer): Promise<Record<string, string | number | boolean>> {
  const out: Record<string, string | number | boolean> = {};
  try {
    const exif = await exifr.parse(bytes, { tiff: true, exif: true, gps: true, xmp: false, icc: false });
    if (!exif) return out;
    if (exif.Make) out.cameraMake = String(exif.Make).slice(0, 60);
    if (exif.Model) out.cameraModel = String(exif.Model).slice(0, 60);
    if (exif.Software) out.software = String(exif.Software).slice(0, 60);
    const taken = exif.DateTimeOriginal ?? exif.CreateDate;
    if (taken instanceof Date && !Number.isNaN(taken.getTime())) out.capturedAt = taken.toISOString();
    if (typeof exif.latitude === "number" && typeof exif.longitude === "number") out.gpsPresent = true;
  } catch {
    /* no readable metadata */
  }
  return out;
}
