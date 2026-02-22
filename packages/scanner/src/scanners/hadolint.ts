import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { ScannerResult, ScanFinding, ScanSeverity } from "../types";

interface HadolintResult {
  line: number;
  code: string;
  message: string;
  column: number;
  file: string;
  level: string;
}

export async function scanHadolint(projectPath: string): Promise<ScannerResult> {
  // Find Dockerfiles
  const dockerfiles = findDockerfiles(projectPath);
  if (dockerfiles.length === 0) {
    return {
      tool: "hadolint",
      findings: [],
      skipped: true,
      skipReason: "No Dockerfile found",
    };
  }

  const allFindings: ScanFinding[] = [];
  let combinedRawOutput = "";

  for (const dockerfile of dockerfiles) {
    let rawOutput: string;
    try {
      rawOutput = execFileSync("hadolint", ["--format", "json", dockerfile], {
        encoding: "utf-8",
        timeout: 30_000,
        stdio: "pipe",
      });
    } catch (err: unknown) {
      if (isENOENT(err)) {
        return {
          tool: "hadolint",
          findings: [],
          skipped: true,
          skipReason: "hadolint not found",
        };
      }
      // hadolint exits non-zero when issues found, but still outputs JSON
      const execErr = err as { stdout?: string; stderr?: string };
      rawOutput = execErr.stdout ?? "";
      if (!rawOutput) {
        continue;
      }
    }

    combinedRawOutput += rawOutput + "\n";

    try {
      const results: HadolintResult[] = JSON.parse(rawOutput);
      const relPath = path.relative(projectPath, dockerfile);

      for (const r of results) {
        allFindings.push({
          id: `hadolint-${crypto.randomUUID().slice(0, 8)}`,
          tool: "hadolint",
          severity: mapLevel(r.level),
          category: "SECURITY",
          file: relPath,
          line: r.line,
          message: `${r.code}: ${r.message}`,
          recommendation: `Fix ${r.code} in ${relPath}:${r.line}`,
          autoFixAvailable: false,
        });
      }
    } catch {
      // JSON parse failed
    }
  }

  return { tool: "hadolint", findings: allFindings, rawOutput: combinedRawOutput };
}

function findDockerfiles(projectPath: string): string[] {
  const results: string[] = [];
  const root = path.join(projectPath, "Dockerfile");
  if (fs.existsSync(root)) {
    results.push(root);
  }

  // Check common locations
  const locations = ["docker", "build", ".docker"];
  for (const loc of locations) {
    const dir = path.join(projectPath, loc);
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      try {
        const entries = fs.readdirSync(dir);
        for (const entry of entries) {
          if (entry === "Dockerfile" || entry.startsWith("Dockerfile.")) {
            results.push(path.join(dir, entry));
          }
        }
      } catch {
        // Skip unreadable directories
      }
    }
  }

  return results;
}

function mapLevel(level: string): ScanSeverity {
  switch (level) {
    case "error":
      return "HIGH";
    case "warning":
      return "MEDIUM";
    case "info":
    case "style":
      return "LOW";
    default:
      return "MEDIUM";
  }
}

function isENOENT(err: unknown): boolean {
  return (err as NodeJS.ErrnoException).code === "ENOENT";
}
