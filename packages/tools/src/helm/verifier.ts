import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { VerificationResult } from "@dojops/sdk";

export async function verifyHelmChart(
  chartYaml: string,
  valuesYaml: string,
  templates: Record<string, string>,
): Promise<VerificationResult> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dojops-helm-"));
  const chartDir = path.join(tmpDir, "chart");
  const templatesDir = path.join(chartDir, "templates");

  try {
    fs.mkdirSync(templatesDir, { recursive: true });
    fs.writeFileSync(path.join(chartDir, "Chart.yaml"), chartYaml, "utf-8");
    fs.writeFileSync(path.join(chartDir, "values.yaml"), valuesYaml, "utf-8");
    for (const [name, content] of Object.entries(templates)) {
      fs.writeFileSync(path.join(templatesDir, `${name}.yaml`), content, "utf-8");
    }

    try {
      const rawOutput = execFileSync("helm", ["lint", chartDir], {
        encoding: "utf-8",
        timeout: 30_000,
        stdio: "pipe",
      });

      return { passed: true, tool: "helm lint", issues: [], rawOutput };
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return {
          passed: true,
          tool: "helm lint",
          issues: [{ severity: "warning", message: "helm not found — skipped" }],
        };
      }

      const execErr = err as { stdout?: string; stderr?: string };
      const output = (execErr.stdout ?? "") + (execErr.stderr ?? "");
      const lines = output
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.startsWith("[ERROR]") || l.startsWith("[WARNING]"));

      const issues = lines.map((line) => ({
        severity: (line.startsWith("[ERROR]") ? "error" : "warning") as "error" | "warning",
        message: line.replace(/^\[(ERROR|WARNING)\]\s*/, ""),
      }));

      return {
        passed: false,
        tool: "helm lint",
        issues: issues.length > 0 ? issues : [{ severity: "error", message: output }],
        rawOutput: output,
      };
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
