import { execSync } from "node:child_process";
import pc from "picocolors";
import * as p from "@clack/prompts";
import {
  ToolDependency,
  ToolCheckResult,
  PreflightResult,
  aggregatePreflight,
  getInstallCommand,
} from "@odaops/core";

/**
 * Attempt to resolve a binary on PATH.
 * Returns the absolute path if found, undefined otherwise.
 */
export function resolveBinary(name: string): string | undefined {
  try {
    const cmd = process.platform === "win32" ? `where ${name}` : `which ${name}`;
    const result = execSync(cmd, { timeout: 5_000, stdio: ["ignore", "pipe", "ignore"] });
    const path = result.toString().trim().split("\n")[0];
    return path || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Attempt to resolve a library-only (no binary) dependency via require.resolve.
 */
export function resolveModule(npmPackage: string): string | undefined {
  try {
    return require.resolve(npmPackage);
  } catch {
    return undefined;
  }
}

/**
 * Check all dependencies for a given agent. Returns a PreflightResult.
 */
export function runPreflight(agentName: string, deps: ToolDependency[]): PreflightResult {
  const checks: ToolCheckResult[] = deps.map((dep) => {
    if (dep.binary) {
      const resolvedPath = resolveBinary(dep.binary);
      return { dependency: dep, available: !!resolvedPath, resolvedPath };
    }
    // Library-only dependency
    const resolvedPath = resolveModule(dep.npmPackage);
    return { dependency: dep, available: !!resolvedPath, resolvedPath };
  });

  return aggregatePreflight(agentName, checks);
}

export interface PreflightOptions {
  quiet?: boolean;
  json?: boolean;
}

/**
 * Run preflight checks and render results via @clack/prompts.
 *
 * Returns true if execution can proceed, false if blocked by missing required tools.
 */
export function preflightCheck(
  agentName: string,
  deps: ToolDependency[],
  opts: PreflightOptions = {},
): boolean {
  if (deps.length === 0) return true;

  const result = runPreflight(agentName, deps);

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return result.canProceed;
  }

  // Quiet mode: skip output if everything is fine
  if (opts.quiet && result.canProceed && result.missingOptional.length === 0) {
    return true;
  }

  // Missing optional tools — warn but continue
  if (result.missingOptional.length > 0) {
    const lines = result.missingOptional.map(
      (dep) =>
        `  ${pc.yellow("!")} ${pc.bold(dep.name)} — ${dep.description}\n    Install: ${pc.dim(getInstallCommand(dep, "npx"))}`,
    );
    p.log.warn(`Optional tools not found:\n${lines.join("\n")}`);
  }

  // Missing required tools — error and block
  if (result.missingRequired.length > 0) {
    const lines = result.missingRequired.map(
      (dep) =>
        `  ${pc.red("\u2717")} ${pc.bold(dep.name)} — ${dep.description}\n    Install: ${pc.dim(getInstallCommand(dep, "npx"))}`,
    );
    p.log.error(`Required tools missing:\n${lines.join("\n")}`);
    return false;
  }

  return true;
}
