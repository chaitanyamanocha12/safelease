import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { compareFingerprints, fingerprintImage } from "@/server/images/fingerprint";

const img = (n: string) => fs.readFileSync(path.resolve("public/demo/listings", n));

describe("image fingerprints", () => {
  it("matches a re-encoded, resized copy as a near duplicate", async () => {
    const a = await fingerprintImage(img("listing-03.png"));
    const b = await fingerprintImage(await sharp(img("listing-03.png")).resize(640, 427).jpeg({ quality: 70 }).toBuffer());
    expect(compareFingerprints(a, b).kind).not.toBeNull();
  });
  it("matches identical bytes exactly", async () => {
    const a = await fingerprintImage(img("listing-07.png"));
    expect(compareFingerprints(a, a).kind).toBe("local_exact");
  });
  it("does not match different demo images", async () => {
    const a = await fingerprintImage(img("listing-01.png"));
    const b = await fingerprintImage(img("listing-02.png"));
    expect(compareFingerprints(a, b).kind).toBeNull();
  });
});
