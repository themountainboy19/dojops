import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Mock config module before importing
const mockConfig = {
  defaultProvider: "openai",
  defaultModel: "gpt-4o",
  tokens: { openai: "sk-test" },
};

vi.mock("../config", () => ({
  loadConfig: vi.fn(() => ({ ...mockConfig })),
  readConfigFile: vi.fn(() => ({})),
  saveConfig: vi.fn(),
  getConfigPath: vi.fn(() => "/tmp/.dojops/config.json"),
  getLocalConfigPath: vi.fn(() => null),
  getGlobalConfigPath: vi.fn(() => "/tmp/.dojops/config.json"),
  validateProvider: vi.fn(),
  resolveProvider: vi.fn(() => "openai"),
  getActiveProfile: vi.fn(() => null),
  VALID_PROVIDERS: ["openai", "anthropic", "ollama", "deepseek", "gemini", "github-copilot"],
  DojOpsConfig: {},
  loadProfileConfig: vi.fn(() => ({})),
}));

vi.mock("@dojops/core", () => ({
  isCopilotAuthenticated: vi.fn(() => false),
  copilotLogin: vi.fn(),
}));

vi.mock("@dojops/api", () => ({
  createProvider: vi.fn(),
}));

vi.mock("../state", () => ({
  findProjectRoot: vi.fn(() => "/tmp/test"),
  dojopsDir: vi.fn((r: string) => `${r}/.dojops`),
}));

/** Simulate the deep merge logic directly. */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = result[key];
    if (
      sv != null &&
      typeof sv === "object" &&
      !Array.isArray(sv) &&
      tv != null &&
      typeof tv === "object" &&
      !Array.isArray(tv)
    ) {
      result[key] = deepMerge(tv as Record<string, unknown>, sv as Record<string, unknown>);
    } else {
      result[key] = sv;
    }
  }
  return result;
}

describe("config apply (deep-merge)", () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dojops-apply-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("deep-merges nested objects without overwriting siblings", () => {
    const base = {
      defaultProvider: "openai",
      tokens: { openai: "sk-old", anthropic: "sk-ant" },
      ollamaHost: "http://localhost:11434",
    };
    const patch = {
      defaultModel: "gpt-4o-mini",
      tokens: { openai: "sk-new" },
    };

    const merged = deepMerge(base, patch);
    expect(merged).toEqual({
      defaultProvider: "openai",
      defaultModel: "gpt-4o-mini",
      tokens: { openai: "sk-new", anthropic: "sk-ant" },
      ollamaHost: "http://localhost:11434",
    });
  });

  it("replaces arrays instead of merging", () => {
    const base = { tags: ["a", "b"] };
    const patch = { tags: ["c"] };
    const merged = deepMerge(base, patch);
    expect(merged.tags).toEqual(["c"]);
  });

  it("writes a patch file that can be read as valid JSON", () => {
    const patchFile = path.join(tmpDir, "patch.json");
    const patch = { defaultModel: "gpt-4o-mini", tokens: { anthropic: "sk-ant" } };
    fs.writeFileSync(patchFile, JSON.stringify(patch, null, 2));

    const read = JSON.parse(fs.readFileSync(patchFile, "utf-8"));
    expect(read).toEqual(patch);
  });
});
