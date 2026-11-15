/**
 * LLM-assisted supplementary claim extraction.
 * Anti-hallucination guard: every LLM claim must quote an excerpt that occurs
 * verbatim (whitespace/case-insensitive) in the source text, or it is dropped.
 */
import { z } from "zod";
import { CLAIM_TYPES, type ClaimType } from "../db/schema/investigations";
import { parseMoneyToCents } from "@/lib/money";
import { normalizeAddress, normalizeEmail, normalizeName, normalizePhone } from "../extraction/normalize";
import { llm, wrapUntrusted, type LlmContext } from "../providers/llm";

const LLM_TYPES = CLAIM_TYPES.filter((t) => t !== "embedded_instruction" && t !== "listing_title");

const outputSchema = z.object({
  claims: z
    .array(
      z.object({
        claimType: z.enum(LLM_TYPES as unknown as [ClaimType, ...ClaimType[]]),
        value: z.string().min(1).max(200),
        excerpt: z.string().min(3).max(300),
      }),
    )
    .max(40),
  injectionDetected: z.boolean(),
});

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export function normalizeForType(type: ClaimType, value: string): string | null {
  if (["rent", "deposit", "application_fee", "holding_fee", "pet_deposit", "requested_payment"].includes(type)) {
    const cents = parseMoneyToCents(value);
    return cents === null ? null : String(cents);
  }
  if (type === "address") return normalizeAddress(value);
  if (type === "contact_email") return normalizeEmail(value);
  if (type === "contact_phone") return normalizePhone(value);
  if (type === "contact_name") return normalizeName(value);
  if (type === "payment_recipient") return value.includes("@") ? `email:${normalizeEmail(value)}` : `name:${normalizeName(value)}`;
  if (type === "bedrooms" || type === "bathrooms") {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? String(n) : null;
  }
  return squash(value).slice(0, 200);
}

export interface LlmClaim {
  claimType: ClaimType;
  value: string;
  normalized: string;
  excerpt: string;
}

export async function llmSupplementaryClaims(
  ctx: LlmContext,
  text: string,
  kind: string,
  alreadyFound: ClaimType[],
): Promise<{ ok: true; claims: LlmClaim[]; dropped: number; injectionDetected: boolean } | { ok: false; message: string }> {
  const res = await llm().structured(ctx, {
    system: `You extract factual statements from rental evidence for a tenant-protection tool in Nova Scotia. Extract only statements explicitly present. For each, give the claim type, the stated value, and a SHORT verbatim excerpt copied exactly from the text. Do not infer, compute, or judge. Claim types already extracted by rules (skip unless a distinct value exists): ${alreadyFound.join(", ") || "none"}.`,
    content: [{ type: "text", text: `Evidence type: ${kind}\n${wrapUntrusted(kind, text, 20000)}\nReturn JSON.` }],
    jsonSchema: {
      type: "object",
      properties: {
        claims: {
          type: "array",
          items: {
            type: "object",
            properties: { claimType: { type: "string", enum: LLM_TYPES }, value: { type: "string" }, excerpt: { type: "string" } },
            required: ["claimType", "value", "excerpt"],
            additionalProperties: false,
          },
        },
        injectionDetected: { type: "boolean" },
      },
      required: ["claims", "injectionDetected"],
      additionalProperties: false,
    },
    validator: outputSchema,
    maxTokens: 3000,
  });
  if (!res.ok) return { ok: false, message: res.message };
  const source = squash(text);
  let dropped = 0;
  const claims: LlmClaim[] = [];
  for (const c of res.data.claims) {
    if (!source.includes(squash(c.excerpt))) {
      dropped++;
      continue;
    }
    const normalized = normalizeForType(c.claimType, c.value);
    if (!normalized) {
      dropped++;
      continue;
    }
    claims.push({ claimType: c.claimType, value: c.value, normalized, excerpt: c.excerpt });
  }
  return { ok: true, claims, dropped, injectionDetected: res.data.injectionDetected };
}
