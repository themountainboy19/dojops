import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { VerificationResult } from "@dojops/sdk";

export async function verifyDockerCompose(yaml: string): Promise<VerificationResult> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dojops-compose-"));
  const tmpFile = path.join(tmpDir, "docker-compose.yml");

  try {
    fs.writeFileSync(tmpFile, yaml, "utf-8");

    // Try `docker compose config` first (V2), fallback to `docker-compose config` (V1)
    for (const cmd of [
      ["docker", ["compose", "-f", tmpFile, "config", "--quiet"]],
      ["docker-compose", ["-f", tmpFile, "config", "--quiet"]],
    ] as const) {
      try {
        const rawOutput = execFileSync(cmd[0], [...cmd[1]], {
          encoding: "utf-8",
          timeout: 30_000,
          stdio: "pipe",
        });

        return {
          passed: true,
          tool: "docker compose config",
          issues: [],
          rawOutput,
        };
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          continue; // Try next command
        }

        const execErr = err as { stderr?: string };
        const stderr = execErr.stderr ?? (err instanceof Error ? err.message : String(err));

        return {
          passed: false,
          tool: "docker compose config",
          issues: [{ severity: "error", message: stderr.trim() }],
          rawOutput: stderr,
        };
      }
    }

    // Neither docker compose nor docker-compose found
    return {
      passed: true,
      tool: "docker compose config",
      issues: [{ severity: "warning", message: "docker compose not found — skipped" }],
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
