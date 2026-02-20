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
      expect(output).toContain("Usage: oda");
      expect(output).toContain("serve");
      expect(output).toContain("--plan");
      expect(output).toContain("--execute");
      expect(output).toContain("--debug-ci");
      expect(output).toContain("--diff");
      expect(output).toContain("--port=N");
      expect(output).toContain("--model=NAME");
    });

    it("shows help text with -h flag", () => {
      const output = run("-h");
      expect(output).toContain("Usage: oda");
    });
  });

  describe("no arguments", () => {
    it("shows help when no prompt is given", () => {
      const output = run();
      expect(output).toContain("Usage: oda");
    });
  });

  describe("examples in help", () => {
    it("shows usage examples", () => {
      const output = run("--help");
      expect(output).toContain("oda serve");
      expect(output).toContain("oda serve --port=8080");
      expect(output).toContain("oda --plan");
      expect(output).toContain("oda --execute --yes");
    });
  });
});
