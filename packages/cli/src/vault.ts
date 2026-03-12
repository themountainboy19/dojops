/**
 * Encrypted secrets vault — AES-256-GCM encryption for API tokens.
 *
 * Key derivation:
 *   1. DOJOPS_VAULT_KEY env var (explicit passphrase)
 *   2. Machine-derived from hostname + username (zero-config default)
 *
 * Ciphertext format: "enc:v1:<base64(iv[12] + authTag[16] + ciphertext)>"
 *
 * Each value has a unique random IV so identical plaintexts produce
 * different ciphertexts. The authTag prevents tampering.
 */
import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from "node:crypto";
import os from "node:os";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const SALT = "dojops-vault-v1";
const ENCRYPTED_PREFIX = "enc:v1:";

/** Derive a 256-bit key from a passphrase using scrypt. */
function deriveKey(passphrase: string): Buffer {
  return scryptSync(passphrase, SALT, KEY_LENGTH);
}

/** Get the vault key — from env or machine-derived. */
function getVaultKey(): Buffer {
  const envKey = process.env.DOJOPS_VAULT_KEY;
  if (envKey) return deriveKey(envKey);

  // Machine-derived: hostname + username + home dir path
  let username = "unknown";
  try {
    username = os.userInfo().username ?? "unknown";
  } catch {
    // os.userInfo() can throw on some platforms
  }
  const machineId = `${os.hostname()}:${username}:${os.homedir()}`;
  return deriveKey(machineId);
}

/** Check if a value is encrypted. */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX);
}

/** Encrypt a plaintext string. Returns "enc:v1:<base64>" format. */
export function encrypt(plaintext: string): string {
  const key = getVaultKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Pack: iv + authTag + ciphertext
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return ENCRYPTED_PREFIX + packed.toString("base64");
}

/** Decrypt an "enc:v1:<base64>" value back to plaintext. */
export function decrypt(ciphertext: string): string {
  if (!isEncrypted(ciphertext)) return ciphertext;

  const key = getVaultKey();
  const packed = Buffer.from(ciphertext.slice(ENCRYPTED_PREFIX.length), "base64");

  if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Invalid encrypted value: too short");
  }

  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const data = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return decipher.update(data) + decipher.final("utf-8");
}

/** Encrypt all token values in a tokens map. Already-encrypted values are skipped. */
export function encryptTokens(tokens: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [provider, value] of Object.entries(tokens)) {
    if (!value) continue;
    result[provider] = isEncrypted(value) ? value : encrypt(value);
  }
  return result;
}

/** Decrypt all token values in a tokens map. Plaintext values pass through. */
export function decryptTokens(tokens: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [provider, value] of Object.entries(tokens)) {
    if (!value) continue;
    try {
      result[provider] = isEncrypted(value) ? decrypt(value) : value;
    } catch {
      // Decryption failed — key mismatch or corruption. Return raw value.
      result[provider] = value;
    }
  }
  return result;
}
