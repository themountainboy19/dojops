import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as yaml from "js-yaml";
import { discoverPlugins } from "../plugin-loader";

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
      systemPrompt: "Generate config.",
    },
    files: [{ path: "output.yaml", serializer: "yaml" }],
    ...overrides,
  };

  fs.writeFileSync(path.join(pluginDir, "plugin.yaml"), yaml.dump(manifest), "utf-8");

  const inputSchema = {
    type: "object",
    properties: {
      name: { type: "string" },
    },
    required: ["name"],
  };

  fs.writeFileSync(
    path.join(pluginDir, "input.schema.json"),
    JSON.stringify(inputSchema, null, 2),
    "utf-8",
  );

  return pluginDir;
}

describe("discoverPlugins", () => {
  let tmpDir: string;
  let projectDir: string;
  let origHome: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dojops-plugin-test-"));
    projectDir = path.join(tmpDir, "project");
    fs.mkdirSync(projectDir, { recursive: true });
    origHome = process.env.HOME;
    process.env.HOME = tmpDir;
  });

  afterEach(() => {
    process.env.HOME = origHome;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty array when no plugins exist", () => {
    const plugins = discoverPlugins(projectDir);
    expect(plugins).toEqual([]);
  });

  it("discovers global plugins", () => {
    const globalPluginsDir = path.join(tmpDir, ".dojops", "plugins");
    fs.mkdirSync(globalPluginsDir, { recursive: true });
    createTestPlugin(globalPluginsDir, "global-tool");

    const plugins = discoverPlugins(projectDir);
    expect(plugins).toHaveLength(1);
    expect(plugins[0].manifest.name).toBe("global-tool");
    expect(plugins[0].source.location).toBe("global");
  });

  it("discovers project plugins", () => {
    const projectPluginsDir = path.join(projectDir, ".dojops", "plugins");
    fs.mkdirSync(projectPluginsDir, { recursive: true });
    createTestPlugin(projectPluginsDir, "project-tool");

    const plugins = discoverPlugins(projectDir);
    expect(plugins).toHaveLength(1);
    expect(plugins[0].manifest.name).toBe("project-tool");
    expect(plugins[0].source.location).toBe("project");
  });

  it("project plugins override global plugins with same name", () => {
    const globalPluginsDir = path.join(tmpDir, ".dojops", "plugins");
    fs.mkdirSync(globalPluginsDir, { recursive: true });
    createTestPlugin(globalPluginsDir, "shared-tool", { version: "1.0.0" });

    const projectPluginsDir = path.join(projectDir, ".dojops", "plugins");
    fs.mkdirSync(projectPluginsDir, { recursive: true });
    createTestPlugin(projectPluginsDir, "shared-tool", { version: "2.0.0" });

    const plugins = discoverPlugins(projectDir);
    expect(plugins).toHaveLength(1);
    expect(plugins[0].manifest.name).toBe("shared-tool");
    expect(plugins[0].manifest.version).toBe("2.0.0");
    expect(plugins[0].source.location).toBe("project");
  });

  it("discovers both global and project plugins with different names", () => {
    const globalPluginsDir = path.join(tmpDir, ".dojops", "plugins");
    fs.mkdirSync(globalPluginsDir, { recursive: true });
    createTestPlugin(globalPluginsDir, "tool-a");

    const projectPluginsDir = path.join(projectDir, ".dojops", "plugins");
    fs.mkdirSync(projectPluginsDir, { recursive: true });
    createTestPlugin(projectPluginsDir, "tool-b");

    const plugins = discoverPlugins(projectDir);
    expect(plugins).toHaveLength(2);
    const names = plugins.map((p) => p.manifest.name).sort();
    expect(names).toEqual(["tool-a", "tool-b"]);
  });

  it("skips directories without plugin.yaml", () => {
    const globalPluginsDir = path.join(tmpDir, ".dojops", "plugins");
    fs.mkdirSync(path.join(globalPluginsDir, "empty-dir"), { recursive: true });

    const plugins = discoverPlugins(projectDir);
    expect(plugins).toHaveLength(0);
  });

  it("skips invalid manifests", () => {
    const globalPluginsDir = path.join(tmpDir, ".dojops", "plugins");
    const invalidDir = path.join(globalPluginsDir, "bad-plugin");
    fs.mkdirSync(invalidDir, { recursive: true });
    fs.writeFileSync(path.join(invalidDir, "plugin.yaml"), "this is not valid yaml: [", "utf-8");

    const plugins = discoverPlugins(projectDir);
    expect(plugins).toHaveLength(0);
  });

  it("skips plugins with missing input schema file", () => {
    const globalPluginsDir = path.join(tmpDir, ".dojops", "plugins");
    const pluginDir = path.join(globalPluginsDir, "no-schema");
    fs.mkdirSync(pluginDir, { recursive: true });

    const manifest = {
      spec: 1,
      name: "no-schema",
      version: "1.0.0",
      type: "tool",
      description: "Missing schema",
      inputSchema: "input.schema.json",
      generator: { strategy: "llm", systemPrompt: "test" },
      files: [{ path: "out.yaml", serializer: "yaml" }],
    };
    fs.writeFileSync(path.join(pluginDir, "plugin.yaml"), yaml.dump(manifest), "utf-8");
    // Intentionally do NOT create input.schema.json

    const plugins = discoverPlugins(projectDir);
    expect(plugins).toHaveLength(0);
  });

  it("computes plugin hash", () => {
    const globalPluginsDir = path.join(tmpDir, ".dojops", "plugins");
    fs.mkdirSync(globalPluginsDir, { recursive: true });
    createTestPlugin(globalPluginsDir, "hash-tool");

    const plugins = discoverPlugins(projectDir);
    expect(plugins[0].source.pluginHash).toBeDefined();
    expect(plugins[0].source.pluginHash!.length).toBe(64); // SHA-256 hex
  });

  it("works without projectPath", () => {
    const globalPluginsDir = path.join(tmpDir, ".dojops", "plugins");
    fs.mkdirSync(globalPluginsDir, { recursive: true });
    createTestPlugin(globalPluginsDir, "global-only");

    const plugins = discoverPlugins(); // no project path
    expect(plugins).toHaveLength(1);
    expect(plugins[0].manifest.name).toBe("global-only");
  });
});
