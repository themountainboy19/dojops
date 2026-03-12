import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { saveDebugOutput, listDebugOutputs, readLatestDebugOutput } from "../state";

describe("debug output tee/recovery", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dojops-debug-test-"));
    fs.mkdirSync(path.join(tmpDir, ".dojops"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("saveDebugOutput", () => {
    it("saves output to .dojops/debug/", () => {
      const filePath = saveDebugOutput(tmpDir, "ci-log", "ERROR: build failed");
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, "utf-8")).toContain("ERROR: build failed");
    });

    it("includes metadata header when provided", () => {
      const filePath = saveDebugOutput(tmpDir, "scanner", "CVE-2024-0001", {
        command: "scan --fix",
        scanType: "security",
      });
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("source: scanner");
      expect(content).toContain("command: scan --fix");
      expect(content).toContain("CVE-2024-0001");
    });

    it("creates debug directory if missing", () => {
      const debugDir = path.join(tmpDir, ".dojops", "debug");
      expect(fs.existsSync(debugDir)).toBe(false);
      saveDebugOutput(tmpDir, "test", "content");
      expect(fs.existsSync(debugDir)).toBe(true);
    });
  });

  describe("listDebugOutputs", () => {
    it("returns empty array when no debug outputs", () => {
      expect(listDebugOutputs(tmpDir)).toEqual([]);
    });

    it("lists debug files newest first", () => {
      saveDebugOutput(tmpDir, "first", "content1");
      saveDebugOutput(tmpDir, "second", "content2");
      const files = listDebugOutputs(tmpDir);
      expect(files.length).toBe(2);
      // Newest first (alphabetical reverse on timestamp-named files)
      expect(path.basename(files[0])).toContain("second");
    });
  });

  describe("readLatestDebugOutput", () => {
    it("returns null when no matching source", () => {
      expect(readLatestDebugOutput(tmpDir, "nonexistent")).toBeNull();
    });

    it("reads the most recent output for a source", () => {
      saveDebugOutput(tmpDir, "ci-log", "first error");
      saveDebugOutput(tmpDir, "ci-log", "second error");
      const content = readLatestDebugOutput(tmpDir, "ci-log");
      expect(content).toContain("second error");
    });
  });
});
