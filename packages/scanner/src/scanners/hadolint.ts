import * as fs from "node:fs";
import * as path from "node:path";
import { ScannerResult, ScanFinding } from "../types";
import { listSubDirs } from "../discovery";
import { execFileAsync } from "../exec-async";
import { deterministicFindingId } from "../finding-id";
import { isENOENT, mapLintLevel, parseErrorFinding, skippedResult } from "../scanner-utils";

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
    return skippedResult("hadolint", "No Dockerfile found");
  }

  const allFindings: ScanFinding[] = [];
  let combinedRawOutput = "";

  for (const dockerfile of dockerfiles) {
    let rawOutput: string;
    try {
      const result = await execFileAsync("hadolint", ["--format", "json", dockerfile], {
        encoding: "utf-8",
        timeout: 30_000,
      });
      rawOutput = result.stdout;
    } catch (err: unknown) {
      if (isENOENT(err)) {
        return skippedResult("hadolint", "hadolint not found");
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
          id: deterministicFindingId("hadolint", r.code, relPath, String(r.line)),
          tool: "hadolint",
          severity: mapLintLevel(r.level),
          category: "SECURITY",
          file: relPath,
          line: r.line,
          message: `${r.code}: ${r.message}`,
          recommendation: `Fix ${r.code} in ${relPath}:${r.line}`,
          autoFixAvailable: false,
        });
      }
    } catch {
      allFindings.push(parseErrorFinding("hadolint", "SECURITY"));
    }
  }

  return { tool: "hadolint", findings: allFindings, rawOutput: combinedRawOutput };
}

const COMMON_DOCKER_DIRS = ["docker", "build", ".docker"];

function checkCommonLocations(basePath: string, add: (filePath: string) => void): void {
  for (const loc of COMMON_DOCKER_DIRS) {
    const dir = path.join(basePath, loc);
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      checkDirForDockerfiles(dir, add);
    }
  }
}

function checkSubProject(childPath: string, add: (filePath: string) => void): void {
  const childDockerfile = path.join(childPath, "Dockerfile");
  if (fs.existsSync(childDockerfile)) add(childDockerfile);

  checkCommonLocations(childPath, add);

  for (const grandchild of listSubDirs(childPath)) {
    const gcDockerfile = path.join(childPath, grandchild, "Dockerfile");
    if (fs.existsSync(gcDockerfile)) add(gcDockerfile);
  }
}

function findDockerfiles(projectPath: string): string[] {
  const results: string[] = [];
  const seen = new Set<string>();

  function addDockerfile(filePath: string): void {
    if (!seen.has(filePath)) {
      seen.add(filePath);
      results.push(filePath);
    }
  }

  const rootDockerfile = path.join(projectPath, "Dockerfile");
  if (fs.existsSync(rootDockerfile)) addDockerfile(rootDockerfile);

  checkCommonLocations(projectPath, addDockerfile);

  for (const child of listSubDirs(projectPath)) {
    checkSubProject(path.join(projectPath, child), addDockerfile);
  }

  return results;
}

function checkDirForDockerfiles(dir: string, add: (filePath: string) => void): void {
  try {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      if (entry === "Dockerfile" || entry.startsWith("Dockerfile.")) {
        add(path.join(dir, entry));
      }
    }
  } catch {
    // Skip unreadable directories
  }
}
