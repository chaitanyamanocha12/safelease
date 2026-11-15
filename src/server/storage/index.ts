/**
 * Private object storage. Local disk for development (outside /public);
 * S3-compatible storage for hosted deployments. Bytes are only ever served
 * through authorized route handlers.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../env";
import type { ProviderInfo } from "../providers/types";

export interface StorageProvider {
  readonly id: "local" | "s3";
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  info(): ProviderInfo;
}

const KEY_RE = /^[a-z0-9_-]+(\/[a-z0-9_.-]+){1,4}$/i;

export function assertSafeKey(key: string) {
  if (!KEY_RE.test(key) || key.includes("..")) throw new Error("Invalid storage key");
}

class LocalStorage implements StorageProvider {
  readonly id = "local" as const;
  private root = path.resolve(env().STORAGE_LOCAL_DIR);

  private resolve(key: string) {
    assertSafeKey(key);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error("Invalid storage key");
    return full;
  }
  async put(key: string, bytes: Buffer) {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, bytes, { mode: 0o600 });
  }
  async get(key: string) {
    return fs.readFile(this.resolve(key));
  }
  async delete(key: string) {
    await fs.rm(this.resolve(key), { force: true });
  }
  info(): ProviderInfo {
    return {
      id: "local",
      category: "storage",
      name: "Local private storage",
      description: `Files stored on this server's disk at ${env().STORAGE_LOCAL_DIR} (not publicly served).`,
      capabilities: ["put", "get", "delete"],
      status: "LIVE",
      statusMessage: "Active. Suitable for local development and single-server hosting only — not durable on serverless platforms.",
      requiredEnv: ["STORAGE_LOCAL_DIR"],
    };
  }
}

class S3Storage implements StorageProvider {
  readonly id = "s3" as const;
  private clientPromise: Promise<import("@aws-sdk/client-s3").S3Client> | null = null;

  private configured() {
    const e = env();
    return Boolean(e.S3_BUCKET && e.S3_REGION && e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY);
  }
  private async client() {
    if (!this.configured()) throw new Error("S3 storage is not configured");
    if (!this.clientPromise) {
      this.clientPromise = import("@aws-sdk/client-s3").then(({ S3Client }) => {
        const e = env();
        return new S3Client({
          region: e.S3_REGION,
          endpoint: e.S3_ENDPOINT,
          forcePathStyle: Boolean(e.S3_ENDPOINT),
          credentials: { accessKeyId: e.S3_ACCESS_KEY_ID!, secretAccessKey: e.S3_SECRET_ACCESS_KEY! },
        });
      });
    }
    return this.clientPromise;
  }
  async put(key: string, bytes: Buffer, contentType: string) {
    assertSafeKey(key);
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await (await this.client()).send(
      new PutObjectCommand({ Bucket: env().S3_BUCKET, Key: key, Body: bytes, ContentType: contentType, ServerSideEncryption: "AES256" }),
    );
  }
  async get(key: string) {
    assertSafeKey(key);
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const res = await (await this.client()).send(new GetObjectCommand({ Bucket: env().S3_BUCKET, Key: key }));
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) throw new Error("Empty object");
    return Buffer.from(bytes);
  }
  async delete(key: string) {
    assertSafeKey(key);
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await (await this.client()).send(new DeleteObjectCommand({ Bucket: env().S3_BUCKET, Key: key }));
  }
  info(): ProviderInfo {
    const ok = this.configured();
    return {
      id: "s3",
      category: "storage",
      name: "S3-compatible private storage",
      description: "Private bucket storage (AWS S3, Cloudflare R2, MinIO…). Objects are never public; served through authorized routes.",
      capabilities: ["put", "get", "delete"],
      status: ok ? "LIVE" : "NOT_CONFIGURED",
      statusMessage: ok ? "Configured (connectivity is checked by the admin health check)." : "Set S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY (and S3_ENDPOINT for non-AWS).",
      requiredEnv: ["S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"],
    };
  }
}

let instance: StorageProvider | null = null;
export function storage(): StorageProvider {
  if (!instance) instance = env().STORAGE_PROVIDER === "s3" ? new S3Storage() : new LocalStorage();
  return instance;
}
