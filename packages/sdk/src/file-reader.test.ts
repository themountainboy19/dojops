import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { readExistingConfig, backupFile } from "./file-reader";

describe("readExistingConfig", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sdk-test-"));
  const testFile = path.join(tmpDir, "test.yml");

  afterEach(() => {
    for (const f of fs.readdirSync(tmpDir)) {
      fs.unlinkSync(path.join(tmpDir, f));
    }
  });

  it("returns null for non-existent file", () => {
    expect(readExistingConfig(path.join(tmpDir, "missing.yml"))).toBeNull();
  });

  it("reads existing file content", () => {
    fs.writeFileSync(testFile, "name: ci\non: push", "utf-8");
    expect(readExistingConfig(testFile)).toBe("name: ci\non: push");
  });

  it("returns null for files larger than 50KB", () => {
    const largeContent = "x".repeat(51 * 1024);
    fs.writeFileSync(testFile, largeContent, "utf-8");
    expect(readExistingConfig(testFile)).toBeNull();
  });

  it("reads files up to exactly 50KB", () => {
    const content = "y".repeat(50 * 1024);
    fs.writeFileSync(testFile, content, "utf-8");
    expect(readExistingConfig(testFile)).toBe(content);
  });
});

describe("backupFile", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sdk-backup-"));
  const testFile = path.join(tmpDir, "config.yml");
  const bakFile = `${testFile}.bak`;

  afterEach(() => {
    for (const f of fs.readdirSync(tmpDir)) {
      fs.unlinkSync(path.join(tmpDir, f));
    }
  });

  it("creates .bak copy of existing file", () => {
    fs.writeFileSync(testFile, "original content", "utf-8");
    backupFile(testFile);
    expect(fs.existsSync(bakFile)).toBe(true);
    expect(fs.readFileSync(bakFile, "utf-8")).toBe("original content");
  });

  it("does nothing for non-existent file", () => {
    backupFile(path.join(tmpDir, "nonexistent.yml"));
    expect(fs.readdirSync(tmpDir)).toHaveLength(0);
  });

  it("overwrites existing backup", () => {
    fs.writeFileSync(testFile, "new content", "utf-8");
    fs.writeFileSync(bakFile, "old backup", "utf-8");
    backupFile(testFile);
    expect(fs.readFileSync(bakFile, "utf-8")).toBe("new content");
  });
});
