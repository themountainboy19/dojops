import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as yaml from "js-yaml";
import { loadPluginPolicy, isPluginAllowed, PluginPolicy } from "../policy";

describe("loadPluginPolicy", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dojops-policy-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty policy when no project path", () => {
    const policy = loadPluginPolicy();
    expect(policy).toEqual({});
  });

  it("returns empty policy when policy file missing", () => {
    const policy = loadPluginPolicy(tmpDir);
    expect(policy).toEqual({});
  });

  it("loads allowedPlugins from policy file", () => {
    const dojopsDir = path.join(tmpDir, ".dojops");
    fs.mkdirSync(dojopsDir, { recursive: true });
    fs.writeFileSync(
      path.join(dojopsDir, "policy.yaml"),
      yaml.dump({ allowedPlugins: ["tool-a", "tool-b"] }),
      "utf-8",
    );

    const policy = loadPluginPolicy(tmpDir);
    expect(policy.allowedPlugins).toEqual(["tool-a", "tool-b"]);
  });

  it("loads blockedPlugins from policy file", () => {
    const dojopsDir = path.join(tmpDir, ".dojops");
    fs.mkdirSync(dojopsDir, { recursive: true });
    fs.writeFileSync(
      path.join(dojopsDir, "policy.yaml"),
      yaml.dump({ blockedPlugins: ["bad-tool"] }),
      "utf-8",
    );

    const policy = loadPluginPolicy(tmpDir);
    expect(policy.blockedPlugins).toEqual(["bad-tool"]);
  });

  it("handles empty policy file", () => {
    const dojopsDir = path.join(tmpDir, ".dojops");
    fs.mkdirSync(dojopsDir, { recursive: true });
    fs.writeFileSync(path.join(dojopsDir, "policy.yaml"), "", "utf-8");

    const policy = loadPluginPolicy(tmpDir);
    expect(policy).toEqual({});
  });

  it("handles malformed policy file gracefully", () => {
    const dojopsDir = path.join(tmpDir, ".dojops");
    fs.mkdirSync(dojopsDir, { recursive: true });
    fs.writeFileSync(path.join(dojopsDir, "policy.yaml"), "this is not: [valid yaml: {", "utf-8");

    const policy = loadPluginPolicy(tmpDir);
    expect(policy).toEqual({});
  });

  it("filters non-string values from arrays", () => {
    const dojopsDir = path.join(tmpDir, ".dojops");
    fs.mkdirSync(dojopsDir, { recursive: true });
    fs.writeFileSync(
      path.join(dojopsDir, "policy.yaml"),
      yaml.dump({
        allowedPlugins: ["valid", 42, null, "also-valid"],
      }),
      "utf-8",
    );

    const policy = loadPluginPolicy(tmpDir);
    expect(policy.allowedPlugins).toEqual(["valid", "also-valid"]);
  });
});

describe("isPluginAllowed", () => {
  it("allows everything with empty policy", () => {
    expect(isPluginAllowed("any-tool", {})).toBe(true);
  });

  it("blocks plugins in blockedPlugins list", () => {
    const policy: PluginPolicy = { blockedPlugins: ["bad-tool", "evil-tool"] };
    expect(isPluginAllowed("bad-tool", policy)).toBe(false);
    expect(isPluginAllowed("evil-tool", policy)).toBe(false);
    expect(isPluginAllowed("good-tool", policy)).toBe(true);
  });

  it("only allows plugins in allowedPlugins list", () => {
    const policy: PluginPolicy = { allowedPlugins: ["tool-a", "tool-b"] };
    expect(isPluginAllowed("tool-a", policy)).toBe(true);
    expect(isPluginAllowed("tool-b", policy)).toBe(true);
    expect(isPluginAllowed("tool-c", policy)).toBe(false);
  });

  it("blockedPlugins takes precedence over allowedPlugins", () => {
    const policy: PluginPolicy = {
      allowedPlugins: ["tool-a"],
      blockedPlugins: ["tool-a"],
    };
    expect(isPluginAllowed("tool-a", policy)).toBe(false);
  });

  it("allows everything when allowedPlugins is empty array", () => {
    const policy: PluginPolicy = { allowedPlugins: [] };
    expect(isPluginAllowed("any-tool", policy)).toBe(true);
  });

  it("allows everything when blockedPlugins is empty array", () => {
    const policy: PluginPolicy = { blockedPlugins: [] };
    expect(isPluginAllowed("any-tool", policy)).toBe(true);
  });
});
