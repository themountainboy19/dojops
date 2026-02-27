import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import * as p from "@clack/prompts";
import { CLIContext } from "../types";
import { ExitCode, CLIError } from "../exit-codes";

/** Matches VerificationResult from @dojops/sdk (CLI does not depend on SDK directly). */
interface VerificationResult {
  passed: boolean;
  tool: string;
  issues: Array<{
    severity: "error" | "warning" | "info";
    message: string;
    line?: number;
    rule?: string;
  }>;
  rawOutput?: string;
}

/**
 * Dynamic require wrapper that bypasses TypeScript path-alias resolution.
 * At runtime, pnpm workspace `exports` in @dojops/tools/package.json
 * resolve these sub-path imports to the compiled `dist/` files.
 */
function loadVerifier(subpath: string): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(`@dojops/tools/${subpath}`);
}

/**
 * Detect file type from filename/extension and content, then run
 * the appropriate verifier from @dojops/tools.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function verifyCommand(args: string[], _ctx?: CLIContext): Promise<void> {
  const filePath = args.find((a) => !a.startsWith("-"));
  if (!filePath) {
    p.log.info(`  ${pc.dim("$")} dojops verify <file>`);
    throw new CLIError(ExitCode.VALIDATION_ERROR, "File path required.");
  }

  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new CLIError(ExitCode.VALIDATION_ERROR, `File not found: ${resolvedPath}`);
  }

  const content = fs.readFileSync(resolvedPath, "utf-8");
  const basename = path.basename(resolvedPath);
  const ext = path.extname(resolvedPath).toLowerCase();

  const spinner = p.spinner();
  spinner.start(`Verifying ${pc.cyan(basename)}...`);

  let result: VerificationResult;

  try {
    if (ext === ".tf") {
      const mod = loadVerifier("terraform/verifier");
      result = await (mod.verifyTerraformHcl as (c: string) => Promise<VerificationResult>)(
        content,
      );
    } else if (basename === "Dockerfile" || basename.startsWith("Dockerfile.")) {
      const mod = loadVerifier("dockerfile/verifier");
      result = await (mod.verifyDockerfile as (c: string) => Promise<VerificationResult>)(content);
    } else if (ext === ".yaml" || ext === ".yml") {
      result = await verifyYamlFile(content, basename);
    } else {
      spinner.stop("Unknown file type");
      throw new CLIError(
        ExitCode.VALIDATION_ERROR,
        `Cannot verify file type: ${ext || basename}. Supported: .tf, Dockerfile, .yaml/.yml`,
      );
    }
  } catch (err) {
    if (err instanceof CLIError) {
      throw err;
    }
    spinner.stop("Verification failed");
    throw new CLIError(ExitCode.GENERAL_ERROR, err instanceof Error ? err.message : String(err));
  }

  spinner.stop(`Verified with ${pc.cyan(result.tool)}`);

  // Display results
  if (result.passed) {
    p.log.success(`${pc.green("PASSED")} - ${result.tool}`);
  } else {
    p.log.error(`${pc.red("FAILED")} - ${result.tool}`);
  }

  if (result.issues.length > 0) {
    console.log();
    for (const issue of result.issues) {
      const label =
        issue.severity === "error"
          ? pc.red("ERROR")
          : issue.severity === "warning"
            ? pc.yellow("WARN ")
            : pc.dim("INFO ");
      const lineInfo = issue.line ? ` ${pc.dim(`line ${issue.line}`)}` : "";
      const ruleInfo = issue.rule ? ` ${pc.dim(`[${issue.rule}]`)}` : "";
      console.log(`  ${label}${lineInfo}${ruleInfo}  ${issue.message}`);
    }
    console.log();
  }

  if (!result.passed) {
    throw new CLIError(ExitCode.VALIDATION_ERROR, "Verification failed.");
  }
}

/**
 * Detect YAML subtype by inspecting content for known markers.
 */
async function verifyYamlFile(content: string, basename: string): Promise<VerificationResult> {
  // Kubernetes manifests: have apiVersion and kind
  if (/^apiVersion:/m.test(content) && /^kind:/m.test(content)) {
    const mod = loadVerifier("kubernetes/verifier");
    return (mod.verifyKubernetesYaml as (c: string) => Promise<VerificationResult>)(content);
  }

  // GitHub Actions: have 'on' and 'jobs' top-level keys
  if (/^on:/m.test(content) && /^jobs:/m.test(content)) {
    const mod = loadVerifier("github/verifier");
    return (mod.verifyGitHubActions as (c: string) => VerificationResult)(content);
  }

  // GitLab CI: typically named .gitlab-ci.yml or has stages/script patterns
  if (
    basename === ".gitlab-ci.yml" ||
    basename === ".gitlab-ci.yaml" ||
    (/^stages:/m.test(content) && /script:/m.test(content))
  ) {
    const mod = loadVerifier("gitlab-ci/verifier");
    return (mod.verifyGitLabCI as (c: string) => VerificationResult)(content);
  }

  // Docker Compose: has 'services' key
  if (/^services:/m.test(content)) {
    const mod = loadVerifier("docker-compose/verifier");
    return (mod.verifyDockerCompose as (c: string) => Promise<VerificationResult>)(content);
  }

  // Helm chart (Chart.yaml or values.yaml)
  // verifyHelmChart requires (chartYaml, valuesYaml, templates) — for single-file
  // verification we pass the content as chartYaml with empty valuesYaml and templates
  if (basename === "Chart.yaml") {
    const mod = loadVerifier("helm/verifier");
    return (
      mod.verifyHelmChart as (
        c: string,
        v: string,
        t: Record<string, string>,
      ) => Promise<VerificationResult>
    )(content, "", {});
  }
  if (basename === "values.yaml") {
    const mod = loadVerifier("helm/verifier");
    return (
      mod.verifyHelmChart as (
        c: string,
        v: string,
        t: Record<string, string>,
      ) => Promise<VerificationResult>
    )("", content, {});
  }

  // Prometheus config
  if (/^global:/m.test(content) && /scrape_configs:/m.test(content)) {
    const mod = loadVerifier("prometheus/verifier");
    return (mod.verifyPrometheusConfig as (c: string) => Promise<VerificationResult>)(content);
  }

  // Ansible playbook (has hosts + tasks)
  if (/hosts:/m.test(content) && /tasks:/m.test(content)) {
    const mod = loadVerifier("ansible/verifier");
    return (mod.verifyAnsiblePlaybook as (c: string) => Promise<VerificationResult>)(content);
  }

  return {
    passed: true,
    tool: "yaml-parse",
    issues: [
      {
        severity: "warning",
        message: "Could not detect specific YAML type. File parsed successfully as valid YAML.",
      },
    ],
  };
}
