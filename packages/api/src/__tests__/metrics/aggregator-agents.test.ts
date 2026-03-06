import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { MetricsAggregator } from "../../metrics/aggregator";
import { createTempDir, writeAuditEntries } from "./test-helpers";

function setupDojops(rootDir: string) {
  const dojopsDir = path.join(rootDir, ".dojops");
  fs.mkdirSync(path.join(dojopsDir, "history"), { recursive: true });
  return dojopsDir;
}

/** Create an audit entry with sensible defaults and an auto-incrementing timestamp. */
function makeAuditEntry(
  overrides?: Partial<Record<string, unknown>>,
  index = 0,
): Record<string, unknown> {
  return {
    timestamp: `2024-01-01T00:${String(index).padStart(2, "0")}:00Z`,
    user: "test",
    command: "generate",
    action: "generate",
    status: "success",
    durationMs: 100,
    ...overrides,
  };
}

describe("MetricsAggregator mostUsedAgents (M-2)", () => {
  let rootDir: string;
  let dojopsDir: string;

  beforeEach(() => {
    rootDir = createTempDir();
    dojopsDir = setupDojops(rootDir);
  });

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  describe("agent field extraction", () => {
    it("uses entry.agent when present (not command string)", () => {
      writeAuditEntries(dojopsDir, [
        makeAuditEntry({ command: "generate terraform config", agent: "terraform-specialist" }),
      ]);
      expect(new MetricsAggregator(rootDir).getOverview().mostUsedAgents).toEqual([
        { agent: "terraform-specialist", count: 1 },
      ]);
    });

    it("falls back to command verb when agent absent", () => {
      writeAuditEntries(dojopsDir, [
        makeAuditEntry({ command: "plan deploy infra", action: "decompose" }),
      ]);
      expect(new MetricsAggregator(rootDir).getOverview().mostUsedAgents).toEqual([
        { agent: "plan", count: 1 },
      ]);
    });

    it("agent field takes priority over command", () => {
      writeAuditEntries(dojopsDir, [makeAuditEntry({ agent: "security-auditor" })]);
      expect(new MetricsAggregator(rootDir).getOverview().mostUsedAgents[0].agent).toBe(
        "security-auditor",
      );
    });

    it('uses "unknown" when both missing', () => {
      writeAuditEntries(dojopsDir, [makeAuditEntry({ command: "", action: "test" })]);
      expect(new MetricsAggregator(rootDir).getOverview().mostUsedAgents[0].agent).toBe("unknown");
    });
  });

  describe("aggregation", () => {
    it("counts multiple entries for same agent correctly", () => {
      writeAuditEntries(dojopsDir, [
        makeAuditEntry({ agent: "terraform-specialist" }, 0),
        makeAuditEntry({ agent: "terraform-specialist", durationMs: 200 }, 1),
        makeAuditEntry({ agent: "terraform-specialist", durationMs: 300 }, 2),
      ]);
      expect(new MetricsAggregator(rootDir).getOverview().mostUsedAgents).toEqual([
        { agent: "terraform-specialist", count: 3 },
      ]);
    });

    it("sorts agents by count descending", () => {
      writeAuditEntries(dojopsDir, [
        makeAuditEntry({ command: "g", action: "g", agent: "agent-b" }, 0),
        makeAuditEntry({ command: "g", action: "g", agent: "agent-a" }, 1),
        makeAuditEntry({ command: "g", action: "g", agent: "agent-a" }, 2),
        makeAuditEntry({ command: "g", action: "g", agent: "agent-a" }, 3),
      ]);
      const result = new MetricsAggregator(rootDir).getOverview();
      expect(result.mostUsedAgents[0]).toEqual({ agent: "agent-a", count: 3 });
      expect(result.mostUsedAgents[1]).toEqual({ agent: "agent-b", count: 1 });
    });

    it("limits to top 10", () => {
      const entries = [];
      for (let i = 0; i < 15; i++) {
        entries.push({
          timestamp: `2024-01-01T00:${String(i).padStart(2, "0")}:00Z`,
          user: "test",
          command: `cmd-${i}`,
          action: "test",
          agent: `agent-${i}`,
          status: "success",
          durationMs: 100,
        });
      }
      writeAuditEntries(dojopsDir, entries);

      const agg = new MetricsAggregator(rootDir);
      const result = agg.getOverview();
      expect(result.mostUsedAgents.length).toBeLessThanOrEqual(10);
    });

    it("handles mix of entries with/without agent field", () => {
      writeAuditEntries(dojopsDir, [
        makeAuditEntry({ command: "plan", action: "decompose", agent: "ops-cortex" }, 0),
        makeAuditEntry({ command: "apply", action: "execute", durationMs: 200 }, 1),
      ]);
      const agents = new MetricsAggregator(rootDir)
        .getOverview()
        .mostUsedAgents.map((a) => a.agent);
      expect(agents).toContain("ops-cortex");
      expect(agents).toContain("apply");
    });
  });

  describe("edge cases", () => {
    it('empty command string → "unknown"', () => {
      writeAuditEntries(dojopsDir, [makeAuditEntry({ command: "", action: "test" })]);
      expect(new MetricsAggregator(rootDir).getOverview().mostUsedAgents[0].agent).toBe("unknown");
    });

    it("command with no spaces → uses single word", () => {
      writeAuditEntries(dojopsDir, [makeAuditEntry({ command: "scan", action: "scan" })]);
      expect(new MetricsAggregator(rootDir).getOverview().mostUsedAgents[0].agent).toBe("scan");
    });

    it("agent field as empty string → falls back to command", () => {
      writeAuditEntries(dojopsDir, [makeAuditEntry({ agent: "" })]);
      // Empty string is falsy, so should fall back to command verb
      expect(new MetricsAggregator(rootDir).getOverview().mostUsedAgents[0].agent).toBe("generate");
    });

    it("returns empty array when no audit entries", () => {
      expect(new MetricsAggregator(rootDir).getOverview().mostUsedAgents).toEqual([]);
    });
  });
});
