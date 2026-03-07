import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import { validateConfigValues, validateConfigPermissions } from "../../commands/config-cmd";

describe("validateConfigValues", () => {
  it("returns no issues for valid config", () => {
    const issues = validateConfigValues({
      defaultProvider: "openai",
      defaultTemperature: 0.7,
    });
    expect(issues).toEqual([]);
  });

  it("flags invalid provider", () => {
    const issues = validateConfigValues({ defaultProvider: "invalid-provider" });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("Invalid provider");
  });

  it("flags temperature below 0", () => {
    const issues = validateConfigValues({ defaultTemperature: -1 });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("Temperature out of range");
  });

  it("flags temperature above 2", () => {
    const issues = validateConfigValues({ defaultTemperature: 3 });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("Temperature out of range");
  });

  it("accepts temperature at boundaries", () => {
    expect(validateConfigValues({ defaultTemperature: 0 })).toEqual([]);
    expect(validateConfigValues({ defaultTemperature: 2 })).toEqual([]);
  });

  it("flags invalid Ollama host URL", () => {
    const issues = validateConfigValues({ ollamaHost: "not-a-url" });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("Invalid Ollama host URL");
  });

  it("flags non-http Ollama host protocol", () => {
    const issues = validateConfigValues({ ollamaHost: "ftp://localhost:11434" });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("http:// or https://");
  });

  it("accepts valid Ollama host", () => {
    expect(validateConfigValues({ ollamaHost: "http://localhost:11434" })).toEqual([]);
    expect(validateConfigValues({ ollamaHost: "https://ollama.example.com" })).toEqual([]);
  });

  it("returns empty for empty config", () => {
    expect(validateConfigValues({})).toEqual([]);
  });

  it("accumulates multiple issues", () => {
    const issues = validateConfigValues({
      defaultProvider: "bad",
      defaultTemperature: 5,
      ollamaHost: "xxx",
    });
    expect(issues).toHaveLength(3);
  });
});

describe("validateConfigPermissions", () => {
  it("returns no issues for mode 600", () => {
    vi.spyOn(fs, "statSync").mockReturnValue({ mode: 0o100600 } as fs.Stats);
    const issues = validateConfigPermissions("/tmp/config.json");
    expect(issues).toEqual([]);
    vi.restoreAllMocks();
  });

  it("flags insecure permissions", () => {
    vi.spyOn(fs, "statSync").mockReturnValue({ mode: 0o100644 } as fs.Stats);
    const issues = validateConfigPermissions("/tmp/config.json");
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("Insecure file permissions");
    vi.restoreAllMocks();
  });

  it("handles stat errors gracefully", () => {
    vi.spyOn(fs, "statSync").mockImplementation(() => {
      throw new Error("ENOENT");
    });
    const issues = validateConfigPermissions("/tmp/missing.json");
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("Could not check file permissions");
    vi.restoreAllMocks();
  });
});
