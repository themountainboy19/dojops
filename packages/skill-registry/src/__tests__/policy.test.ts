import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as yaml from "js-yaml";
import { loadSkillPolicy, isSkillAllowed, SkillPolicy } from "../policy";

describe("loadSkillPolicy", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dojops-policy-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty policy when no project path", () => {
    const policy = loadSkillPolicy();
    expect(policy).toEqual({});
  });

  it("returns empty policy when policy file missing", () => {
    const policy = loadSkillPolicy(tmpDir);
    expect(policy).toEqual({});
  });

  it("loads allowedSkills from policy file", () => {
    const dojopsDir = path.join(tmpDir, ".dojops");
    fs.mkdirSync(dojopsDir, { recursive: true });
    fs.writeFileSync(
      path.join(dojopsDir, "policy.yaml"),
      yaml.dump({ allowedSkills: ["module-a", "module-b"] }),
      "utf-8",
    );

    const policy = loadSkillPolicy(tmpDir);
    expect(policy.allowedSkills).toEqual(["module-a", "module-b"]);
  });

  it("loads blockedModules from policy file", () => {
    const dojopsDir = path.join(tmpDir, ".dojops");
    fs.mkdirSync(dojopsDir, { recursive: true });
    fs.writeFileSync(
      path.join(dojopsDir, "policy.yaml"),
      yaml.dump({ blockedModules: ["bad-module"] }),
      "utf-8",
    );

    const policy = loadSkillPolicy(tmpDir);
    expect(policy.blockedModules).toEqual(["bad-module"]);
  });

  it("handles previous allowedTools field", () => {
    const dojopsDir = path.join(tmpDir, ".dojops");
    fs.mkdirSync(dojopsDir, { recursive: true });
    fs.writeFileSync(
      path.join(dojopsDir, "policy.yaml"),
      yaml.dump({ allowedTools: ["legacy-a", "legacy-b"] }),
      "utf-8",
    );

    const policy = loadSkillPolicy(tmpDir);
    expect(policy.allowedSkills).toEqual(["legacy-a", "legacy-b"]);
  });

  it("handles previous blockedTools field", () => {
    const dojopsDir = path.join(tmpDir, ".dojops");
    fs.mkdirSync(dojopsDir, { recursive: true });
    fs.writeFileSync(
      path.join(dojopsDir, "policy.yaml"),
      yaml.dump({ blockedTools: ["legacy-bad"] }),
      "utf-8",
    );

    const policy = loadSkillPolicy(tmpDir);
    expect(policy.blockedModules).toEqual(["legacy-bad"]);
  });

  it("handles legacy allowedPlugins field", () => {
    const dojopsDir = path.join(tmpDir, ".dojops");
    fs.mkdirSync(dojopsDir, { recursive: true });
    fs.writeFileSync(
      path.join(dojopsDir, "policy.yaml"),
      yaml.dump({ allowedPlugins: ["legacy-a", "legacy-b"] }),
      "utf-8",
    );

    const policy = loadSkillPolicy(tmpDir);
    expect(policy.allowedSkills).toEqual(["legacy-a", "legacy-b"]);
  });

  it("handles legacy blockedPlugins field", () => {
    const dojopsDir = path.join(tmpDir, ".dojops");
    fs.mkdirSync(dojopsDir, { recursive: true });
    fs.writeFileSync(
      path.join(dojopsDir, "policy.yaml"),
      yaml.dump({ blockedPlugins: ["legacy-bad"] }),
      "utf-8",
    );

    const policy = loadSkillPolicy(tmpDir);
    expect(policy.blockedModules).toEqual(["legacy-bad"]);
  });

  it("prefers new field names over previous and legacy", () => {
    const dojopsDir = path.join(tmpDir, ".dojops");
    fs.mkdirSync(dojopsDir, { recursive: true });
    fs.writeFileSync(
      path.join(dojopsDir, "policy.yaml"),
      yaml.dump({
        allowedSkills: ["new-field"],
        allowedTools: ["old-field"],
        allowedPlugins: ["legacy-field"],
      }),
      "utf-8",
    );

    const policy = loadSkillPolicy(tmpDir);
    expect(policy.allowedSkills).toEqual(["new-field"]);
  });

  it("handles empty policy file", () => {
    const dojopsDir = path.join(tmpDir, ".dojops");
    fs.mkdirSync(dojopsDir, { recursive: true });
    fs.writeFileSync(path.join(dojopsDir, "policy.yaml"), "", "utf-8");

    const policy = loadSkillPolicy(tmpDir);
    expect(policy).toEqual({});
  });

  it("handles malformed policy file gracefully", () => {
    const dojopsDir = path.join(tmpDir, ".dojops");
    fs.mkdirSync(dojopsDir, { recursive: true });
    fs.writeFileSync(path.join(dojopsDir, "policy.yaml"), "this is not: [valid yaml: {", "utf-8");

    const policy = loadSkillPolicy(tmpDir);
    expect(policy).toEqual({});
  });

  it("filters non-string values from arrays", () => {
    const dojopsDir = path.join(tmpDir, ".dojops");
    fs.mkdirSync(dojopsDir, { recursive: true });
    fs.writeFileSync(
      path.join(dojopsDir, "policy.yaml"),
      yaml.dump({
        allowedSkills: ["valid", 42, null, "also-valid"],
      }),
      "utf-8",
    );

    const policy = loadSkillPolicy(tmpDir);
    expect(policy.allowedSkills).toEqual(["valid", "also-valid"]);
  });
});

describe("isSkillAllowed", () => {
  it("allows everything with empty policy", () => {
    expect(isSkillAllowed("any-module", {})).toBe(true);
  });

  it("blocks modules in blockedModules list", () => {
    const policy: SkillPolicy = { blockedModules: ["bad-module", "evil-module"] };
    expect(isSkillAllowed("bad-module", policy)).toBe(false);
    expect(isSkillAllowed("evil-module", policy)).toBe(false);
    expect(isSkillAllowed("good-module", policy)).toBe(true);
  });

  it("only allows modules in allowedSkills list", () => {
    const policy: SkillPolicy = { allowedSkills: ["module-a", "module-b"] };
    expect(isSkillAllowed("module-a", policy)).toBe(true);
    expect(isSkillAllowed("module-b", policy)).toBe(true);
    expect(isSkillAllowed("module-c", policy)).toBe(false);
  });

  it("blockedModules takes precedence over allowedSkills", () => {
    const policy: SkillPolicy = {
      allowedSkills: ["module-a"],
      blockedModules: ["module-a"],
    };
    expect(isSkillAllowed("module-a", policy)).toBe(false);
  });

  it("allows everything when allowedSkills is empty array", () => {
    const policy: SkillPolicy = { allowedSkills: [] };
    expect(isSkillAllowed("any-module", policy)).toBe(true);
  });

  it("allows everything when blockedModules is empty array", () => {
    const policy: SkillPolicy = { blockedModules: [] };
    expect(isSkillAllowed("any-module", policy)).toBe(true);
  });

  describe("T-11: path traversal in module names", () => {
    it("blocks module name containing ../ when in blockedModules", () => {
      const policy: SkillPolicy = { blockedModules: ["../malicious-module"] };
      expect(isSkillAllowed("../malicious-module", policy)).toBe(false);
    });

    it("does not match traversal module name against legitimate module in allowedSkills", () => {
      const policy: SkillPolicy = { allowedSkills: ["my-module"] };
      // A module name with path traversal should not be in the allowed list
      expect(isSkillAllowed("../my-module", policy)).toBe(false);
      expect(isSkillAllowed("../../my-module", policy)).toBe(false);
    });

    it("module name with ../ is not allowed when only legitimate names are in allowedSkills", () => {
      const policy: SkillPolicy = { allowedSkills: ["module-a", "module-b"] };
      expect(isSkillAllowed("../module-a", policy)).toBe(false);
      expect(isSkillAllowed("module-a/../module-b", policy)).toBe(false);
    });

    it("module name with URL-encoded traversal is treated as a different name", () => {
      const policy: SkillPolicy = { allowedSkills: ["module-a"] };
      // URL-encoded ../ (%2e%2e%2f) should not match the legitimate name
      expect(isSkillAllowed("%2e%2e%2fmodule-a", policy)).toBe(false);
      expect(isSkillAllowed("..%2fmodule-a", policy)).toBe(false);
    });

    it("blocks URL-encoded traversal names via blockedModules", () => {
      const policy: SkillPolicy = { blockedModules: ["%2e%2e%2fmalicious"] };
      expect(isSkillAllowed("%2e%2e%2fmalicious", policy)).toBe(false);
    });

    it("module name with backslash traversal is treated as a different name", () => {
      const policy: SkillPolicy = { allowedSkills: ["module-a"] };
      expect(isSkillAllowed(String.raw`..\module-a`, policy)).toBe(false);
    });
  });
});
