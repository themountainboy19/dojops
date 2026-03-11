import { describe, it, expect, vi } from "vitest";
import { ToolRegistry } from "../registry";
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

describe("ToolRegistry", () => {
  it("returns all tools", () => {
    const builtIn = [createMockTool("tool-a"), createMockTool("tool-b")];
    const registry = new ToolRegistry(builtIn);

    expect(registry.getAll()).toHaveLength(2);
    expect(registry.size).toBe(2);
  });

  it("get returns tool by name", () => {
    const registry = new ToolRegistry([createMockTool("my-tool")]);

    expect(registry.get("my-tool")).toBeDefined();
    expect(registry.get("my-tool")!.name).toBe("my-tool");
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  it("has returns true for existing tools", () => {
    const registry = new ToolRegistry([createMockTool("tool-a")]);

    expect(registry.has("tool-a")).toBe(true);
    expect(registry.has("tool-b")).toBe(false);
  });

  it("getBuiltIn returns only built-in tools", () => {
    const builtIn = [createMockTool("built-in-a"), createMockTool("built-in-b")];
    const registry = new ToolRegistry(builtIn);

    const result = registry.getBuiltIn();
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("built-in-a");
  });

  it("getBuiltIn returns a copy (not internal array)", () => {
    const builtIn = [createMockTool("tool-a")];
    const registry = new ToolRegistry(builtIn);

    const result1 = registry.getBuiltIn();
    const result2 = registry.getBuiltIn();
    expect(result1).not.toBe(result2);
    expect(result1).toEqual(result2);
  });

  it("handles empty registry", () => {
    const registry = new ToolRegistry([]);

    expect(registry.getAll()).toHaveLength(0);
    expect(registry.size).toBe(0);
    expect(registry.get("anything")).toBeUndefined();
    expect(registry.has("anything")).toBe(false);
  });

  it("preserves insertion order", () => {
    const builtIn = [createMockTool("alpha"), createMockTool("beta"), createMockTool("gamma")];
    const registry = new ToolRegistry(builtIn);

    const names = registry.getAll().map((t) => t.name);
    expect(names).toEqual(["alpha", "beta", "gamma"]);
  });

  it("later tool overrides earlier tool with same name", () => {
    const tools = [createMockTool("shared", "first"), createMockTool("shared", "second")];
    const registry = new ToolRegistry(tools);

    expect(registry.getAll()).toHaveLength(1);
    expect(registry.get("shared")!.description).toBe("second");
  });

  describe("getToolMetadata", () => {
    it("returns built-in for a built-in tool", () => {
      const registry = new ToolRegistry([createMockTool("terraform")]);
      const meta = registry.getToolMetadata("terraform");

      expect(meta).toEqual({ toolType: "built-in" });
    });

    it("returns undefined for nonexistent tool", () => {
      const registry = new ToolRegistry([createMockTool("tool-a")]);
      expect(registry.getToolMetadata("nonexistent")).toBeUndefined();
    });

    it("returns DopsRuntime metadata when available", () => {
      const tool = createMockTool("my-module");
      Object.defineProperty(tool, "moduleHash", { value: "abc123" });
      Object.defineProperty(tool, "metadata", {
        value: {
          toolType: "built-in",
          toolVersion: "1.0.0",
          toolHash: "abc123",
          toolSource: "built-in",
          systemPromptHash: "hash456",
        },
      });
      const registry = new ToolRegistry([tool]);
      const meta = registry.getToolMetadata("my-module");

      expect(meta).toEqual({
        toolType: "built-in",
        toolVersion: "1.0.0",
        toolHash: "abc123",
        toolSource: "built-in",
        systemPromptHash: "hash456",
      });
    });
  });
});
