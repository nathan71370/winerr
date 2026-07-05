// Secrets-at-rest encryption for user API keys: AES-256-GCM with a key derived
// from AUTH_SECRET (checked at boot in instrumentation.ts). Payload format:
// base64(iv):base64(authTag):base64(ciphertext). decryptSecret returns null on
// any tamper/garbage — callers treat that as "no key configured".
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

function derivedKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return scryptSync(secret, "winerr-settings-v1", 32);
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derivedKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(payload: string): string | null {
  try {
    const [iv, tag, data] = payload.split(":").map((p) => Buffer.from(p, "base64"));
    if (!iv?.length || !tag?.length || !data) return null;
    const decipher = createDecipheriv("aes-256-gcm", derivedKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
