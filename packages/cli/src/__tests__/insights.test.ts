import { describe, it, expect, vi, beforeEach } from "vitest";
import { analyzeHistory } from "../commands/insights";

vi.mock("../state", () => ({
  findProjectRoot: vi.fn(() => "/tmp/test"),
  initProject: vi.fn(),
  readAudit: vi.fn(() => []),
  listScanReports: vi.fn(() => []),
  listExecutions: vi.fn(() => []),
  dojopsDir: vi.fn((root: string) => `${root}/.dojops`),
}));

vi.mock("../token-store", () => ({
  readTokenUsage: vi.fn(() => []),
}));

import { readAudit, listScanReports } from "../state";
import { readTokenUsage } from "../token-store";

describe("analyzeHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty insights when no history", () => {
    const insights = analyzeHistory("/tmp/test");
    expect(insights).toEqual([]);
  });

  it("detects scan without --fix pattern", () => {
    vi.mocked(readAudit).mockReturnValue(
      Array.from({ length: 6 }, (_, i) => ({
        timestamp: `2026-03-12T${String(i).padStart(2, "0")}:00:00Z`,
        user: "test",
        command: "scan",
        action: "scan",
        status: "success",
      })),
    );

    const insights = analyzeHistory("/tmp/test");
    const scanInsight = insights.find(
      (i) => i.message.includes("scan") && i.message.includes("--fix"),
    );
    expect(scanInsight).toBeDefined();
    expect(scanInsight!.category).toBe("efficiency");
  });

  it("detects high failure rate", () => {
    const entries = [
      ...Array.from({ length: 7 }, () => ({
        timestamp: "2026-03-12T00:00:00Z",
        user: "test",
        command: "generate",
        action: "generate",
        status: "failure",
      })),
      ...Array.from({ length: 3 }, () => ({
        timestamp: "2026-03-12T00:00:00Z",
        user: "test",
        command: "generate",
        action: "generate",
        status: "success",
      })),
    ];
    vi.mocked(readAudit).mockReturnValue(entries);

    const insights = analyzeHistory("/tmp/test");
    const failInsight = insights.find((i) => i.message.includes("failed"));
    expect(failInsight).toBeDefined();
    expect(failInsight!.category).toBe("quality");
  });

  it("detects persistent critical scan findings", () => {
    vi.mocked(listScanReports).mockReturnValue([
      { id: "1", summary: { total: 5, critical: 2, high: 1, medium: 1, low: 1 } },
      { id: "2", summary: { total: 4, critical: 1, high: 1, medium: 1, low: 1 } },
      { id: "3", summary: { total: 6, critical: 3, high: 1, medium: 1, low: 1 } },
    ] as Array<Record<string, unknown>>);

    const insights = analyzeHistory("/tmp/test");
    const secInsight = insights.find((i) => i.message.includes("Critical findings persist"));
    expect(secInsight).toBeDefined();
    expect(secInsight!.category).toBe("security");
  });

  it("detects single provider usage", () => {
    vi.mocked(readTokenUsage).mockReturnValue(
      Array.from({ length: 15 }, (_, i) => ({
        timestamp: `2026-03-12T${String(i).padStart(2, "0")}:00:00.000Z`,
        command: "generate",
        provider: "openai",
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      })),
    );

    const insights = analyzeHistory("/tmp/test");
    const costInsight = insights.find((i) => i.message.includes("No fallback"));
    expect(costInsight).toBeDefined();
    expect(costInsight!.category).toBe("cost");
  });
});
