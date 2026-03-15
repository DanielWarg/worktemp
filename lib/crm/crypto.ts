/**
 * AES-256-GCM encryption for CRM API keys.
 *
 * Uses CRM_ENCRYPTION_KEY env var (32-byte hex string).
 * Falls back to plaintext if key is not set (dev mode).
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey(): Buffer | null {
  const hex = process.env.CRM_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) return null; // 32 bytes = 64 hex chars
  return Buffer.from(hex, "hex");
}

/**
 * Encrypt a plaintext API key.
 * Returns format: iv:ciphertext:tag (hex-encoded).
 * If no encryption key is configured, returns plaintext (dev mode).
 */
export function encryptApiKey(plaintext: string): string {
  const key = getKey();
  if (!key) return plaintext;

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${encrypted}:${tag.toString("hex")}`;
}

/**
 * Decrypt an encrypted API key.
 * Handles both encrypted (iv:ciphertext:tag) and plaintext (legacy) formats.
 */
export function decryptApiKey(stored: string): string {
  const key = getKey();
  if (!key) return stored;

  const parts = stored.split(":");
  if (parts.length !== 3) return stored; // Legacy plaintext — not encrypted

  const [ivHex, ciphertext, tagHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");

  if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) return stored;

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
