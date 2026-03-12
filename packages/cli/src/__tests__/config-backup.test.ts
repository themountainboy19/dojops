import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

describe("config backup/restore", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dojops-backup-test-"));
    // Create a .dojops directory with some content
    const dojopsDir = path.join(tmpDir, ".dojops");
    fs.mkdirSync(dojopsDir, { recursive: true });
    fs.writeFileSync(path.join(dojopsDir, "config.json"), '{"defaultProvider":"openai"}');
    fs.mkdirSync(path.join(dojopsDir, "plans"), { recursive: true });
    fs.writeFileSync(path.join(dojopsDir, "plans", "test.json"), '{"id":"test"}');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates a tar.gz backup of .dojops/", () => {
    const outPath = path.join(tmpDir, "backup.tar.gz");
    execFileSync("tar", ["czf", outPath, "-C", tmpDir, ".dojops"], { stdio: "pipe" });

    expect(fs.existsSync(outPath)).toBe(true);
    const stat = fs.statSync(outPath);
    expect(stat.size).toBeGreaterThan(0);
  });

  it("restores .dojops/ from a backup", () => {
    // Create backup
    const outPath = path.join(tmpDir, "backup.tar.gz");
    execFileSync("tar", ["czf", outPath, "-C", tmpDir, ".dojops"], { stdio: "pipe" });

    // Delete .dojops
    fs.rmSync(path.join(tmpDir, ".dojops"), { recursive: true, force: true });
    expect(fs.existsSync(path.join(tmpDir, ".dojops"))).toBe(false);

    // Restore
    execFileSync("tar", ["xzf", outPath, "-C", tmpDir], { stdio: "pipe" });

    expect(fs.existsSync(path.join(tmpDir, ".dojops", "config.json"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".dojops", "plans", "test.json"))).toBe(true);

    const content = fs.readFileSync(path.join(tmpDir, ".dojops", "config.json"), "utf-8");
    expect(JSON.parse(content)).toEqual({ defaultProvider: "openai" });
  });

  it("verifies SHA-256 checksum", () => {
    const outPath = path.join(tmpDir, "backup.tar.gz");
    execFileSync("tar", ["czf", outPath, "-C", tmpDir, ".dojops"], { stdio: "pipe" });

    const hash = createHash("sha256").update(fs.readFileSync(outPath)).digest("hex");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);

    // Tamper with the file
    const buf = fs.readFileSync(outPath);
    buf[buf.length - 1] = buf[buf.length - 1] ^ 0xff;
    fs.writeFileSync(outPath, buf);

    const tamperedHash = createHash("sha256").update(fs.readFileSync(outPath)).digest("hex");
    expect(tamperedHash).not.toBe(hash);
  });
});
