import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { VerificationResult } from "@dojops/sdk";

export async function verifyMakefile(content: string): Promise<VerificationResult> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dojops-make-"));
  const tmpFile = path.join(tmpDir, "Makefile");

  try {
    fs.writeFileSync(tmpFile, content, "utf-8");

    try {
      const rawOutput = execFileSync("make", ["-n", "-f", tmpFile], {
        encoding: "utf-8",
        timeout: 30_000,
        stdio: "pipe",
      });

      return { passed: true, tool: "make dry-run", issues: [], rawOutput };
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return {
          passed: true,
          tool: "make dry-run",
          issues: [{ severity: "warning", message: "make not found — skipped" }],
        };
      }

      const execErr = err as { stderr?: string };
      const stderr = execErr.stderr ?? (err instanceof Error ? err.message : String(err));

      return {
        passed: false,
        tool: "make dry-run",
        issues: [{ severity: "error", message: stderr.trim() }],
        rawOutput: stderr,
      };
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
