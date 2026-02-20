import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import * as path from "path";

const CLI_PATH = path.resolve(__dirname, "..", "dist", "index.js");

function run(...args: string[]): string {
  try {
    return execFileSync("node", [CLI_PATH, ...args], {
      encoding: "utf-8",
      env: { ...process.env, ODA_PROVIDER: "ollama" },
      timeout: 5000,
    });
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return (e.stdout ?? "") + (e.stderr ?? "");
  }
}

describe("CLI", () => {
  describe("--help", () => {
    it("shows help text with --help flag", () => {
      const output = run("--help");
      expect(output).toContain("oda");
      expect(output).toContain("USAGE");
      expect(output).toContain("COMMANDS");
      expect(output).toContain("login");
      expect(output).toContain("serve");
      expect(output).toContain("--plan");
      expect(output).toContain("--execute");
      expect(output).toContain("--debug-ci");
      expect(output).toContain("--diff");
      expect(output).toContain("--port=N");
      expect(output).toContain("--model=NAME");
      expect(output).toContain("--provider=NAME");
    });

    it("shows help text with -h flag", () => {
      const output = run("-h");
      expect(output).toContain("USAGE");
    });
  });

  describe("no arguments", () => {
    it("shows help when no prompt is given", () => {
      const output = run();
      expect(output).toContain("USAGE");
    });
  });

  describe("examples in help", () => {
    it("shows usage examples and config precedence", () => {
      const output = run("--help");
      expect(output).toContain("oda serve");
      expect(output).toContain("oda serve --port=8080");
      expect(output).toContain("oda --plan");
      expect(output).toContain("oda --execute --yes");
      expect(output).toContain("CONFIGURATION PRECEDENCE");
      expect(output).toContain("LOGIN");
      expect(output).toContain("oda login --token");
    });
  });

  describe("config command", () => {
    it("shows config command in help", () => {
      const output = run("--help");
      expect(output).toContain("config");
      expect(output).toContain("CONFIG");
      expect(output).toContain("oda config --show");
      expect(output).toContain("--show");
    });

    it("config --show displays configuration", () => {
      const output = run("config", "--show");
      expect(output).toContain("Configuration");
      expect(output).toContain("Provider:");
      expect(output).toContain("Model:");
      expect(output).toContain("Tokens:");
    });

    it("config --provider sets provider directly", () => {
      const output = run("config", "--provider", "anthropic");
      expect(output).toContain("Configuration saved");
    });
  });

  describe("login suggests oda config", () => {
    it("shows config suggestion when login has no --token", () => {
      const output = run("login");
      expect(output).toContain("oda config");
    });
  });
});
