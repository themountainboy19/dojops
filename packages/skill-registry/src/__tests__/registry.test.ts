import { describe, it, expect, vi } from "vitest";
import { SkillRegistry } from "../registry";
import { DevOpsSkill } from "@dojops/sdk";
import { z } from "zod";

function createMockSkill(name: string, description = "desc"): DevOpsSkill {
  return {
    name,
    description,
    inputSchema: z.object({ input: z.string() }),
    validate: vi.fn().mockReturnValue({ valid: true }),
    generate: vi.fn().mockResolvedValue({ success: true, data: {} }),
  };
}

describe("SkillRegistry", () => {
  it("returns all skills", () => {
    const builtIn = [createMockSkill("skill-a"), createMockSkill("skill-b")];
    const registry = new SkillRegistry(builtIn);

    expect(registry.getAll()).toHaveLength(2);
    expect(registry.size).toBe(2);
  });

  it("get returns skill by name", () => {
    const registry = new SkillRegistry([createMockSkill("my-skill")]);

    expect(registry.get("my-skill")).toBeDefined();
    expect(registry.get("my-skill")!.name).toBe("my-skill");
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  it("has returns true for existing skills", () => {
    const registry = new SkillRegistry([createMockSkill("skill-a")]);

    expect(registry.has("skill-a")).toBe(true);
    expect(registry.has("skill-b")).toBe(false);
  });

  it("getBuiltIn returns only built-in skills", () => {
    const builtIn = [createMockSkill("built-in-a"), createMockSkill("built-in-b")];
    const registry = new SkillRegistry(builtIn);

    const result = registry.getBuiltIn();
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("built-in-a");
  });

  it("getBuiltIn returns a copy (not internal array)", () => {
    const builtIn = [createMockSkill("skill-a")];
    const registry = new SkillRegistry(builtIn);

    const result1 = registry.getBuiltIn();
    const result2 = registry.getBuiltIn();
    expect(result1).not.toBe(result2);
    expect(result1).toEqual(result2);
  });

  it("handles empty registry", () => {
    const registry = new SkillRegistry([]);

    expect(registry.getAll()).toHaveLength(0);
    expect(registry.size).toBe(0);
    expect(registry.get("anything")).toBeUndefined();
    expect(registry.has("anything")).toBe(false);
  });

  it("preserves insertion order", () => {
    const builtIn = [createMockSkill("alpha"), createMockSkill("beta"), createMockSkill("gamma")];
    const registry = new SkillRegistry(builtIn);

    const names = registry.getAll().map((t) => t.name);
    expect(names).toEqual(["alpha", "beta", "gamma"]);
  });

  it("later skill overrides earlier skill with same name", () => {
    const modules = [createMockSkill("shared", "first"), createMockSkill("shared", "second")];
    const registry = new SkillRegistry(modules);

    expect(registry.getAll()).toHaveLength(1);
    expect(registry.get("shared")!.description).toBe("second");
  });

  describe("getSkillMetadata", () => {
    it("returns built-in for a built-in skill", () => {
      const registry = new SkillRegistry([createMockSkill("terraform")]);
      const meta = registry.getSkillMetadata("terraform");

      expect(meta).toEqual({ toolType: "built-in" });
    });

    it("returns undefined for nonexistent skill", () => {
      const registry = new SkillRegistry([createMockSkill("skill-a")]);
      expect(registry.getSkillMetadata("nonexistent")).toBeUndefined();
    });

    it("returns DopsRuntime metadata when available", () => {
      const mod = createMockSkill("my-skill");
      Object.defineProperty(mod, "skillHash", { value: "abc123" });
      Object.defineProperty(mod, "metadata", {
        value: {
          toolType: "built-in",
          toolVersion: "1.0.0",
          toolHash: "abc123",
          toolSource: "built-in",
          systemPromptHash: "hash456",
        },
      });
      const registry = new SkillRegistry([mod]);
      const meta = registry.getSkillMetadata("my-skill");

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
