import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

/** Dateispeicher-Abstraktion. Lokal als Standard, S3-kompatibel sobald konfiguriert. */
export interface StorageProvider {
  readonly key: string;
  put(tenantId: string, filename: string, data: Buffer, mimeType: string): Promise<string>;
  get(storageKey: string): Promise<Buffer>;
  remove(storageKey: string): Promise<void>;
}

const ROOT = path.join(process.cwd(), "storage");

class LocalStorageProvider implements StorageProvider {
  readonly key = "local";

  private resolve(storageKey: string): string {
    const target = path.resolve(ROOT, storageKey);
    // Pfad-Traversal ausschließen.
    if (!target.startsWith(path.resolve(ROOT))) throw new AppError("Ungültiger Speicherpfad.", 400, "invalid_path");
    return target;
  }

  async put(tenantId: string, filename: string, data: Buffer): Promise<string> {
    const safeName = filename.replace(/[^\w.\-]/g, "_").slice(-80);
    const storageKey = path.join(tenantId, `${randomUUID()}-${safeName}`);
    const target = this.resolve(storageKey);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
    return storageKey;
  }

  async get(storageKey: string): Promise<Buffer> {
    return readFile(this.resolve(storageKey));
  }

  async remove(storageKey: string): Promise<void> {
    await unlink(this.resolve(storageKey)).catch(() => undefined);
  }
}

/**
 * S3-kompatibler Speicher über die REST-Schnittstelle (AWS Signature V4).
 * Wird verwendet, sobald S3_ENDPOINT, S3_BUCKET und Zugangsdaten gesetzt sind.
 */
class S3StorageProvider implements StorageProvider {
  readonly key = "s3";

  async put(tenantId: string, filename: string, data: Buffer, mimeType: string): Promise<string> {
    const safeName = filename.replace(/[^\w.\-]/g, "_").slice(-80);
    const storageKey = `${tenantId}/${randomUUID()}-${safeName}`;
    const response = await this.request("PUT", storageKey, data, mimeType);
    if (!response.ok) {
      throw new AppError(`Datei konnte nicht gespeichert werden (${response.status}).`, 502, "storage_error");
    }
    return storageKey;
  }

  async get(storageKey: string): Promise<Buffer> {
    const response = await this.request("GET", storageKey);
    if (!response.ok) throw new AppError(`Datei nicht lesbar (${response.status}).`, 502, "storage_error");
    return Buffer.from(await response.arrayBuffer());
  }

  async remove(storageKey: string): Promise<void> {
    await this.request("DELETE", storageKey);
  }

  private async request(method: string, key: string, body?: Buffer, contentType?: string): Promise<Response> {
    const url = new URL(`${env.storage.endpoint.replace(/\/$/, "")}/${env.storage.bucket}/${key}`);
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = createHash("sha256")
      .update(body ?? Buffer.alloc(0))
      .digest("hex");

    const headers: Record<string, string> = {
      host: url.host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    };
    if (contentType) headers["content-type"] = contentType;

    const signedHeaders = Object.keys(headers).sort().join(";");
    const canonicalHeaders = Object.keys(headers)
      .sort()
      .map((name) => `${name}:${headers[name]}\n`)
      .join("");

    const canonicalRequest = [method, url.pathname, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
    const scope = `${dateStamp}/${env.storage.region}/s3/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      scope,
      createHash("sha256").update(canonicalRequest).digest("hex"),
    ].join("\n");

    const { createHmac } = await import("node:crypto");
    const hmac = (key: Buffer | string, value: string) => createHmac("sha256", key).update(value).digest();
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${env.storage.secretAccessKey}`, dateStamp), env.storage.region), "s3"), "aws4_request");
    const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

    return fetch(url, {
      method,
      headers: {
        ...headers,
        Authorization: `AWS4-HMAC-SHA256 Credential=${env.storage.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      },
      body: body ? new Uint8Array(body) : undefined,
    });
  }
}

export function getStorage(): StorageProvider {
  return env.storage.configured ? new S3StorageProvider() : new LocalStorageProvider();
}
