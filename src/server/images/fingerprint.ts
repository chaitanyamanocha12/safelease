/**
 * Perceptual image fingerprints for local duplicate / near-duplicate detection.
 * pHash (DCT low frequencies) + aHash (mean), 64-bit each, hex encoded.
 * pHash Hamming distance ≤ 10 ≈ near-duplicate; ≤ 1 (with aHash ≤ 2) ≈ identical content.
 */
import sharp from "sharp";
import exifr from "exifr";

export interface Fingerprint {
  /** 64-bit DCT perceptual hash (robust to resize, re-encoding, brightness). */
  pHash: string;
  /** 64-bit average hash (secondary signal). */
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

const N = 32;
const COS: number[][] = Array.from({ length: N }, (_, k) => Array.from({ length: N }, (_, n) => Math.cos(((2 * n + 1) * k * Math.PI) / (2 * N))));

function dct2(px: Float64Array): number[][] {
  const tmp: number[][] = Array.from({ length: N }, () => new Array<number>(N).fill(0));
  for (let y = 0; y < N; y++) for (let k = 0; k < 8; k++) {
    let sum = 0;
    for (let x = 0; x < N; x++) sum += px[y * N + x]! * COS[k]![x]!;
    tmp[y]![k] = sum;
  }
  const out: number[][] = Array.from({ length: 8 }, () => new Array<number>(8).fill(0));
  for (let k = 0; k < 8; k++) for (let l = 0; l < 8; l++) {
    let sum = 0;
    for (let y = 0; y < N; y++) sum += tmp[y]![l]! * COS[k]![y]!;
    out[k]![l] = sum;
  }
  return out;
}

export async function fingerprintImage(bytes: Buffer): Promise<Fingerprint> {
  const meta = await sharp(bytes, { failOn: "none" }).rotate().metadata();
  const raw = await sharp(bytes, { failOn: "none" }).rotate().greyscale().resize(N, N, { fit: "fill" }).raw().toBuffer();
  const px = Float64Array.from(raw);
  const d = dct2(px);
  const coeffs: number[] = [];
  for (let k = 0; k < 8; k++) for (let l = 0; l < 8; l++) coeffs.push(d[k]![l]!);
  const ac = coeffs.slice(1);
  const median = [...ac].sort((a, b) => a - b)[Math.floor(ac.length / 2)]!;
  const pbits = coeffs.map((c) => (c > median ? 1 : 0));
  const a = await sharp(bytes, { failOn: "none" }).rotate().greyscale().blur(1.2).resize(8, 8, { fit: "fill" }).raw().toBuffer();
  const mean = a.reduce((sum, v) => sum + v, 0) / a.length;
  const abits = [...a].map((v) => (v > mean ? 1 : 0));
  return { pHash: bitsToHex(pbits), aHash: bitsToHex(abits), width: meta.width ?? null, height: meta.height ?? null };
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

export function compareFingerprints(a: Pick<Fingerprint, "pHash" | "aHash">, b: Pick<Fingerprint, "pHash" | "aHash">): { kind: MatchKind; distance: number } {
  const pd = hamming(a.pHash, b.pHash);
  const ad = hamming(a.aHash, b.aHash);
  if (pd <= 1 && ad <= 2) return { kind: "local_exact", distance: pd };
  if (pd <= 10 && ad <= 14) return { kind: "local_near", distance: pd };
  return { kind: null, distance: pd };
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
