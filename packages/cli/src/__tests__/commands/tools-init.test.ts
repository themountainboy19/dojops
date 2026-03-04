import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// Mock node:fs
vi.mock("node:fs");

// Mock @clack/prompts
const { mockLog, mockSpinner, mockConfirm, mockText, mockSelect } = vi.hoisted(() => ({
  mockLog: {
    success: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  mockSpinner: {
    start: vi.fn(),
    stop: vi.fn(),
    message: vi.fn(),
  },
  mockConfirm: vi.fn(),
  mockText: vi.fn(),
  mockSelect: vi.fn(),
}));

vi.mock("@clack/prompts", () => ({
  log: mockLog,
  note: vi.fn(),
  spinner: vi.fn(() => mockSpinner),
  isCancel: vi.fn(() => false),
  text: mockText,
  select: mockSelect,
  confirm: mockConfirm,
}));

// Mock @dojops/runtime
vi.mock("@dojops/runtime", () => ({
  parseDopsFile: vi.fn(),
  parseDopsFileAny: vi.fn(),
  parseDopsString: vi.fn(),
  validateDopsModule: vi.fn(),
  validateDopsModuleAny: vi.fn(),
}));

// Mock @dojops/tool-registry
vi.mock("@dojops/tool-registry", () => ({
  discoverTools: vi.fn(() => []),
  discoverUserDopsFiles: vi.fn(() => []),
  validateManifest: vi.fn(),
}));

// Mock @dojops/core
vi.mock("@dojops/core", () => ({
  parseAndValidate: vi.fn(),
}));

// Mock the state module
vi.mock("../../state", () => ({
  findProjectRoot: vi.fn(() => "/mock/project"),
}));

import { toolsInitCommand } from "../../commands/tools";
import { CLIContext } from "../../types";
import { CLIError } from "../../exit-codes";

// ── Helpers ────────────────────────────────────────────────────────

function makeCtx(overrides?: Partial<CLIContext["globalOpts"]>): CLIContext {
  return {
    globalOpts: {
      output: "table",
      nonInteractive: false,
      verbose: false,
      debug: false,
      quiet: false,
      noColor: false,
      raw: false,
      ...overrides,
    },
    config: {},
    cwd: "/tmp",
    getProvider: () => {
      throw new Error("No provider configured");
    },
  };
}

function makeCtxWithProvider(
  mockGenerate: ReturnType<typeof vi.fn>,
  overrides?: Partial<CLIContext["globalOpts"]>,
): CLIContext {
  return {
    ...makeCtx(overrides),
    getProvider: () => ({
      name: "test-provider",
      generate: mockGenerate,
    }),
  };
}

// ── Tests: toolsInitCommand — v2 scaffold (no LLM) ───────────────

describe("toolsInitCommand — v2 scaffold", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
  });

  it("rejects with no name in non-interactive mode", async () => {
    await expect(toolsInitCommand(["--non-interactive"], makeCtx())).rejects.toThrow(CLIError);
    await expect(toolsInitCommand(["--non-interactive"], makeCtx())).rejects.toThrow(
      "Module name required",
    );
  });

  it("rejects invalid module name", async () => {
    await expect(toolsInitCommand(["MyTool", "--non-interactive"], makeCtx())).rejects.toThrow(
      "lowercase alphanumeric",
    );
  });

  it("rejects if module already exists", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    await expect(toolsInitCommand(["my-tool", "--non-interactive"], makeCtx())).rejects.toThrow(
      "Module already exists",
    );
  });

  it("generates v2 .dops file with dops: v2 header", async () => {
    await toolsInitCommand(["my-tool", "--non-interactive"], makeCtx());

    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    const content = String(vi.mocked(fs.writeFileSync).mock.calls[0][1]);
    expect(content).toContain("dops: v2");
    expect(content).not.toContain("dops: v1");
  });

  it("generates v2 file with context block instead of input/output", async () => {
    await toolsInitCommand(["my-tool", "--non-interactive"], makeCtx());

    const content = String(vi.mocked(fs.writeFileSync).mock.calls[0][1]);
    expect(content).toContain("context:");
    expect(content).toContain("technology:");
    expect(content).toContain("fileFormat:");
    expect(content).toContain("outputGuidance:");
    expect(content).toContain("bestPractices:");
    expect(content).not.toContain("input:");
    expect(content).not.toContain("output:");
    expect(content).not.toContain("source: llm");
  });

  it("includes all required v2 sections: Prompt and Keywords", async () => {
    await toolsInitCommand(["redis", "--non-interactive"], makeCtx());

    const content = String(vi.mocked(fs.writeFileSync).mock.calls[0][1]);
    expect(content).toContain("## Prompt");
    expect(content).toContain("## Keywords");
  });

  it("includes v2 prompt variables in the prompt section", async () => {
    await toolsInitCommand(["redis", "--non-interactive"], makeCtx());

    const content = String(vi.mocked(fs.writeFileSync).mock.calls[0][1]);
    expect(content).toContain("{outputGuidance}");
    expect(content).toContain("{bestPractices}");
    expect(content).toContain("{context7Docs}");
    expect(content).toContain("{projectContext}");
  });

  it("includes scope, risk, detection, execution, and update blocks", async () => {
    await toolsInitCommand(["caddy", "--non-interactive"], makeCtx());

    const content = String(vi.mocked(fs.writeFileSync).mock.calls[0][1]);
    expect(content).toContain("scope:");
    expect(content).toContain("risk:");
    expect(content).toContain("detection:");
    expect(content).toContain("execution:");
    expect(content).toContain("update:");
    expect(content).toContain("updateMode: true");
  });

  it("uses tool name to derive technology and file path", async () => {
    await toolsInitCommand(["redis", "--non-interactive"], makeCtx());

    const content = String(vi.mocked(fs.writeFileSync).mock.calls[0][1]);
    expect(content).toContain('technology: "Redis"');
    expect(content).toContain('path: "redis.yaml"');
    expect(content).toContain("redis, redis");
  });

  it("writes to .dojops/modules/<name>.dops", async () => {
    await toolsInitCommand(["my-tool", "--non-interactive"], makeCtx());

    expect(fs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining(path.join(".dojops", "modules")),
      { recursive: true },
    );
    const writtenPath = String(vi.mocked(fs.writeFileSync).mock.calls[0][0]);
    expect(writtenPath).toContain("my-tool.dops");
  });

  it("includes context7Libraries block", async () => {
    await toolsInitCommand(["postgres", "--non-interactive"], makeCtx());

    const content = String(vi.mocked(fs.writeFileSync).mock.calls[0][1]);
    expect(content).toContain("context7Libraries:");
  });

  it("logs success message", async () => {
    await toolsInitCommand(["my-tool", "--non-interactive"], makeCtx());

    expect(mockLog.success).toHaveBeenCalledWith(expect.stringContaining("my-tool.dops"));
  });
});

// ── Tests: toolsInitCommand — --legacy flag ───────────────────────

describe("toolsInitCommand — --legacy flag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
  });

  it("generates v1 format with --legacy flag", async () => {
    await toolsInitCommand(["old-tool", "--legacy", "--non-interactive"], makeCtx());

    // Legacy creates a tool.yaml file
    expect(fs.writeFileSync).toHaveBeenCalled();
    const writtenPath = String(vi.mocked(fs.writeFileSync).mock.calls[0][0]);
    expect(writtenPath).toContain("tool.yaml");
  });

  it("creates tool.yaml and input.schema.json for legacy", async () => {
    await toolsInitCommand(["old-tool", "--legacy", "--non-interactive"], makeCtx());

    // Should write 2 files: tool.yaml + input.schema.json
    expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
    const paths = vi.mocked(fs.writeFileSync).mock.calls.map((c) => String(c[0]));
    expect(paths.some((p) => p.includes("tool.yaml"))).toBe(true);
    expect(paths.some((p) => p.includes("input.schema.json"))).toBe(true);
  });
});

// ── Tests: toolsInitCommand — LLM-powered generation ──────────────

describe("toolsInitCommand — LLM-powered generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
  });

  it("uses LLM-generated content when provider responds successfully", async () => {
    const mockLLMResponse = {
      outputGuidance: "Generate a valid Redis configuration file. Output raw config directly.",
      bestPractices: [
        "Set maxmemory to prevent OOM",
        "Use requirepass for authentication",
        "Configure save intervals for persistence",
        "Set timeout to close idle connections",
        "Disable dangerous commands in production",
      ],
      context7Libraries: [{ name: "redis", query: "Redis configuration directives and syntax" }],
      prompt:
        "You are a Redis expert. Generate production-ready Redis configuration.\n\n{outputGuidance}\n\nFollow these best practices:\n{bestPractices}\n\n{context7Docs}\n\nProject context: {projectContext}",
      keywords: ["redis", "cache", "in-memory", "key-value", "database", "session", "pub-sub"],
      scopePatterns: ["redis.conf", "redis/*.conf"],
      riskLevel: "MEDIUM" as const,
      riskRationale: "Redis configuration changes affect data persistence and access control",
      detectionPaths: ["redis.conf", "redis/*.conf"],
      structuralRules: [],
    };

    const mockGenerate = vi.fn().mockResolvedValue({
      content: JSON.stringify(mockLLMResponse),
      parsed: mockLLMResponse,
    });

    // Set up interactive wizard responses
    mockText.mockResolvedValueOnce("redis"); // name
    mockText.mockResolvedValueOnce("Redis configuration generator"); // description
    mockText.mockResolvedValueOnce("Redis"); // technology
    mockSelect.mockResolvedValueOnce("raw"); // fileFormat
    mockText.mockResolvedValueOnce("redis.conf"); // outputFilePath
    mockConfirm.mockResolvedValueOnce(true); // useLLM

    const ctx = makeCtxWithProvider(mockGenerate);
    await toolsInitCommand([], ctx);

    // Provider should have been called
    expect(mockGenerate).toHaveBeenCalledTimes(1);

    // Verify generated content is in the output
    const content = String(vi.mocked(fs.writeFileSync).mock.calls[0][1]);
    expect(content).toContain("dops: v2");
    expect(content).toContain("Set maxmemory to prevent OOM");
    expect(content).toContain("MEDIUM");
    expect(content).toContain("redis, cache, in-memory");
    expect(content).toContain("{outputGuidance}");
    expect(content).toContain("{bestPractices}");
    expect(content).toContain("{context7Docs}");
    expect(content).toContain("{projectContext}");
  });

  it("falls back to defaults when LLM generation fails", async () => {
    const mockGenerate = vi.fn().mockRejectedValue(new Error("API error"));

    // Set up interactive wizard responses
    mockText.mockResolvedValueOnce("caddy"); // name
    mockText.mockResolvedValueOnce("Caddy web server config"); // description
    mockText.mockResolvedValueOnce("Caddy"); // technology
    mockSelect.mockResolvedValueOnce("raw"); // fileFormat
    mockText.mockResolvedValueOnce("Caddyfile"); // outputFilePath
    mockConfirm.mockResolvedValueOnce(true); // useLLM

    const ctx = makeCtxWithProvider(mockGenerate);
    await toolsInitCommand([], ctx);

    // Should still write a valid v2 file with defaults
    const content = String(vi.mocked(fs.writeFileSync).mock.calls[0][1]);
    expect(content).toContain("dops: v2");
    expect(content).toContain('technology: "Caddy"');
    expect(content).toContain("Follow official Caddy documentation conventions");

    // Should have warned about failure
    expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining("API error"));
  });

  it("does not call LLM when user declines AI generation", async () => {
    const mockGenerate = vi.fn();

    // Set up interactive wizard responses
    mockText.mockResolvedValueOnce("my-tool"); // name
    mockText.mockResolvedValueOnce("My tool description"); // description
    mockText.mockResolvedValueOnce("MyTool"); // technology
    mockSelect.mockResolvedValueOnce("yaml"); // fileFormat
    mockText.mockResolvedValueOnce("my-tool.yaml"); // outputFilePath
    mockConfirm.mockResolvedValueOnce(false); // useLLM = no

    const ctx = makeCtxWithProvider(mockGenerate);
    await toolsInitCommand([], ctx);

    expect(mockGenerate).not.toHaveBeenCalled();

    // Should still produce a valid v2 file
    const content = String(vi.mocked(fs.writeFileSync).mock.calls[0][1]);
    expect(content).toContain("dops: v2");
  });

  it("does not offer LLM when no provider is available", async () => {
    // Set up interactive wizard responses
    mockText.mockResolvedValueOnce("my-tool"); // name
    mockText.mockResolvedValueOnce("desc"); // description
    mockText.mockResolvedValueOnce("MyTool"); // technology
    mockSelect.mockResolvedValueOnce("yaml"); // fileFormat
    mockText.mockResolvedValueOnce("my-tool.yaml"); // outputFilePath
    // confirm should NOT be called — no provider

    const ctx = makeCtx(); // no provider
    await toolsInitCommand([], ctx);

    // confirm should not have been called
    expect(mockConfirm).not.toHaveBeenCalled();

    // Should still produce v2 file
    const content = String(vi.mocked(fs.writeFileSync).mock.calls[0][1]);
    expect(content).toContain("dops: v2");
  });

  it("passes schema to provider.generate()", async () => {
    const mockLLMResponse = {
      outputGuidance: "Generate config.",
      bestPractices: ["Practice 1", "Practice 2", "Practice 3"],
      context7Libraries: [],
      prompt: "{outputGuidance}\n{bestPractices}\n{context7Docs}\n{projectContext}",
      keywords: ["test", "config", "tool"],
      scopePatterns: ["*.yaml"],
      riskLevel: "LOW" as const,
      riskRationale: "Read-only config",
      detectionPaths: ["test.yaml"],
      structuralRules: [],
    };

    const mockGenerate = vi.fn().mockResolvedValue({
      content: JSON.stringify(mockLLMResponse),
      parsed: mockLLMResponse,
    });

    // Set up interactive wizard responses
    mockText.mockResolvedValueOnce("test-tool");
    mockText.mockResolvedValueOnce("Test tool");
    mockText.mockResolvedValueOnce("TestTool");
    mockSelect.mockResolvedValueOnce("yaml");
    mockText.mockResolvedValueOnce("test.yaml");
    mockConfirm.mockResolvedValueOnce(true);

    const ctx = makeCtxWithProvider(mockGenerate);
    await toolsInitCommand([], ctx);

    const call = mockGenerate.mock.calls[0][0];
    expect(call.system).toContain("DevOps module designer");
    expect(call.schema).toBeDefined();
  });

  it("includes LLM-generated structural rules in verification block", async () => {
    const mockLLMResponse = {
      outputGuidance: "Generate YAML config.",
      bestPractices: ["Practice 1", "Practice 2", "Practice 3"],
      context7Libraries: [],
      prompt: "{outputGuidance}\n{bestPractices}\n{context7Docs}\n{projectContext}",
      keywords: ["test", "config", "yaml"],
      scopePatterns: ["*.yaml"],
      riskLevel: "LOW" as const,
      riskRationale: "Config file",
      detectionPaths: ["config.yaml"],
      structuralRules: [{ path: "version", required: true, message: "Version field is required" }],
    };

    const mockGenerate = vi.fn().mockResolvedValue({
      content: JSON.stringify(mockLLMResponse),
      parsed: mockLLMResponse,
    });

    mockText.mockResolvedValueOnce("yaml-tool");
    mockText.mockResolvedValueOnce("YAML config");
    mockText.mockResolvedValueOnce("YAML");
    mockSelect.mockResolvedValueOnce("yaml");
    mockText.mockResolvedValueOnce("config.yaml");
    mockConfirm.mockResolvedValueOnce(true);

    const ctx = makeCtxWithProvider(mockGenerate);
    await toolsInitCommand([], ctx);

    const content = String(vi.mocked(fs.writeFileSync).mock.calls[0][1]);
    expect(content).toContain("verification:");
    expect(content).toContain("structural:");
    expect(content).toContain("Version field is required");
  });
});

// ── Tests: toolsInitCommand — non-interactive v2 defaults ─────────

describe("toolsInitCommand — non-interactive defaults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
  });

  it("produces valid v2 structure with just a name", async () => {
    await toolsInitCommand(["nginx-custom", "--non-interactive"], makeCtx());

    const content = String(vi.mocked(fs.writeFileSync).mock.calls[0][1]);

    // Must have frontmatter delimiters
    const parts = content.split("---");
    expect(parts.length).toBeGreaterThanOrEqual(3);

    // Must have v2 marker
    expect(content).toContain("dops: v2");
    expect(content).toContain("kind: tool");

    // Must have meta
    expect(content).toContain("name: nginx-custom");
    expect(content).toContain("version: 0.1.0");

    // Must have context block
    expect(content).toContain("context:");
    expect(content).toContain("technology:");
    expect(content).toContain("fileFormat: yaml");

    // Must have files, detection, permissions, scope, risk, execution, update
    expect(content).toContain("files:");
    expect(content).toContain("detection:");
    expect(content).toContain("permissions:");
    expect(content).toContain("scope:");
    expect(content).toContain("risk:");
    expect(content).toContain("execution:");
    expect(content).toContain("update:");

    // Must have markdown sections
    expect(content).toContain("## Prompt");
    expect(content).toContain("## Keywords");

    // Must have v2 template variables
    expect(content).toContain("{outputGuidance}");
    expect(content).toContain("{bestPractices}");
    expect(content).toContain("{context7Docs}");
    expect(content).toContain("{projectContext}");
  });

  it("auto-capitalizes technology from tool name", async () => {
    await toolsInitCommand(["redis", "--non-interactive"], makeCtx());

    const content = String(vi.mocked(fs.writeFileSync).mock.calls[0][1]);
    expect(content).toContain('technology: "Redis"');
  });

  it("defaults file format to yaml", async () => {
    await toolsInitCommand(["my-tool", "--non-interactive"], makeCtx());

    const content = String(vi.mocked(fs.writeFileSync).mock.calls[0][1]);
    expect(content).toContain("fileFormat: yaml");
    expect(content).toContain('path: "my-tool.yaml"');
  });

  it("defaults risk level to LOW", async () => {
    await toolsInitCommand(["my-tool", "--non-interactive"], makeCtx());

    const content = String(vi.mocked(fs.writeFileSync).mock.calls[0][1]);
    expect(content).toContain("level: LOW");
  });
});
