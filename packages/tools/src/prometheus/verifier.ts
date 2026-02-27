import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { VerificationResult } from "@dojops/sdk";

export async function verifyPrometheusConfig(yaml: string): Promise<VerificationResult> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dojops-prom-"));
  const tmpFile = path.join(tmpDir, "prometheus.yml");

  try {
    fs.writeFileSync(tmpFile, yaml, "utf-8");

    try {
      const rawOutput = execFileSync("promtool", ["check", "config", tmpFile], {
        encoding: "utf-8",
        timeout: 30_000,
        stdio: "pipe",
      });

      return { passed: true, tool: "promtool check config", issues: [], rawOutput };
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return {
          passed: true,
          tool: "promtool check config",
          issues: [{ severity: "warning", message: "promtool not found — skipped" }],
        };
      }

      const execErr = err as { stderr?: string; stdout?: string };
      const output = (execErr.stderr ?? "") + (execErr.stdout ?? "");

      return {
        passed: false,
        tool: "promtool check config",
        issues: [{ severity: "error", message: output.trim() }],
        rawOutput: output,
      };
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
