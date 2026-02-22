import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { ScannerResult, ScanFinding } from "../types";

interface NpmVulnerability {
  severity: string;
  via: Array<string | { title?: string; url?: string }>;
  fixAvailable: boolean | { name: string; version: string };
}

interface NpmAuditOutput {
  vulnerabilities?: Record<string, NpmVulnerability>;
}

export async function scanNpm(projectPath: string): Promise<ScannerResult> {
  const lockFile = path.join(projectPath, "package-lock.json");
  if (!fs.existsSync(lockFile)) {
    return {
      tool: "npm-audit",
      findings: [],
      skipped: true,
      skipReason: "No package-lock.json found",
    };
  }

  let rawOutput: string;
  try {
    rawOutput = execFileSync("npm", ["audit", "--json"], {
      encoding: "utf-8",
      timeout: 60_000,
      stdio: "pipe",
      cwd: projectPath,
    });
  } catch (err: unknown) {
    if (isENOENT(err)) {
      return {
        tool: "npm-audit",
        findings: [],
        skipped: true,
        skipReason: "npm not found",
      };
    }
    // npm audit exits non-zero when vulnerabilities are found but still outputs JSON
    const execErr = err as { stdout?: string; stderr?: string };
    rawOutput = execErr.stdout ?? "";
    if (!rawOutput) {
      return {
        tool: "npm-audit",
        findings: [],
        skipped: true,
        skipReason: `npm audit failed: ${execErr.stderr ?? "unknown error"}`,
      };
    }
  }

  const findings: ScanFinding[] = [];

  try {
    const audit: NpmAuditOutput = JSON.parse(rawOutput);
    if (audit.vulnerabilities) {
      for (const [name, vuln] of Object.entries(audit.vulnerabilities)) {
        const severity = mapSeverity(vuln.severity);
        const viaMessages = vuln.via
          .map((v) => (typeof v === "string" ? v : (v.title ?? "")))
          .filter(Boolean)
          .join("; ");

        findings.push({
          id: `npm-${crypto.randomUUID().slice(0, 8)}`,
          tool: "npm-audit",
          severity,
          category: "DEPENDENCY",
          message: `${name}: ${viaMessages || vuln.severity} vulnerability`,
          recommendation: vuln.fixAvailable
            ? typeof vuln.fixAvailable === "object"
              ? `Update to ${vuln.fixAvailable.name}@${vuln.fixAvailable.version}`
              : "Run npm audit fix"
            : "No automatic fix available — review manually",
          autoFixAvailable: !!vuln.fixAvailable,
        });
      }
    }
  } catch {
    // JSON parse failed
  }

  return { tool: "npm-audit", findings, rawOutput };
}

function mapSeverity(severity: string): ScanFinding["severity"] {
  switch (severity) {
    case "critical":
      return "CRITICAL";
    case "high":
      return "HIGH";
    case "moderate":
      return "MEDIUM";
    case "low":
    case "info":
      return "LOW";
    default:
      return "MEDIUM";
  }
}

function isENOENT(err: unknown): boolean {
  return (err as NodeJS.ErrnoException).code === "ENOENT";
}
