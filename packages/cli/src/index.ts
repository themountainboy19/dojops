#!/usr/bin/env node

// Suppress punycode deprecation warning from transitive dependencies (openai → tr46 → whatwg-url)
const originalEmitWarning = process.emitWarning;
process.emitWarning = (warning: string | Error, ...args: unknown[]) => {
  if (typeof warning === "string" && warning.includes("punycode")) return;
  if (warning instanceof Error && warning.message.includes("punycode")) return;
  (originalEmitWarning as (...a: unknown[]) => void).call(process, warning, ...args);
};

import "dotenv/config";
import pc from "picocolors";
import { LLMProvider } from "@odaops/core";
import {
  createProvider,
  createTools,
  createRouter,
  createDebugger,
  createDiffAnalyzer,
} from "@odaops/api";
import { decompose, PlannerExecutor } from "@odaops/planner";
import {
  SafeExecutor,
  AutoApproveHandler,
  CallbackApprovalHandler,
  ApprovalRequest,
} from "@odaops/executor";

function statusIcon(status: string): string {
  switch (status) {
    case "completed":
      return pc.green("*");
    case "failed":
      return pc.red("x");
    case "skipped":
      return pc.yellow("-");
    default:
      return pc.dim("?");
  }
}

function statusText(status: string): string {
  switch (status) {
    case "completed":
      return pc.green(status);
    case "failed":
      return pc.red(status);
    case "skipped":
      return pc.yellow(status);
    default:
      return pc.dim(status);
  }
}

function cliApprovalHandler(): CallbackApprovalHandler {
  return new CallbackApprovalHandler(async (request: ApprovalRequest) => {
    console.log(pc.yellow(`\n--- Approval Required ---`));
    console.log(`  ${pc.bold("Task:")}    ${request.taskId}`);
    console.log(`  ${pc.bold("Tool:")}    ${request.toolName}`);
    console.log(`  ${pc.bold("Summary:")} ${request.preview.summary}`);
    if (request.preview.filesCreated.length > 0) {
      console.log(`  ${pc.bold("Creates:")} ${request.preview.filesCreated.join(", ")}`);
    }
    if (request.preview.filesModified.length > 0) {
      console.log(`  ${pc.bold("Modifies:")} ${request.preview.filesModified.join(", ")}`);
    }
    console.log(pc.yellow(`--- Auto-approving (use --deny to block) ---\n`));
    return "approved";
  });
}

async function runPlan(
  prompt: string,
  provider: LLMProvider,
  execute: boolean,
  autoApprove: boolean,
) {
  const tools = createTools(provider);

  console.log(pc.cyan("Decomposing goal into tasks...\n"));
  const graph = await decompose(prompt, provider, tools);

  console.log(`${pc.bold("Goal:")} ${graph.goal}`);
  console.log(`${pc.bold("Tasks")} (${graph.tasks.length}):`);
  for (const task of graph.tasks) {
    const deps = task.dependsOn.length ? pc.dim(` (after: ${task.dependsOn.join(", ")})`) : "";
    console.log(`  ${pc.blue(task.id)} ${pc.bold(task.tool)}: ${task.description}${deps}`);
  }
  console.log();

  if (execute) {
    const safeExecutor = new SafeExecutor({
      policy: {
        allowWrite: true,
        requireApproval: !autoApprove,
        timeoutMs: 60_000,
      },
      approvalHandler: autoApprove ? new AutoApproveHandler() : cliApprovalHandler(),
    });

    const toolMap = new Map(tools.map((t) => [t.name, t]));

    const executor = new PlannerExecutor(tools, {
      taskStart(id, desc) {
        console.log(`${pc.cyan(">")} Running ${pc.blue(id)}: ${desc}`);
      },
      taskEnd(id, status, error) {
        if (error) {
          console.log(
            `  ${statusIcon(status)} ${pc.blue(id)}: ${statusText(status)} - ${pc.red(error)}`,
          );
        } else {
          console.log(`  ${statusIcon(status)} ${pc.blue(id)}: ${statusText(status)}`);
        }
      },
    });

    const planResult = await executor.execute(graph);

    console.log(pc.cyan(`\nExecuting approved tasks...`));
    for (const taskResult of planResult.results) {
      if (taskResult.status !== "completed") continue;

      const taskNode = graph.tasks.find((t) => t.id === taskResult.taskId);
      if (!taskNode) continue;

      const tool = toolMap.get(taskNode.tool);
      if (!tool?.execute) continue;

      const execResult = await safeExecutor.executeTask(taskResult.taskId, tool, taskNode.input);

      const approval =
        execResult.approval === "approved"
          ? pc.green(execResult.approval)
          : pc.yellow(execResult.approval);
      console.log(
        `  ${statusIcon(execResult.status)} ${pc.blue(execResult.taskId)} ${statusText(execResult.status)} (approval: ${approval})`,
      );
      if (execResult.error) {
        console.log(`    ${pc.red("Error:")} ${execResult.error}`);
      }
    }

    const auditLog = safeExecutor.getAuditLog();
    if (auditLog.length > 0) {
      console.log(pc.dim(`\nAudit log: ${auditLog.length} entries`));
    }

    if (planResult.success) {
      console.log(pc.green(pc.bold("\nPlan succeeded.")));
    } else {
      console.log(pc.red(pc.bold("\nPlan failed.")));
    }
  } else {
    const executor = new PlannerExecutor(tools, {
      taskStart(id, desc) {
        console.log(`${pc.cyan(">")} Running ${pc.blue(id)}: ${desc}`);
      },
      taskEnd(id, status, error) {
        if (error) {
          console.log(
            `  ${statusIcon(status)} ${pc.blue(id)}: ${statusText(status)} - ${pc.red(error)}`,
          );
        } else {
          console.log(`  ${statusIcon(status)} ${pc.blue(id)}: ${statusText(status)}`);
        }
      },
    });

    const result = await executor.execute(graph);

    if (result.success) {
      console.log(pc.green(pc.bold("\nPlan succeeded.")));
    } else {
      console.log(pc.red(pc.bold("\nPlan failed.")));
    }
    for (const r of result.results) {
      const errMsg = r.error ? `: ${pc.red(r.error)}` : "";
      console.log(
        `  ${statusIcon(r.status)} ${pc.blue(r.taskId)} ${statusText(r.status)}${errMsg}`,
      );
    }

    // Print generated output for completed tasks
    const completedResults = result.results.filter((r) => r.status === "completed" && r.output);
    if (completedResults.length > 0) {
      console.log(pc.cyan(pc.bold("\n--- Generated Output ---\n")));
      for (const r of completedResults) {
        const task = graph.tasks.find((t) => t.id === r.taskId);
        const data = r.output as Record<string, unknown>;

        console.log(pc.bold(`[${r.taskId}] ${task?.tool ?? "unknown"}`));

        // Show what files would be created with --execute
        const input = task?.input as Record<string, string> | undefined;
        const basePath = input?.projectPath ?? input?.outputPath ?? ".";

        if (data.hcl) {
          console.log(`  ${pc.green("Would write:")} ${pc.underline(`${basePath}/main.tf`)}`);
          console.log(formatOutput(data.hcl as string));
        }
        if (data.yaml) {
          const fileName = getOutputFileName(task?.tool ?? "");
          console.log(`  ${pc.green("Would write:")} ${pc.underline(`${basePath}/${fileName}`)}`);
          console.log(formatOutput(data.yaml as string));
        }
        if (data.chartYaml) {
          console.log(`  ${pc.green("Would write:")} ${pc.underline(`${basePath}/Chart.yaml`)}`);
          console.log(formatOutput(data.chartYaml as string));
        }
        if (data.valuesYaml) {
          console.log(`  ${pc.green("Would write:")} ${pc.underline(`${basePath}/values.yaml`)}`);
          console.log(formatOutput(data.valuesYaml as string));
        }
      }
      console.log(pc.dim("To write these files to disk, use --execute instead of --plan"));
    }
  }
}

async function runDebugCI(logContent: string, provider: LLMProvider) {
  const debugger_ = createDebugger(provider);

  console.log(pc.cyan("Analyzing CI log...\n"));
  const diagnosis = await debugger_.diagnose(logContent);

  console.log(`${pc.bold("Error Type:")}  ${pc.red(diagnosis.errorType)}`);
  console.log(`${pc.bold("Summary:")}     ${diagnosis.summary}`);
  console.log(`${pc.bold("Root Cause:")}  ${diagnosis.rootCause}`);
  console.log(`${pc.bold("Confidence:")}  ${formatConfidence(diagnosis.confidence)}`);

  if (diagnosis.affectedFiles.length > 0) {
    console.log(pc.bold(`\nAffected Files:`));
    for (const f of diagnosis.affectedFiles) {
      console.log(`  ${pc.dim("-")} ${pc.underline(f)}`);
    }
  }

  if (diagnosis.suggestedFixes.length > 0) {
    console.log(pc.bold(`\nSuggested Fixes:`));
    for (const fix of diagnosis.suggestedFixes) {
      console.log(`  ${formatConfidence(fix.confidence)} ${fix.description}`);
      if (fix.command) console.log(`       ${pc.dim("$")} ${pc.cyan(fix.command)}`);
      if (fix.file) console.log(`       ${pc.dim("File:")} ${pc.underline(fix.file)}`);
    }
  }
}

async function runDiff(diffContent: string, provider: LLMProvider) {
  const analyzer = createDiffAnalyzer(provider);

  console.log(pc.cyan("Analyzing infrastructure diff...\n"));
  const analysis = await analyzer.analyze(diffContent);

  console.log(`${pc.bold("Summary:")}     ${analysis.summary}`);
  console.log(`${pc.bold("Risk Level:")}  ${riskColor(analysis.riskLevel)}`);
  console.log(
    `${pc.bold("Cost Impact:")} ${analysis.costImpact.direction} — ${analysis.costImpact.details}`,
  );
  console.log(`${pc.bold("Rollback:")}    ${analysis.rollbackComplexity}`);
  console.log(`${pc.bold("Confidence:")}  ${formatConfidence(analysis.confidence)}`);

  if (analysis.changes.length > 0) {
    console.log(pc.bold(`\nChanges (${analysis.changes.length}):`));
    for (const change of analysis.changes) {
      const detail = change.attribute ? pc.dim(` (${change.attribute})`) : "";
      const action = changeColor(change.action.toUpperCase());
      console.log(`  ${action} ${change.resource}${detail}`);
    }
  }

  if (analysis.riskFactors.length > 0) {
    console.log(pc.bold(`\nRisk Factors:`));
    for (const r of analysis.riskFactors) {
      console.log(`  ${pc.yellow("-")} ${r}`);
    }
  }

  if (analysis.securityImpact.length > 0) {
    console.log(pc.bold(`\nSecurity Impact:`));
    for (const s of analysis.securityImpact) {
      console.log(`  ${pc.red("-")} ${s}`);
    }
  }

  if (analysis.recommendations.length > 0) {
    console.log(pc.bold(`\nRecommendations:`));
    for (const rec of analysis.recommendations) {
      console.log(`  ${pc.blue("-")} ${rec}`);
    }
  }
}

async function runServe(args: string[]) {
  const portArg = args.find((a) => a.startsWith("--port="));
  const port = portArg
    ? parseInt(portArg.split("=")[1], 10)
    : parseInt(process.env.ODA_API_PORT ?? "3000", 10);

  const { createApp, HistoryStore } = await import("@odaops/api");

  const provider = createProvider();
  const tools = createTools(provider);
  const router = createRouter(provider);
  const debugger_ = createDebugger(provider);
  const diffAnalyzer = createDiffAnalyzer(provider);
  const store = new HistoryStore();

  const app = createApp({
    provider,
    tools,
    router,
    debugger: debugger_,
    diffAnalyzer,
    store,
  });

  app.listen(port, () => {
    console.log(pc.green(pc.bold(`ODA API server running on http://localhost:${port}`)));
    console.log(`${pc.bold("Provider:")}  ${provider.name}`);
    console.log(`${pc.bold("Tools:")}     ${tools.map((t) => t.name).join(", ")}`);
    console.log(`${pc.bold("Dashboard:")} ${pc.underline(`http://localhost:${port}`)}`);
  });
}

function formatOutput(content: string): string {
  const lines = content.split("\n");
  const preview = lines.slice(0, 20);
  const formatted = preview.map((l) => `    ${pc.dim(l)}`).join("\n");
  if (lines.length > 20) {
    return `${formatted}\n    ${pc.dim(`... (${lines.length - 20} more lines)`)}`;
  }
  return formatted;
}

function getOutputFileName(tool: string): string {
  switch (tool) {
    case "github-actions":
      return ".github/workflows/ci.yml";
    case "kubernetes":
      return "manifests.yml";
    case "ansible":
      return "playbook.yml";
    default:
      return "output.yml";
  }
}

function formatConfidence(confidence: number): string {
  const pct = (confidence * 100).toFixed(0);
  if (confidence >= 0.8) return pc.green(`${pct}%`);
  if (confidence >= 0.5) return pc.yellow(`${pct}%`);
  return pc.red(`${pct}%`);
}

function riskColor(level: string): string {
  switch (level) {
    case "low":
      return pc.green(level);
    case "medium":
      return pc.yellow(level);
    case "high":
    case "critical":
      return pc.red(level);
    default:
      return level;
  }
}

function changeColor(action: string): string {
  switch (action) {
    case "CREATE":
      return pc.green(action);
    case "UPDATE":
    case "MODIFY":
      return pc.yellow(action);
    case "DELETE":
    case "DESTROY":
      return pc.red(action);
    default:
      return action;
  }
}

function printHelp() {
  console.log(pc.bold("Usage:") + " oda [command] [options] <prompt>");
  console.log();
  console.log(pc.bold("Commands:"));
  console.log(`  ${pc.cyan("serve")}          Start API server + web dashboard`);
  console.log(`  ${pc.cyan("<prompt>")}       Run agent on prompt (default)`);
  console.log();
  console.log(pc.bold("Options:"));
  console.log(`  ${pc.cyan("--model=NAME")}   LLM model to use (overrides ODA_MODEL env)`);
  console.log(`  ${pc.cyan("--plan")}         Decompose into task graph and run generate phase`);
  console.log(`  ${pc.cyan("--execute")}      Also run execute phase with approval workflow`);
  console.log(`  ${pc.cyan("--yes")}          Auto-approve all execution (skip approval prompts)`);
  console.log(`  ${pc.cyan("--debug-ci")}     Analyze CI log output and diagnose failures`);
  console.log(`  ${pc.cyan("--diff")}         Analyze infrastructure diff for risk and impact`);
  console.log(`  ${pc.cyan("--port=N")}       Port for serve command (default: 3000)`);
  console.log(`  ${pc.cyan("--help")}         Show this help message`);
  console.log();
  console.log(pc.bold("Models (examples):"));
  console.log(`  ${pc.dim("OpenAI:")}    gpt-4o, gpt-4o-mini (default)`);
  console.log(
    `  ${pc.dim("Anthropic:")} claude-sonnet-4-5-20250929 (default), claude-haiku-4-5-20251001`,
  );
  console.log(`  ${pc.dim("Ollama:")}    llama3 (default), mistral, codellama`);
  console.log();
  console.log(pc.bold("Examples:"));
  console.log(`  ${pc.dim("$")} oda "Create a Terraform config for S3"`);
  console.log(`  ${pc.dim("$")} oda --model=gpt-4o "Create a Terraform config for S3"`);
  console.log(`  ${pc.dim("$")} oda --plan "Set up CI/CD for a Node.js app"`);
  console.log(`  ${pc.dim("$")} oda --execute --yes "Create CI for Node app"`);
  console.log(`  ${pc.dim("$")} oda --debug-ci "ERROR: tsc failed..."`);
  console.log(`  ${pc.dim("$")} oda --diff "terraform plan output..."`);
  console.log(`  ${pc.dim("$")} oda serve`);
  console.log(`  ${pc.dim("$")} oda serve --port=8080`);
}

function applyModelFlag(args: string[]): void {
  const modelArg = args.find((a) => a.startsWith("--model="));
  if (modelArg) {
    process.env.ODA_MODEL = modelArg.split("=")[1];
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  applyModelFlag(args);

  // Serve subcommand
  if (args[0] === "serve") {
    await runServe(args.slice(1));
    return;
  }

  const provider = createProvider();

  const planMode = args.includes("--plan");
  const executeMode = args.includes("--execute");
  const autoApprove = args.includes("--yes");
  const debugCI = args.includes("--debug-ci");
  const diffMode = args.includes("--diff");
  const flags = ["--plan", "--execute", "--yes", "--debug-ci", "--diff"];
  const prompt = args.filter((a) => !flags.includes(a) && !a.startsWith("--model=")).join(" ");

  if (!prompt) {
    printHelp();
    process.exit(1);
  }

  if (debugCI) {
    await runDebugCI(prompt, provider);
  } else if (diffMode) {
    await runDiff(prompt, provider);
  } else if (planMode || executeMode) {
    await runPlan(prompt, provider, executeMode, autoApprove);
  } else {
    // Multi-agent routing: pick the best specialist for the prompt
    const router = createRouter(provider);
    const route = router.route(prompt);

    if (route.confidence > 0) {
      console.log(pc.dim(`[Routed to ${pc.bold(route.agent.name)} — ${route.reason}]\n`));
    }

    const result = await route.agent.run({ prompt });
    console.log(result.content);
  }
}

main();
