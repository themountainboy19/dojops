import pc from "picocolors";
import * as p from "@clack/prompts";
import { CLIContext } from "../types";
import { findProjectRoot, initProject, readAudit, listScanReports, listExecutions } from "../state";
import { readTokenUsage } from "../token-store";

export interface Insight {
  category: "efficiency" | "security" | "quality" | "cost";
  message: string;
  suggestion: string;
}

export async function insightsCommand(args: string[], ctx: CLIContext): Promise<void> {
  const root = findProjectRoot() ?? ctx.cwd;
  if (!findProjectRoot()) initProject(root);

  const insights = analyzeHistory(root);

  if (ctx.globalOpts.output === "json") {
    console.log(JSON.stringify(insights, null, 2));
    return;
  }

  if (insights.length === 0) {
    p.log.info("No insights yet. Use DojOps commands to build history.");
    return;
  }

  const categoryIcons: Record<string, string> = {
    efficiency: pc.cyan(">>"),
    security: pc.red("!!"),
    quality: pc.yellow("**"),
    cost: pc.green("$$"),
  };

  const lines = insights.map((i) => {
    const icon = categoryIcons[i.category] ?? pc.dim("--");
    return `  ${icon} ${i.message}\n     ${pc.dim("→")} ${pc.dim(i.suggestion)}`;
  });

  p.note(lines.join("\n\n"), `${insights.length} Insight(s)`);
}

export function analyzeHistory(rootDir: string): Insight[] {
  const insights: Insight[] = [];

  analyzeAuditPatterns(rootDir, insights);
  analyzeScanPatterns(rootDir, insights);
  analyzeExecutionPatterns(rootDir, insights);
  analyzeTokenPatterns(rootDir, insights);

  return insights;
}

function analyzeAuditPatterns(rootDir: string, insights: Insight[]): void {
  const audit = readAudit(rootDir);
  if (audit.length === 0) return;

  // Check for repeated failures
  const failures = audit.filter((e) => e.status === "failure" || e.status === "cancelled");
  const failRate = audit.length > 0 ? failures.length / audit.length : 0;

  if (failRate > 0.3 && failures.length >= 3) {
    insights.push({
      category: "quality",
      message: `${Math.round(failRate * 100)}% of operations failed (${failures.length}/${audit.length}).`,
      suggestion: "Review recent failures with `dojops history audit` to find recurring issues.",
    });
  }

  // Check for scan frequency
  const scanEntries = audit.filter((e) => e.command === "scan");
  const scanWithFix = audit.filter((e) => e.command === "scan" && e.action?.includes("fix"));

  if (scanEntries.length >= 5 && scanWithFix.length === 0) {
    insights.push({
      category: "efficiency",
      message: `You ran scan ${scanEntries.length} times but never used --fix.`,
      suggestion: "Try `dojops scan --fix` to auto-remediate HIGH/CRITICAL findings.",
    });
  }

  // Check if generate is used more than plan
  const generates = audit.filter((e) => e.command === "generate");
  const plans = audit.filter((e) => e.command === "plan");

  if (generates.length >= 10 && plans.length === 0) {
    insights.push({
      category: "efficiency",
      message: `${generates.length} generations but no plans. Complex tasks benefit from planning.`,
      suggestion: 'Use `dojops plan "your goal"` to decompose into a task graph.',
    });
  }
}

function analyzeScanPatterns(rootDir: string, insights: Insight[]): void {
  const reports = listScanReports(rootDir);
  if (reports.length < 2) return;

  // Check for persistent findings across scans
  const recent = reports.slice(0, 5);
  const criticalCounts = recent
    .map((r) => (r as { summary?: { critical?: number } }).summary?.critical ?? 0)
    .filter((n) => n > 0);

  if (criticalCounts.length >= 3) {
    const avg = Math.round(criticalCounts.reduce((a, b) => a + b, 0) / criticalCounts.length);
    insights.push({
      category: "security",
      message: `Critical findings persist across ${criticalCounts.length} recent scans (avg: ${avg}).`,
      suggestion: "Address critical vulnerabilities with `dojops scan --fix --security`.",
    });
  }

  // Check for increasing scan findings
  if (recent.length >= 3) {
    const totals = recent.map((r) => (r as { summary?: { total?: number } }).summary?.total ?? 0);
    const increasing = totals.every((t, i) => i === 0 || t >= totals[i - 1]);
    if (increasing && totals[0] > totals[totals.length - 1]) {
      insights.push({
        category: "security",
        message: `Scan findings have been increasing across recent scans.`,
        suggestion: "Consider running `dojops scan --fix` or reviewing dependency updates.",
      });
    }
  }
}

function analyzeExecutionPatterns(rootDir: string, insights: Insight[]): void {
  const executions = listExecutions(rootDir);
  if (executions.length === 0) return;

  // Check for high failure rate across executions
  const failed = executions.filter((e) => e.status === "FAILURE");
  if (executions.length >= 5 && failed.length / executions.length > 0.5) {
    insights.push({
      category: "quality",
      message: `${failed.length}/${executions.length} executions failed.`,
      suggestion: "Use `dojops validate` before `dojops apply` to catch issues early.",
    });
  }
}

function analyzeTokenPatterns(rootDir: string, insights: Insight[]): void {
  let records: { totalTokens: number; provider: string; timestamp: string }[];
  try {
    records = readTokenUsage(rootDir);
  } catch {
    return;
  }
  if (records.length < 5) return;

  // Calculate daily average
  const days = new Set(records.map((r) => r.timestamp.slice(0, 10)));
  const totalTokens = records.reduce((sum, r) => sum + r.totalTokens, 0);
  const avgPerDay = totalTokens / days.size;

  if (avgPerDay > 500_000) {
    insights.push({
      category: "cost",
      message: `Averaging ${Math.round(avgPerDay / 1000)}K tokens/day across ${days.size} day(s).`,
      suggestion: "Consider using --model with a lighter model for simple tasks, or model aliases.",
    });
  }

  // Check provider diversity
  const providers = new Set(records.map((r) => r.provider));
  if (providers.size === 1 && records.length >= 10) {
    const provider = [...providers][0];
    insights.push({
      category: "cost",
      message: `All ${records.length} calls use ${provider}. No fallback configured.`,
      suggestion: "Add a fallback provider with --fallback-provider for resilience.",
    });
  }
}
