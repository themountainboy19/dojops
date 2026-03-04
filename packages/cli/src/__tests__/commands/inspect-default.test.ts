import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @clack/prompts
const { mockNote, mockLog } = vi.hoisted(() => ({
  mockNote: vi.fn(),
  mockLog: {
    success: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@clack/prompts", () => ({
  log: mockLog,
  note: mockNote,
}));

// Mock state
vi.mock("../../state", () => ({
  findProjectRoot: vi.fn(() => "/mock/project"),
  loadSession: vi.fn(() => ({
    mode: "IDLE",
    currentPlan: null,
    lastAgent: null,
    riskLevel: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
  })),
}));

// Mock config
vi.mock("../../config", () => ({
  getConfigPath: vi.fn(() => "/mock/.dojops/config.json"),
  resolveProvider: vi.fn(() => "openai"),
}));

// Mock formatter
vi.mock("../../formatter", () => ({
  maskToken: vi.fn((t: string | undefined) => (t ? "***" : "(not set)")),
}));

import { inspectCommand } from "../../commands/inspect";
import type { CLIContext } from "../../types";
import { CLIError } from "../../exit-codes";

function makeCtx(output = "table"): CLIContext {
  return {
    globalOpts: {
      output,
      nonInteractive: false,
      verbose: false,
      debug: false,
      quiet: false,
      noColor: false,
      raw: false,
    },
    config: { tokens: { openai: "sk-test" } },
    cwd: "/tmp",
    getProvider: () => {
      throw new Error("No provider");
    },
  };
}

describe("inspect — default behavior (no target)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows both config and session when no target is specified", async () => {
    await inspectCommand([], makeCtx());

    // Should call note() twice — once for config, once for session
    expect(mockNote).toHaveBeenCalledTimes(2);
    expect(mockNote).toHaveBeenCalledWith(expect.any(String), "Resolved Configuration");
    expect(mockNote).toHaveBeenCalledWith(expect.any(String), "Session State");
  });

  it("does not throw when no target is specified", async () => {
    await expect(inspectCommand([], makeCtx())).resolves.toBeUndefined();
  });

  it("still throws for unknown targets", async () => {
    await expect(inspectCommand(["invalid"], makeCtx())).rejects.toThrow(CLIError);
    await expect(inspectCommand(["invalid"], makeCtx())).rejects.toThrow("Unknown inspect target");
  });

  it("still works with explicit config target", async () => {
    await inspectCommand(["config"], makeCtx());
    expect(mockNote).toHaveBeenCalledTimes(1);
    expect(mockNote).toHaveBeenCalledWith(expect.any(String), "Resolved Configuration");
  });

  it("still works with explicit session target", async () => {
    await inspectCommand(["session"], makeCtx());
    expect(mockNote).toHaveBeenCalledTimes(1);
    expect(mockNote).toHaveBeenCalledWith(expect.any(String), "Session State");
  });
});
