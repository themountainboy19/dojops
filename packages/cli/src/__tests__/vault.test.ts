import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encrypt, decrypt, isEncrypted, encryptTokens, decryptTokens } from "../vault";

describe("vault", () => {
  const originalEnv = process.env.DOJOPS_VAULT_KEY;

  beforeEach(() => {
    // Use a fixed key for deterministic tests
    process.env.DOJOPS_VAULT_KEY = "test-vault-key-for-unit-tests";
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.DOJOPS_VAULT_KEY;
    } else {
      process.env.DOJOPS_VAULT_KEY = originalEnv;
    }
  });

  it("encrypts and decrypts a string round-trip", () => {
    const plaintext = "sk-abc123secretkey";
    const ciphertext = encrypt(plaintext);
    expect(ciphertext).not.toBe(plaintext);
    expect(ciphertext.startsWith("enc:v1:")).toBe(true);
    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  it("produces different ciphertexts for same plaintext (unique IV)", () => {
    const plaintext = "sk-test-token";
    const a = encrypt(plaintext);
    const b = encrypt(plaintext);
    expect(a).not.toBe(b);
    // Both should decrypt to the same value
    expect(decrypt(a)).toBe(plaintext);
    expect(decrypt(b)).toBe(plaintext);
  });

  it("isEncrypted detects encrypted values", () => {
    expect(isEncrypted("enc:v1:somebase64")).toBe(true);
    expect(isEncrypted("sk-plaintext")).toBe(false);
    expect(isEncrypted("")).toBe(false);
  });

  it("decrypt returns plaintext values unchanged", () => {
    expect(decrypt("sk-plaintext")).toBe("sk-plaintext");
  });

  it("throws on corrupted ciphertext", () => {
    expect(() => decrypt("enc:v1:baddata")).toThrow();
  });

  it("encryptTokens encrypts all values", () => {
    const tokens = { openai: "sk-test", anthropic: "ant-key" };
    const encrypted = encryptTokens(tokens);
    expect(isEncrypted(encrypted.openai)).toBe(true);
    expect(isEncrypted(encrypted.anthropic)).toBe(true);
  });

  it("encryptTokens skips already-encrypted values", () => {
    const alreadyEncrypted = encrypt("sk-test");
    const tokens = { openai: alreadyEncrypted };
    const result = encryptTokens(tokens);
    expect(result.openai).toBe(alreadyEncrypted);
  });

  it("decryptTokens decrypts all values", () => {
    const tokens = {
      openai: encrypt("sk-openai"),
      anthropic: encrypt("sk-anthropic"),
    };
    const decrypted = decryptTokens(tokens);
    expect(decrypted.openai).toBe("sk-openai");
    expect(decrypted.anthropic).toBe("sk-anthropic");
  });

  it("decryptTokens passes through plaintext values", () => {
    const tokens = { openai: "sk-plain" };
    const decrypted = decryptTokens(tokens);
    expect(decrypted.openai).toBe("sk-plain");
  });

  it("decryptTokens handles corrupted values gracefully", () => {
    const tokens = { openai: "enc:v1:corrupted" };
    const decrypted = decryptTokens(tokens);
    // Returns raw value on decryption failure
    expect(decrypted.openai).toBe("enc:v1:corrupted");
  });

  it("fails to decrypt with wrong key", () => {
    const ciphertext = encrypt("sk-secret");
    // Change the key
    process.env.DOJOPS_VAULT_KEY = "different-key";
    expect(() => decrypt(ciphertext)).toThrow();
  });
});
