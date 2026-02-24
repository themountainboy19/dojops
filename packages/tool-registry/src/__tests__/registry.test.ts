import { describe, it, expect, vi } from "vitest";
import { ToolRegistry } from "../registry";
import { PluginTool } from "../plugin-tool";
import { DevOpsTool } from "@dojops/sdk";
import { z } from "zod";

function createMockTool(name: string, description = "desc"): DevOpsTool {
  return {
    name,
    description,
    inputSchema: z.object({ input: z.string() }),
    validate: vi.fn().mockReturnValue({ valid: true }),
    generate: vi.fn().mockResolvedValue({ success: true, data: {} }),
  };
}

function createMockPluginTool(
  name: string,
  sourceOverrides?: Partial<{ location: string; pluginVersion: string; pluginHash: string }>,
): PluginTool {
  const tool = createMockTool(name) as unknown as PluginTool;
  Object.defineProperty(tool, "source", {
    value: {
      type: "plugin",
      location: sourceOverrides?.location ?? "project",
      pluginVersion: sourceOverrides?.pluginVersion,
      pluginHash: sourceOverrides?.pluginHash,
    },
  });
  return tool;
}

describe("ToolRegistry", () => {
  it("returns all built-in tools when no plugins", () => {
    const builtIn = [createMockTool("tool-a"), createMockTool("tool-b")];
    const registry = new ToolRegistry(builtIn, []);

    expect(registry.getAll()).toHaveLength(2);
    expect(registry.size).toBe(2);
  });

  it("returns built-in + plugin tools combined", () => {
    const builtIn = [createMockTool("tool-a")];
    const plugins = [createMockPluginTool("tool-b")];
    const registry = new ToolRegistry(builtIn, plugins);

    expect(registry.getAll()).toHaveLength(2);
    expect(registry.size).toBe(2);
  });

  it("plugin overrides built-in with same name", () => {
    const builtIn = [createMockTool("shared-tool", "built-in desc")];
    const plugins = [createMockPluginTool("shared-tool")];
    // Override the description for test
    (plugins[0] as unknown as { description: string }).description = "plugin desc";
    const registry = new ToolRegistry(builtIn, plugins);

    expect(registry.getAll()).toHaveLength(1);
    expect(registry.get("shared-tool")!.description).toBe("plugin desc");
  });

  it("get returns tool by name", () => {
    const registry = new ToolRegistry([createMockTool("my-tool")], []);

    expect(registry.get("my-tool")).toBeDefined();
    expect(registry.get("my-tool")!.name).toBe("my-tool");
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  it("has returns true for existing tools", () => {
    const registry = new ToolRegistry([createMockTool("tool-a")], []);

    expect(registry.has("tool-a")).toBe(true);
    expect(registry.has("tool-b")).toBe(false);
  });

  it("getBuiltIn returns only built-in tools", () => {
    const builtIn = [createMockTool("built-in-a"), createMockTool("built-in-b")];
    const plugins = [createMockPluginTool("plugin-a")];
    const registry = new ToolRegistry(builtIn, plugins);

    const result = registry.getBuiltIn();
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("built-in-a");
  });

  it("getPlugins returns only plugin tools", () => {
    const builtIn = [createMockTool("built-in-a")];
    const plugins = [createMockPluginTool("plugin-a"), createMockPluginTool("plugin-b")];
    const registry = new ToolRegistry(builtIn, plugins);

    const result = registry.getPlugins();
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("plugin-a");
  });

  it("getBuiltIn returns a copy (not internal array)", () => {
    const builtIn = [createMockTool("tool-a")];
    const registry = new ToolRegistry(builtIn, []);

    const result1 = registry.getBuiltIn();
    const result2 = registry.getBuiltIn();
    expect(result1).not.toBe(result2);
    expect(result1).toEqual(result2);
  });

  it("handles empty registry", () => {
    const registry = new ToolRegistry([], []);

    expect(registry.getAll()).toHaveLength(0);
    expect(registry.size).toBe(0);
    expect(registry.get("anything")).toBeUndefined();
    expect(registry.has("anything")).toBe(false);
  });

  it("preserves order: built-in first, then plugins", () => {
    const builtIn = [createMockTool("alpha"), createMockTool("beta")];
    const plugins = [createMockPluginTool("gamma")];
    const registry = new ToolRegistry(builtIn, plugins);

    const names = registry.getAll().map((t) => t.name);
    expect(names).toEqual(["alpha", "beta", "gamma"]);
  });

  describe("getToolMetadata", () => {
    it("returns built-in for a built-in tool", () => {
      const registry = new ToolRegistry([createMockTool("terraform")], []);
      const meta = registry.getToolMetadata("terraform");

      expect(meta).toEqual({ toolType: "built-in" });
    });

    it("returns plugin metadata for a plugin tool", () => {
      const plugin = createMockPluginTool("my-plugin", {
        location: "project",
        pluginVersion: "1.2.0",
        pluginHash: "abc123def456",
      });
      const registry = new ToolRegistry([], [plugin]);
      const meta = registry.getToolMetadata("my-plugin");

      expect(meta).toEqual({
        toolType: "plugin",
        pluginVersion: "1.2.0",
        pluginHash: "abc123def456",
        pluginSource: "project",
      });
    });

    it("returns undefined for nonexistent tool", () => {
      const registry = new ToolRegistry([createMockTool("tool-a")], []);
      expect(registry.getToolMetadata("nonexistent")).toBeUndefined();
    });

    it("returns plugin metadata when plugin overrides built-in", () => {
      const builtIn = [createMockTool("shared")];
      const plugin = createMockPluginTool("shared", {
        location: "global",
        pluginVersion: "2.0.0",
        pluginHash: "hash999",
      });
      const registry = new ToolRegistry(builtIn, [plugin]);
      const meta = registry.getToolMetadata("shared");

      expect(meta).toEqual({
        toolType: "plugin",
        pluginVersion: "2.0.0",
        pluginHash: "hash999",
        pluginSource: "global",
      });
    });
  });
});
