import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { ScannerResult, ScanFinding } from "../types";

interface PipAuditVuln {
  name: string;
  version: string;
  id: string;
  fix_versions?: string[];
  description?: string;
}

export async function scanPip(projectPath: string): Promise<ScannerResult> {
  const hasRequirements = fs.existsSync(path.join(projectPath, "requirements.txt"));
  const hasPipfile = fs.existsSync(path.join(projectPath, "Pipfile"));
  const hasSetupPy = fs.existsSync(path.join(projectPath, "setup.py"));
  const hasPyprojectToml = fs.existsSync(path.join(projectPath, "pyproject.toml"));

  if (!hasRequirements && !hasPipfile && !hasSetupPy && !hasPyprojectToml) {
    return {
      tool: "pip-audit",
      findings: [],
      skipped: true,
      skipReason: "No Python dependency file found",
    };
  }

  let rawOutput: string;
  try {
    const args = ["--format", "json"];
    if (hasRequirements) {
      args.push("--requirement", path.join(projectPath, "requirements.txt"));
    }
    rawOutput = execFileSync("pip-audit", args, {
      encoding: "utf-8",
      timeout: 120_000,
      stdio: "pipe",
      cwd: projectPath,
    });
  } catch (err: unknown) {
    if (isENOENT(err)) {
      return {
        tool: "pip-audit",
        findings: [],
        skipped: true,
        skipReason: "pip-audit not found",
      };
    }
    const execErr = err as { stdout?: string; stderr?: string };
    rawOutput = execErr.stdout ?? "";
    if (!rawOutput) {
      return {
        tool: "pip-audit",
        findings: [],
        skipped: true,
        skipReason: `pip-audit failed: ${execErr.stderr ?? "unknown error"}`,
      };
    }
  }

  const findings: ScanFinding[] = [];

  try {
    const vulns: PipAuditVuln[] = JSON.parse(rawOutput);
    for (const vuln of vulns) {
      findings.push({
        id: `pip-${crypto.randomUUID().slice(0, 8)}`,
        tool: "pip-audit",
        severity: "HIGH",
        category: "DEPENDENCY",
        message: `${vuln.name}@${vuln.version}: ${vuln.id}${vuln.description ? ` — ${vuln.description}` : ""}`,
        recommendation:
          vuln.fix_versions && vuln.fix_versions.length > 0
            ? `Update to ${vuln.name}>=${vuln.fix_versions[vuln.fix_versions.length - 1]}`
            : "No fix version available — review manually",
        autoFixAvailable: !!(vuln.fix_versions && vuln.fix_versions.length > 0),
      });
    }
  } catch {
    // JSON parse failed
  }

  return { tool: "pip-audit", findings, rawOutput };
}

function isENOENT(err: unknown): boolean {
  return (err as NodeJS.ErrnoException).code === "ENOENT";
}
