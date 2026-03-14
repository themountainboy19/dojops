import { SkillRegistry } from "@dojops/skill-registry";
import { PlanState, getDojopsVersion } from "../state";

export interface ReplayMismatch {
  field: string;
  expected: string;
  actual: string;
  taskId?: string;
}

export interface ReplayValidationResult {
  mismatches: ReplayMismatch[];
  valid: boolean;
}

/**
 * Validates that the current environment matches the plan's execution context.
 * Used by `--replay` mode to ensure deterministic reproducibility.
 *
 * Checks:
 * 1. executionContext exists (fail if missing — legacy plan)
 * 2. provider matches
 * 3. model matches (if plan stored one)
 * 4. systemPromptHash matches for custom tool tasks
 */
/** Check execution context fields for mismatches. */
function checkContextMismatches(
  ctx: NonNullable<PlanState["executionContext"]>,
  currentProvider: string,
  currentModel: string | undefined,
  mismatches: ReplayMismatch[],
): void {
  if (ctx.provider !== currentProvider) {
    mismatches.push({ field: "provider", expected: ctx.provider, actual: currentProvider });
  }
  if (ctx.model && currentModel && ctx.model !== currentModel) {
    mismatches.push({ field: "model", expected: ctx.model, actual: currentModel });
  }
  if (ctx.dojopsVersion) {
    const currentVersion = getDojopsVersion();
    if (ctx.dojopsVersion !== currentVersion) {
      mismatches.push({
        field: "dojopsVersion",
        expected: ctx.dojopsVersion,
        actual: currentVersion,
      });
    }
  }
}

/** Check custom module system prompt hashes for mismatches. */
function checkToolPromptHashes(
  tasks: PlanState["tasks"],
  registry: SkillRegistry,
  mismatches: ReplayMismatch[],
): void {
  for (const task of tasks) {
    if (task.toolType !== "custom" || !task.systemPromptHash) continue;
    const metadata = registry.getSkillMetadata(task.tool);
    if (metadata?.toolType !== "custom" || !metadata.systemPromptHash) continue;
    if (task.systemPromptHash !== metadata.systemPromptHash) {
      mismatches.push({
        field: "systemPromptHash",
        expected: task.systemPromptHash.slice(0, 12),
        actual: metadata.systemPromptHash.slice(0, 12),
        taskId: task.id,
      });
    }
  }
}

export function validateReplayIntegrity(
  plan: PlanState,
  currentProvider: string,
  currentModel: string | undefined,
  registry: SkillRegistry,
): ReplayValidationResult {
  const mismatches: ReplayMismatch[] = [];

  if (!plan.executionContext) {
    mismatches.push({ field: "executionContext", expected: "(present)", actual: "(missing)" });
    return { mismatches, valid: false };
  }

  checkContextMismatches(plan.executionContext, currentProvider, currentModel, mismatches);
  checkToolPromptHashes(plan.tasks, registry, mismatches);

  return { mismatches, valid: mismatches.length === 0 };
}

/**
 * Checks module integrity for resume operations.
 * Verifies that modules referenced by tasks still exist.
 */
export function checkToolIntegrity(
  planTasks: PlanState["tasks"],
  currentTools: Array<{ name: string }>,
): { mismatches: string[]; hasMismatches: boolean } {
  const mismatches: string[] = [];

  for (const task of planTasks) {
    if (task.toolType !== "custom") continue;

    const currentTool = currentTools.find((t) => t.name === task.tool);
    if (!currentTool) {
      mismatches.push(`Skill "${task.tool}" no longer available (was v${task.toolVersion})`);
    }
  }

  return { mismatches, hasMismatches: mismatches.length > 0 };
}
