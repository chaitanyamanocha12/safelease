/**
 * Audit logging. Metadata is passed through `redactMetadata` so message
 * bodies, document text, tokens and contact details never enter the log.
 */
import { db } from "../db/client";
import { auditEvent } from "../db/schema";
import { newId } from "@/lib/ids";
import { redactMetadata } from "../security/redact";

export interface AuditInput {
  actorId: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  orgId?: string | null;
  outcome?: "success" | "denied" | "error";
  metadata?: Record<string, unknown>;
}

export async function audit(input: AuditInput): Promise<void> {
  try {
    await db.insert(auditEvent).values({
      id: newId("aud"),
      actorId: input.actorId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      orgId: input.orgId ?? null,
      outcome: input.outcome ?? "success",
      metadata: input.metadata ? redactMetadata(input.metadata) : null,
    });
  } catch (err) {
    // Auditing must never break the user's request, but failures are visible in logs.
    console.error("[safelease] audit write failed:", err instanceof Error ? err.message : err);
  }
}
