import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { VerificationResult } from "@dojops/sdk";

export async function verifyNginxConfig(conf: string): Promise<VerificationResult> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dojops-nginx-"));
  const tmpFile = path.join(tmpDir, "nginx.conf");

  try {
    // Nginx requires certain directives to parse standalone. Wrap if needed.
    const testConf = conf.includes("events") ? conf : `events {}\nhttp {\n${conf}\n}`;
    fs.writeFileSync(tmpFile, testConf, "utf-8");

    try {
      const rawOutput = execFileSync("nginx", ["-t", "-c", tmpFile], {
        encoding: "utf-8",
        timeout: 30_000,
        stdio: "pipe",
      });

      return { passed: true, tool: "nginx -t", issues: [], rawOutput };
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return {
          passed: true,
          tool: "nginx -t",
          issues: [{ severity: "warning", message: "nginx not found — skipped" }],
        };
      }

      const execErr = err as { stderr?: string };
      const stderr = execErr.stderr ?? (err instanceof Error ? err.message : String(err));
      const lines = stderr
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.includes("[emerg]") || l.includes("[error]") || l.includes("[warn]"));

      const issues = lines.map((line) => ({
        severity: (line.includes("[warn]") ? "warning" : "error") as "error" | "warning",
        message: line,
      }));

      return {
        passed: false,
        tool: "nginx -t",
        issues: issues.length > 0 ? issues : [{ severity: "error", message: stderr.trim() }],
        rawOutput: stderr,
      };
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
