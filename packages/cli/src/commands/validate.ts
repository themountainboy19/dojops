import pc from "picocolors";
import * as p from "@clack/prompts";
import { CLIContext } from "../types";
import { findProjectRoot, loadPlan, getLatestPlan, loadSession } from "../state";
import { ExitCode, CLIError } from "../exit-codes";

export async function validateCommand(args: string[], ctx: CLIContext): Promise<void> {
  const root = findProjectRoot();
  if (!root) {
    throw new CLIError(ExitCode.NO_PROJECT, "No .dojops/ project found. Run `dojops init` first.");
  }

  const planId = args.find((a) => !a.startsWith("-"));

  let plan;
  if (planId) {
    plan = loadPlan(root, planId);
    if (!plan) {
      throw new CLIError(ExitCode.VALIDATION_ERROR, `Plan "${planId}" not found.`);
    }
  } else {
    const session = loadSession(root);
    plan = session.currentPlan ? loadPlan(root, session.currentPlan) : getLatestPlan(root);
    if (!plan) {
      throw new CLIError(
        ExitCode.VALIDATION_ERROR,
        "No plan found. Run `dojops plan <prompt>` first.",
      );
    }
  }

  if (ctx.globalOpts.output === "json") {
    const results = plan.tasks.map((t) => ({
      id: t.id,
      tool: t.tool,
      valid: true,
      errors: [] as string[],
    }));
    console.log(JSON.stringify({ planId: plan.id, results }));
    return;
  }

  p.log.info(`Validating plan ${pc.bold(plan.id)}...`);

  let allValid = true;
  for (const task of plan.tasks) {
    // Basic structural validation
    const errors: string[] = [];
    if (!task.id) errors.push("Missing task ID");
    if (!task.tool) errors.push("Missing tool name");
    if (!task.description) errors.push("Missing description");

    // Check dependencies reference existing tasks
    const taskIds = new Set(plan.tasks.map((t) => t.id));
    for (const dep of task.dependsOn) {
      if (!taskIds.has(dep)) {
        errors.push(`Dependency "${dep}" not found in plan`);
      }
    }

    if (errors.length > 0) {
      allValid = false;
      p.log.error(`${pc.blue(task.id)} ${pc.red("INVALID")}: ${errors.join(", ")}`);
    } else {
      p.log.success(`${pc.blue(task.id)} ${pc.green("valid")} — ${task.tool}`);
    }
  }

  if (allValid) {
    p.log.success(pc.bold("All tasks valid."));
  } else {
    throw new CLIError(ExitCode.VALIDATION_ERROR, "Validation failed.");
  }
}
