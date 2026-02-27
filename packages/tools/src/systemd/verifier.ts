import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { VerificationResult } from "@dojops/sdk";

export async function verifySystemdUnit(unitContent: string): Promise<VerificationResult> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dojops-systemd-"));
  const tmpFile = path.join(tmpDir, "test.service");

  try {
    fs.writeFileSync(tmpFile, unitContent, "utf-8");

    try {
      const rawOutput = execFileSync("systemd-analyze", ["verify", tmpFile], {
        encoding: "utf-8",
        timeout: 30_000,
        stdio: "pipe",
      });

      return { passed: true, tool: "systemd-analyze verify", issues: [], rawOutput };
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return {
          passed: true,
          tool: "systemd-analyze verify",
          issues: [{ severity: "warning", message: "systemd-analyze not found — skipped" }],
        };
      }

      const execErr = err as { stderr?: string; stdout?: string };
      const output = (execErr.stderr ?? "") + (execErr.stdout ?? "");
      const lines = output
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      const issues = lines.map((line) => ({
        severity: (line.toLowerCase().includes("warning") ? "warning" : "error") as
          | "error"
          | "warning",
        message: line,
      }));

      return {
        passed: issues.every((i) => i.severity === "warning"),
        tool: "systemd-analyze verify",
        issues: issues.length > 0 ? issues : [{ severity: "error", message: output.trim() }],
        rawOutput: output,
      };
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
