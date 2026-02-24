import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as yaml from "js-yaml";
import { discoverPlugins } from "../plugin-loader";
import { PluginTool } from "../plugin-tool";
import { ToolRegistry } from "../registry";
import { PluginManifest, PluginSource } from "../types";
import { LLMProvider } from "@dojops/core";

function createTestPlugin(dir: string, name: string, overrides?: Record<string, unknown>) {
  const pluginDir = path.join(dir, name);
  fs.mkdirSync(pluginDir, { recursive: true });

  const manifest = {
    spec: 1,
    name,
    version: "1.0.0",
    type: "tool",
    description: `Test ${name} plugin`,
    inputSchema: "input.schema.json",
    generator: {
      strategy: "llm",
      systemPrompt: "Generate config for testing.",
    },
    files: [{ path: "output.yaml", serializer: "yaml" }],
    ...overrides,
  };

  fs.writeFileSync(path.join(pluginDir, "plugin.yaml"), yaml.dump(manifest), "utf-8");

  const inputSchema = {
    type: "object",
    properties: { name: { type: "string" } },
    required: ["name"],
  };

  fs.writeFileSync(
    path.join(pluginDir, "input.schema.json"),
    JSON.stringify(inputSchema, null, 2),
    "utf-8",
  );

  return pluginDir;
}

function createMockProvider(): LLMProvider {
  return {
    name: "mock",
    generate: vi.fn(async () => ({ content: "{}" })),
  };
}

describe("Plugin hash changes on manifest modification", () => {
  let tmpDir: string;
  let projectDir: string;
  let origHome: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dojops-upgrade-test-"));
    projectDir = path.join(tmpDir, "project");
    fs.mkdirSync(projectDir, { recursive: true });
    origHome = process.env.HOME;
    process.env.HOME = tmpDir;
  });

  afterEach(() => {
    process.env.HOME = origHome;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("hash changes when systemPrompt is modified", () => {
    const globalPluginsDir = path.join(tmpDir, ".dojops", "plugins");
    fs.mkdirSync(globalPluginsDir, { recursive: true });
    createTestPlugin(globalPluginsDir, "hash-test");

    const before = discoverPlugins(projectDir);
    const hashBefore = before[0].source.pluginHash;

    // Modify the systemPrompt in the manifest
    const manifestPath = path.join(globalPluginsDir, "hash-test", "plugin.yaml");
    const content = fs.readFileSync(manifestPath, "utf-8");
    const manifest = yaml.load(content) as Record<string, unknown>;
    (manifest.generator as Record<string, unknown>).systemPrompt = "Modified prompt.";
    fs.writeFileSync(manifestPath, yaml.dump(manifest), "utf-8");

    const after = discoverPlugins(projectDir);
    const hashAfter = after[0].source.pluginHash;

    expect(hashBefore).not.toBe(hashAfter);
  });

  it("hash changes when version is bumped", () => {
    const globalPluginsDir = path.join(tmpDir, ".dojops", "plugins");
    fs.mkdirSync(globalPluginsDir, { recursive: true });
    createTestPlugin(globalPluginsDir, "version-test");

    const before = discoverPlugins(projectDir);
    const hashBefore = before[0].source.pluginHash;

    // Bump version
    const manifestPath = path.join(globalPluginsDir, "version-test", "plugin.yaml");
    const content = fs.readFileSync(manifestPath, "utf-8");
    const manifest = yaml.load(content) as Record<string, unknown>;
    manifest.version = "2.0.0";
    fs.writeFileSync(manifestPath, yaml.dump(manifest), "utf-8");

    const after = discoverPlugins(projectDir);
    const hashAfter = after[0].source.pluginHash;

    expect(hashBefore).not.toBe(hashAfter);
  });

  it("hash is stable when nothing changes", () => {
    const globalPluginsDir = path.join(tmpDir, ".dojops", "plugins");
    fs.mkdirSync(globalPluginsDir, { recursive: true });
    createTestPlugin(globalPluginsDir, "stable-test");

    const first = discoverPlugins(projectDir);
    const second = discoverPlugins(projectDir);

    expect(first[0].source.pluginHash).toBe(second[0].source.pluginHash);
  });

  it("hash only covers plugin.yaml (modifying input.schema.json does not change hash)", () => {
    const globalPluginsDir = path.join(tmpDir, ".dojops", "plugins");
    fs.mkdirSync(globalPluginsDir, { recursive: true });
    createTestPlugin(globalPluginsDir, "schema-test");

    const before = discoverPlugins(projectDir);
    const hashBefore = before[0].source.pluginHash;

    // Modify input.schema.json
    const schemaPath = path.join(globalPluginsDir, "schema-test", "input.schema.json");
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
    schema.properties.extra = { type: "number" };
    fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2), "utf-8");

    const after = discoverPlugins(projectDir);
    const hashAfter = after[0].source.pluginHash;

    expect(hashBefore).toBe(hashAfter);
  });
});

describe("Plugin upgrade simulation", () => {
  let tmpDir: string;
  let projectDir: string;
  let origHome: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dojops-upgrade-sim-"));
    projectDir = path.join(tmpDir, "project");
    fs.mkdirSync(projectDir, { recursive: true });
    origHome = process.env.HOME;
    process.env.HOME = tmpDir;
  });

  afterEach(() => {
    process.env.HOME = origHome;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("detects hash mismatch between saved plan hash and current plugin hash", () => {
    const globalPluginsDir = path.join(tmpDir, ".dojops", "plugins");
    fs.mkdirSync(globalPluginsDir, { recursive: true });
    createTestPlugin(globalPluginsDir, "upgrade-tool");

    const before = discoverPlugins(projectDir);
    const savedHash = before[0].source.pluginHash;

    // Simulate upgrade: modify manifest
    const manifestPath = path.join(globalPluginsDir, "upgrade-tool", "plugin.yaml");
    const content = fs.readFileSync(manifestPath, "utf-8");
    const manifest = yaml.load(content) as Record<string, unknown>;
    manifest.version = "2.0.0";
    (manifest.generator as Record<string, unknown>).systemPrompt = "Upgraded system prompt.";
    fs.writeFileSync(manifestPath, yaml.dump(manifest), "utf-8");

    const after = discoverPlugins(projectDir);
    const currentHash = after[0].source.pluginHash;

    expect(savedHash).not.toBe(currentHash);
    expect(after[0].manifest.version).toBe("2.0.0");
  });

  it("detects missing plugin when plugin directory is deleted", () => {
    const globalPluginsDir = path.join(tmpDir, ".dojops", "plugins");
    fs.mkdirSync(globalPluginsDir, { recursive: true });
    createTestPlugin(globalPluginsDir, "removed-tool");

    const before = discoverPlugins(projectDir);
    expect(before).toHaveLength(1);

    // Remove the plugin
    fs.rmSync(path.join(globalPluginsDir, "removed-tool"), { recursive: true, force: true });

    const after = discoverPlugins(projectDir);
    expect(after).toHaveLength(0);
  });

  it("detects systemPromptHash mismatch between two PluginTool instances", () => {
    const provider = createMockProvider();

    const manifestV1: PluginManifest = {
      spec: 1,
      name: "prompt-tool",
      version: "1.0.0",
      type: "tool",
      description: "Test",
      inputSchema: "input.schema.json",
      generator: { strategy: "llm", systemPrompt: "Original prompt." },
      files: [{ path: "out.yaml", serializer: "yaml" }],
    };

    const manifestV2: PluginManifest = {
      ...manifestV1,
      version: "2.0.0",
      generator: { strategy: "llm", systemPrompt: "Changed prompt." },
    };

    const source: PluginSource = {
      type: "plugin",
      location: "project",
      pluginVersion: "1.0.0",
      pluginHash: "abc123",
    };

    const inputSchema = {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    };

    const toolV1 = new PluginTool(manifestV1, provider, "/tmp", source, inputSchema);
    const toolV2 = new PluginTool(
      manifestV2,
      provider,
      "/tmp",
      { ...source, pluginVersion: "2.0.0" },
      inputSchema,
    );

    expect(toolV1.systemPromptHash).not.toBe(toolV2.systemPromptHash);
    expect(toolV1.systemPromptHash.length).toBe(64);
    expect(toolV2.systemPromptHash.length).toBe(64);
  });

  it("version string change is visible in PluginSource after re-discovery", () => {
    const globalPluginsDir = path.join(tmpDir, ".dojops", "plugins");
    fs.mkdirSync(globalPluginsDir, { recursive: true });
    createTestPlugin(globalPluginsDir, "versioned-tool", { version: "1.0.0" });

    const before = discoverPlugins(projectDir);
    expect(before[0].source.pluginVersion).toBe("1.0.0");

    // Bump version
    const manifestPath = path.join(globalPluginsDir, "versioned-tool", "plugin.yaml");
    const content = fs.readFileSync(manifestPath, "utf-8");
    const manifest = yaml.load(content) as Record<string, unknown>;
    manifest.version = "1.1.0";
    fs.writeFileSync(manifestPath, yaml.dump(manifest), "utf-8");

    const after = discoverPlugins(projectDir);
    expect(after[0].source.pluginVersion).toBe("1.1.0");
  });
});

describe("ToolRegistry metadata integration", () => {
  it("getToolMetadata returns systemPromptHash for plugin tools", () => {
    const provider = createMockProvider();

    const manifest: PluginManifest = {
      spec: 1,
      name: "meta-tool",
      version: "1.0.0",
      type: "tool",
      description: "Test",
      inputSchema: "input.schema.json",
      generator: { strategy: "llm", systemPrompt: "Test prompt for metadata." },
      files: [{ path: "out.yaml", serializer: "yaml" }],
    };

    const source: PluginSource = {
      type: "plugin",
      location: "project",
      pluginVersion: "1.0.0",
      pluginHash: "deadbeef",
    };

    const inputSchema = {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    };

    const pluginTool = new PluginTool(manifest, provider, "/tmp", source, inputSchema);
    const registry = new ToolRegistry([], [pluginTool]);

    const metadata = registry.getToolMetadata("meta-tool");
    expect(metadata).toBeDefined();
    expect(metadata!.toolType).toBe("plugin");
    expect(metadata!.systemPromptHash).toBe(pluginTool.systemPromptHash);
    expect(metadata!.pluginVersion).toBe("1.0.0");
    expect(metadata!.pluginHash).toBe("deadbeef");
  });

  it("getToolMetadata returns built-in type without systemPromptHash", () => {
    const registry = new ToolRegistry(
      [
        {
          name: "terraform",
          description: "Terraform tool",
          inputSchema: {} as never,
          validate: () => ({ valid: true }),
          generate: async () => ({ success: true, data: {} }),
        },
      ],
      [],
    );

    const metadata = registry.getToolMetadata("terraform");
    expect(metadata).toBeDefined();
    expect(metadata!.toolType).toBe("built-in");
    expect(metadata!.systemPromptHash).toBeUndefined();
  });

  it("getToolMetadata returns undefined for unknown tool", () => {
    const registry = new ToolRegistry([], []);
    expect(registry.getToolMetadata("nonexistent")).toBeUndefined();
  });
});
