import pc from "picocolors";
import * as p from "@clack/prompts";
import { AGENT_TOOLS } from "@dojops/core";
import type { ToolCall } from "@dojops/core";
import { ToolExecutor } from "@dojops/executor";
import { AgentLoop } from "@dojops/session";
import { createTools } from "@dojops/api";
import { CLIContext } from "../types";
import { stripFlags, extractFlagValue } from "../parser";
import { ExitCode, CLIError } from "../exit-codes";
import { readPromptFile } from "../stdin";
import { findProjectRoot } from "../state";

/** Summarize tool call arguments for display. */
function summarizeArgs(call: ToolCall): string {
  if (call.name === "read_file" || call.name === "write_file" || call.name === "edit_file") {
    return pc.dim(call.arguments.path as string);
  }
  if (call.name === "run_command") {
    const cmd = call.arguments.command as string;
    return pc.dim(cmd.length > 60 ? cmd.slice(0, 57) + "..." : cmd);
  }
  if (call.name === "run_skill") {
    return pc.dim(call.arguments.skill as string);
  }
  if (call.name === "search_files") {
    return pc.dim(
      (call.arguments.pattern as string) || (call.arguments.content_pattern as string) || "",
    );
  }
  if (call.name === "done") {
    return pc.dim("completing...");
  }
  return "";
}

/** Build the system prompt for autonomous agent mode. */
function buildAutoSystemPrompt(cwd: string): string {
  return `You are DojOps, an autonomous DevOps AI agent. You operate in the directory: ${cwd}

CRITICAL: You MUST use tools to complete tasks. NEVER output file contents as text in your response.
When the task requires creating or modifying files, you MUST call write_file or edit_file.
When the task requires running commands, you MUST call run_command.
Text-only responses are NOT acceptable when the user asks you to create, modify, or generate anything.

Workflow:
1. Use search_files and read_file to understand the project structure
2. Create files with write_file or modify them with edit_file
3. Run commands (build, test, lint, validate) to verify your changes
4. Use run_skill for generating DevOps configurations (Terraform, Dockerfile, CI/CD, Helm, K8s, etc.)
5. Call "done" with a summary when the task is complete

Rules:
- Always read relevant files before making changes
- Prefer edit_file over write_file for modifying existing files
- Create directories with run_command (mkdir -p) before writing files into them
- Be precise with edits: old_string must match the file content exactly
- If a command fails, read the error output and adapt your approach
- Verify your changes work by running build/test/lint commands
- Call "done" when finished, with a clear summary of what was created or changed`;
}

/**
 * Autonomous agent mode: iterative tool-use loop (ReAct pattern).
 * The LLM reads files, makes changes, runs commands, and verifies — all autonomously.
 *
 * Usage: dojops auto "Create CI for Node app"
 */
export async function autoCommand(args: string[], ctx: CLIContext): Promise<void> {
  const inlinePrompt = stripFlags(
    args,
    new Set(["--skip-verify", "--force", "--allow-all-paths", "--commit"]),
    new Set(["--timeout", "--repair-attempts", "--max-iterations"]),
  ).join(" ");

  // Build prompt: file content + inline args (same pattern as plan command)
  let prompt = inlinePrompt;
  if (ctx.globalOpts.file) {
    const fileContent = readPromptFile(ctx.globalOpts.file);
    prompt = inlinePrompt ? `${inlinePrompt}\n\n${fileContent}` : fileContent;
  }

  if (!prompt) {
    p.log.info(`  ${pc.dim("$")} dojops auto <prompt>`);
    p.log.info(`  ${pc.dim("$")} dojops auto -f prompt.md`);
    throw new CLIError(ExitCode.VALIDATION_ERROR, "No prompt provided.");
  }

  const maxIterations = Number.parseInt(extractFlagValue(args, "--max-iterations") ?? "20", 10);

  p.log.info(
    `${pc.bold(pc.cyan("Autonomous agent mode"))} — iterative tool-use (max ${maxIterations} iterations)`,
  );

  const provider = ctx.getProvider();
  const cwd = ctx.cwd;

  // Load skills for the run_skill tool
  const rootDir = findProjectRoot(cwd);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let skillsMap = new Map<string, any>();
  try {
    const skills = await createTools(provider, rootDir ?? cwd);
    skillsMap = new Map(skills.map((s) => [s.name, s]));
    if (skills.length > 0) {
      p.log.info(pc.dim(`Loaded ${skills.length} skills: ${skills.map((s) => s.name).join(", ")}`));
    }
  } catch {
    // Skills loading is optional — agent can still read/write/run commands
  }

  const toolExecutor = new ToolExecutor({
    policy: {
      allowWrite: true,
      allowedWritePaths: [cwd],
      deniedWritePaths: [],
      enforceDevOpsAllowlist: false,
      allowNetwork: false,
      allowEnvVars: [],
      timeoutMs: 30_000,
      maxFileSizeBytes: 1_048_576,
      requireApproval: false,
      skipVerification: false,
      maxVerifyRetries: 0,
      approvalMode: "never",
      autoApproveRiskLevel: "MEDIUM",
      maxRepairAttempts: 0,
    },
    cwd,
    skills: skillsMap,
    onToolStart: (call) => {
      p.log.step(`${pc.cyan(call.name)} ${summarizeArgs(call)}`);
    },
    onToolEnd: (call, result) => {
      if (result.isError) {
        p.log.warn(pc.dim(`  ✗ ${result.output.split("\n")[0]}`));
      }
    },
  });

  const loop = new AgentLoop({
    provider,
    toolExecutor,
    tools: AGENT_TOOLS,
    systemPrompt: buildAutoSystemPrompt(cwd),
    maxIterations,
    onThinking: (text) => {
      if (text) {
        // Skip raw JSON output (e.g. LLM returning tool calls as text)
        const trimmed = text.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) return;
        const firstLine = trimmed.split("\n")[0];
        if (firstLine.length > 0) {
          p.log.info(pc.dim(firstLine.length > 100 ? firstLine.slice(0, 97) + "..." : firstLine));
        }
      }
    },
  });

  const s = p.spinner();
  s.start("Agent working...");

  try {
    const result = await loop.run(prompt);
    s.stop(result.success ? pc.green("Done") : pc.yellow("Stopped"));

    // Display summary
    console.log();
    p.log.message(result.summary);

    // Display file changes (relative to cwd for readability)
    const rel = (f: string) => (f.startsWith(cwd) ? f.slice(cwd.length + 1) : f);
    if (result.filesWritten.length > 0) {
      p.log.success(`Created: ${result.filesWritten.map((f) => pc.green(rel(f))).join(", ")}`);
    }
    if (result.filesModified.length > 0) {
      p.log.success(`Modified: ${result.filesModified.map((f) => pc.yellow(rel(f))).join(", ")}`);
    }

    // Display stats
    p.log.info(
      pc.dim(
        `${result.iterations} iterations · ${result.toolCalls.length} tool calls · ${result.totalTokens.toLocaleString()} tokens`,
      ),
    );
  } catch (err) {
    s.stop("Error");
    const message = err instanceof Error ? err.message : String(err);
    throw new CLIError(ExitCode.GENERAL_ERROR, message);
  }
}
