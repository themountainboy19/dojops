import { ScannerResult, ScanFinding, ScanSeverity } from "../types";
import { execFileAsync } from "../exec-async";
import { deterministicFindingId } from "../finding-id";

interface TrivyLicenseResult {
  Target: string;
  Class?: string;
  Licenses?: TrivyLicense[];
}

interface TrivyLicense {
  Severity: string;
  Category: string;
  PkgName: string;
  FilePath?: string;
  Name: string;
  Confidence?: number;
  Link?: string;
}

interface TrivyLicenseOutput {
  Results?: TrivyLicenseResult[];
}

export async function scanTrivyLicense(projectPath: string): Promise<ScannerResult> {
  let rawOutput: string;
  try {
    const result = await execFileAsync(
      "trivy",
      ["fs", "--scanners", "license", "--format", "json", projectPath],
      {
        encoding: "utf-8",
        timeout: 180_000,
      },
    );
    rawOutput = result.stdout;
  } catch (err: unknown) {
    if (isENOENT(err)) {
      return {
        tool: "trivy-license",
        findings: [],
        skipped: true,
        skipReason: "trivy not found",
      };
    }
    const execErr = err as { stdout?: string; stderr?: string };
    rawOutput = execErr.stdout ?? "";
    if (!rawOutput) {
      return {
        tool: "trivy-license",
        findings: [],
        skipped: true,
        skipReason: `trivy license scan failed: ${execErr.stderr ?? "unknown error"}`,
      };
    }
  }

  const findings: ScanFinding[] = [];

  try {
    const output: TrivyLicenseOutput = JSON.parse(rawOutput);
    if (output.Results) {
      for (const result of output.Results) {
        if (result.Licenses) {
          for (const lic of result.Licenses) {
            findings.push({
              id: deterministicFindingId("trivy-lic", lic.PkgName, lic.Name, lic.Category),
              tool: "trivy-license",
              severity: mapSeverity(lic.Severity),
              category: "LICENSE",
              file: lic.FilePath ?? result.Target,
              message: `${lic.PkgName}: ${lic.Name} license (${lic.Category})`,
              recommendation: lic.Link
                ? `Review license terms: ${lic.Link}`
                : "Review license compliance requirements",
              autoFixAvailable: false,
            });
          }
        }
      }
    }
  } catch {
    findings.push({
      id: "trivy-license-parse-error",
      tool: "trivy-license",
      severity: "MEDIUM",
      category: "LICENSE",
      message:
        "Failed to parse trivy license scan output. The tool may have produced unexpected output format.",
      autoFixAvailable: false,
    });
  }

  return { tool: "trivy-license", findings, rawOutput };
}

function mapSeverity(severity: string): ScanSeverity {
  switch (severity.toUpperCase()) {
    case "CRITICAL":
      return "CRITICAL";
    case "HIGH":
      return "HIGH";
    case "MEDIUM":
      return "MEDIUM";
    case "LOW":
    case "UNKNOWN":
      return "LOW";
    default:
      return "MEDIUM";
  }
}

function isENOENT(err: unknown): boolean {
  return (err as NodeJS.ErrnoException).code === "ENOENT";
}
