import pc from "picocolors";
import * as p from "@clack/prompts";
import { CLIContext } from "../types";
import { findProjectRoot, initProject, readAudit, listScanReports, listExecutions } from "../state";
import { readTokenUsage } from "../token-store";
import { listErrorPatterns, listNotes, ErrorPattern } from "../memory";
import { hasFlag } from "../parser";

export interface Insight {
  category: "efficiency" | "security" | "quality" | "cost";
  message: string;
  suggestion: string;
}

export async function insightsCommand(args: string[], ctx: CLIContext): Promise<void> {
  const root = findProjectRoot() ?? ctx.cwd;
  if (!findProjectRoot()) initProject(root);

  const all = analyzeHistory(root);
  const filterCat = args.find((a) => !a.startsWith("-"));
  const insights = filterCat ? all.filter((i) => i.category === filterCat) : all;
  const showAll = hasFlag(args, "--all");

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

  const displayed = showAll ? insights : insights.slice(0, 10);
  const lines = displayed.map((i) => {
    const icon = categoryIcons[i.category] ?? pc.dim("--");
    return `  ${icon} ${i.message}\n     ${pc.dim("→")} ${pc.dim(i.suggestion)}`;
  });

  const title = filterCat
    ? `${displayed.length} ${filterCat} Insight(s)`
    : `${displayed.length} Insight(s)`;
  p.note(lines.join("\n\n"), title);

  if (!showAll && insights.length > displayed.length) {
    p.log.info(
      pc.dim(`Showing ${displayed.length}/${insights.length}. Use --all to see everything.`),
    );
  }
}

export function analyzeHistory(rootDir: string): Insight[] {
  const insights: Insight[] = [];

  analyzeAuditPatterns(rootDir, insights);
  analyzeScanPatterns(rootDir, insights);
  analyzeExecutionPatterns(rootDir, insights);
  analyzeTokenPatterns(rootDir, insights);
  analyzeErrorPatterns(rootDir, insights);
  analyzeMemoryUsage(rootDir, insights);

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

function analyzeErrorPatterns(rootDir: string, insights: Insight[]): void {
  let patterns: ErrorPattern[];
  try {
    patterns = listErrorPatterns(rootDir);
  } catch {
    return;
  }
  if (patterns.length === 0) return;

  // Surface top recurring unresolved errors
  const unresolved = patterns.filter((p) => !p.resolution);
  const recurring = unresolved.filter((p) => p.occurrences >= 2);

  if (recurring.length > 0) {
    const top = recurring[0];
    const truncMsg =
      top.error_message.length > 60 ? top.error_message.slice(0, 57) + "..." : top.error_message;
    insights.push({
      category: "quality",
      message: `"${truncMsg}" has occurred ${top.occurrences}x in ${top.task_type}.`,
      suggestion: `Investigate the root cause. Use \`dojops memory add "fix: ..."\` to record the resolution.`,
    });
  }

  if (recurring.length >= 3) {
    insights.push({
      category: "quality",
      message: `${recurring.length} different error patterns are recurring.`,
      suggestion: "Run `dojops insights quality` to focus on quality issues.",
    });
  }

  // Check if there are resolved patterns that could help
  const resolved = patterns.filter((p) => p.resolution);
  if (resolved.length > 0 && unresolved.length > 0) {
    insights.push({
      category: "efficiency",
      message: `${resolved.length} error pattern(s) have resolutions but ${unresolved.length} remain unresolved.`,
      suggestion: "Past resolutions may apply to current errors — check error history.",
    });
  }

  // Surface module-specific failure concentrations
  const byModule = new Map<string, number>();
  for (const p of unresolved) {
    if (p.agent_or_module) {
      byModule.set(p.agent_or_module, (byModule.get(p.agent_or_module) ?? 0) + p.occurrences);
    }
  }
  for (const [mod, count] of byModule) {
    if (count >= 3) {
      insights.push({
        category: "quality",
        message: `Module "${mod}" has ${count} error occurrences across patterns.`,
        suggestion: `Check module compatibility or try a different model for ${mod} tasks.`,
      });
    }
  }
}

function analyzeMemoryUsage(rootDir: string, insights: Insight[]): void {
  let notes: { id: number }[];
  try {
    notes = listNotes(rootDir);
  } catch {
    return;
  }

  // Suggest using memory if no notes exist but there's error history
  if (notes.length === 0) {
    const errorPatterns = listErrorPatterns(rootDir);
    if (errorPatterns.length >= 2) {
      insights.push({
        category: "efficiency",
        message: `${errorPatterns.length} error patterns stored but no project notes.`,
        suggestion:
          "Use `dojops memory add` to record project conventions — they're injected into LLM context.",
      });
    }
  }
}
