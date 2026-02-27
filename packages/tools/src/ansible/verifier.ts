import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { VerificationResult } from "@dojops/sdk";

export async function verifyAnsiblePlaybook(yaml: string): Promise<VerificationResult> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dojops-ansible-"));
  const tmpFile = path.join(tmpDir, "playbook.yml");

  try {
    fs.writeFileSync(tmpFile, yaml, "utf-8");

    try {
      const rawOutput = execFileSync("ansible-playbook", ["--syntax-check", tmpFile], {
        encoding: "utf-8",
        timeout: 30_000,
        stdio: "pipe",
      });

      return { passed: true, tool: "ansible-playbook syntax-check", issues: [], rawOutput };
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return {
          passed: true,
          tool: "ansible-playbook syntax-check",
          issues: [{ severity: "warning", message: "ansible-playbook not found — skipped" }],
        };
      }

      const execErr = err as { stderr?: string };
      const stderr = execErr.stderr ?? (err instanceof Error ? err.message : String(err));

      return {
        passed: false,
        tool: "ansible-playbook syntax-check",
        issues: [{ severity: "error", message: stderr.trim() }],
        rawOutput: stderr,
      };
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
