import fs from "node:fs";
import pc from "picocolors";
import * as p from "@clack/prompts";
import { createRouter } from "@dojops/api";
import {
  ChatSession,
  buildSessionContext,
  saveSession as saveChatSession,
  listSessions as listChatSessions,
  generateSessionId,
} from "@dojops/session";
import type { ChatSessionState, SessionMode } from "@dojops/session";
import { CLIContext } from "../types";
import { findProjectRoot } from "../state";
import { extractFlagValue, hasFlag } from "../parser";
import { ExitCode, CLIError, toErrorMessage } from "../exit-codes";
import { renderHeader, renderTurnStats, getTermWidth } from "../tui/status-bar";
import type { StatusBarState, TurnStats } from "../tui/status-bar";
import { highlightCodeBlocks } from "../tui/code-highlight";

type DocAugmenter = { augmentPrompt(s: string, kw: string[], q: string): Promise<string> };

async function loadDocAugmenter(): Promise<DocAugmenter | undefined> {
  if (process.env.DOJOPS_CONTEXT_ENABLED === "false") return undefined;
  try {
    const { createDocAugmenter } = await import("@dojops/context");
    return createDocAugmenter({ apiKey: process.env.DOJOPS_CONTEXT7_API_KEY });
  } catch {
    return undefined;
  }
}

function resolveResumeSession(
  rootDir: string,
  sessionName: string | undefined,
): ChatSessionState | undefined {
  const sessions = listChatSessions(rootDir);
  if (sessionName) {
    const state = sessions.find((s) => s.name === sessionName || s.id === sessionName) ?? undefined;
    if (!state) {
      throw new CLIError(ExitCode.VALIDATION_ERROR, `Session "${sessionName}" not found.`);
    }
    p.log.info(`Resuming session ${pc.cyan(state.name ?? state.id)}`);
    return state;
  }
  if (sessions.length > 0) {
    p.log.info(`Resuming session ${pc.cyan(sessions[0].id)}`);
    return sessions[0];
  }
  p.log.warn("No sessions found to resume.");
  return undefined;
}

function resolveNamedSession(
  rootDir: string,
  sessionName: string,
  deterministic: boolean,
): ChatSessionState {
  const sessions = listChatSessions(rootDir);
  const existing = sessions.find((s) => s.name === sessionName) ?? undefined;
  if (existing) {
    p.log.info(`Resuming session ${pc.cyan(sessionName)} (${existing.id})`);
    return existing;
  }
  return {
    id: generateSessionId(),
    name: sessionName,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    mode: deterministic ? "DETERMINISTIC" : "INTERACTIVE",
    messages: [],
    metadata: { totalTokensEstimate: 0, messageCount: 0 },
  };
}

function resolveSessionState(
  rootDir: string,
  resumeFlag: boolean,
  sessionName: string | undefined,
  deterministic: boolean,
): ChatSessionState | undefined {
  if (resumeFlag) return resolveResumeSession(rootDir, sessionName);
  if (sessionName) return resolveNamedSession(rootDir, sessionName, deterministic);
  return undefined;
}

function validateAgentFlag(session: ChatSession, agentFlag: string): void {
  try {
    session.pinAgent(agentFlag);
  } catch (err) {
    throw new CLIError(ExitCode.VALIDATION_ERROR, (err as Error).message);
  }
}

const formatError = toErrorMessage;

// ── Status bar state ────────────────────────────────────────────

function buildStatusBarState(
  session: ChatSession,
  ctx: CLIContext,
  streaming: boolean,
): StatusBarState {
  const state = session.getState();
  return {
    sessionId: state.id,
    sessionName: state.name,
    agent: state.pinnedAgent ?? "auto-route",
    model: ctx.globalOpts.model ?? process.env.DOJOPS_MODEL ?? "(default)",
    provider: ctx.globalOpts.provider ?? process.env.DOJOPS_PROVIDER ?? "openai",
    tokenEstimate: state.metadata.totalTokensEstimate,
    messageCount: state.metadata.messageCount,
    mode: state.mode,
    streaming,
  };
}

// ── Single message mode ─────────────────────────────────────────

async function sendSingleMessage(
  session: ChatSession,
  messageFlag: string,
  isStructuredOutput: boolean,
  ctx: CLIContext,
): Promise<void> {
  const model = ctx.globalOpts.model ?? process.env.DOJOPS_MODEL ?? "(default)";
  const s = p.spinner();
  const startTime = Date.now();
  if (!isStructuredOutput) s.start("Thinking...");
  try {
    const result = await session.send(messageFlag);
    const durationMs = Date.now() - startTime;
    if (!isStructuredOutput) {
      s.stop(pc.green("Done"));
    }
    displaySingleResult(result, isStructuredOutput);
    if (!isStructuredOutput) {
      const turnStats: TurnStats = {
        agent: result.agent,
        durationMs,
        usage: result.usage,
        sessionTokens: result.sessionTokens,
        model,
      };
      process.stdout.write(`${renderTurnStats(turnStats)}\n`);
    }
  } catch (err) {
    if (!isStructuredOutput) s.stop("Error");
    p.log.error(formatError(err));
  }
}

function displaySingleResult(
  result: { agent: string; content: string },
  isStructuredOutput: boolean,
): void {
  if (isStructuredOutput) {
    console.log(JSON.stringify({ agent: result.agent, content: result.content }));
    return;
  }
  p.log.message(highlightCodeBlocks(result.content));
}

async function handleSingleMessage(
  session: ChatSession,
  messageFlag: string,
  rootDir: string,
  ctx: CLIContext,
): Promise<void> {
  const isStructuredOutput = ctx.globalOpts.output === "json" || ctx.globalOpts.output === "yaml";
  await sendSingleMessage(session, messageFlag, isStructuredOutput, ctx);
  saveChatSession(rootDir, session.getState());
  if (ctx.globalOpts.output !== "json") {
    p.log.info(pc.dim(`Session: ${session.id}`));
  }
}

// ── TUI Welcome ─────────────────────────────────────────────────

function showWelcome(session: ChatSession, ctx: CLIContext, contextInfo: unknown): void {
  p.intro(pc.bold(pc.cyan("DojOps Interactive Chat")));

  // Rich header bar
  const barState = buildStatusBarState(session, ctx, false);
  console.log(renderHeader(barState));

  const sessionState = session.getState();
  const msgCount = sessionState.messages.length;

  // Status indicators
  const indicators: string[] = [];
  if (msgCount > 0) indicators.push(`${pc.green("●")} ${pc.dim(`History: ${msgCount} messages`)}`);
  if (contextInfo) indicators.push(`${pc.green("●")} ${pc.dim("Project context loaded")}`);
  if (indicators.length > 0) p.log.message(indicators.join("  "));

  // Commands in a compact layout
  const cmds = [
    pc.cyan("/exit"),
    pc.cyan("/agent") + pc.dim(" <name>"),
    pc.cyan("/model"),
    pc.cyan("/sessions"),
    pc.cyan("/status"),
    pc.cyan("/history"),
    pc.cyan("/clear"),
    pc.cyan("/save"),
    pc.cyan("/plan"),
    pc.cyan("/apply"),
    pc.cyan("/scan"),
  ];
  p.log.message(pc.dim("Commands: ") + cmds.join(pc.dim("  ")));
}

// ── Slash command handlers ──────────────────────────────────────

function handleHistoryCommand(session: ChatSession): void {
  const msgs = session.messages;
  if (msgs.length === 0) {
    p.log.info("No messages in this session.");
    return;
  }
  for (const msg of msgs.slice(-20)) {
    const role = msg.role === "user" ? pc.cyan("You") : pc.green("Agent");
    const time = pc.dim(new Date(msg.timestamp).toLocaleTimeString());
    p.log.message(`${role} ${time}\n${highlightCodeBlocks(msg.content)}`);
  }
}

function handleAgentCommand(session: ChatSession, trimmed: string): void {
  const agentName = trimmed.slice(7).trim();
  if (agentName === "auto") {
    session.unpinAgent();
    p.log.info("Agent unpinned — auto-routing enabled.");
    return;
  }
  try {
    session.pinAgent(agentName);
    p.log.info(`Agent pinned to ${pc.cyan(agentName)}`);
  } catch (err) {
    p.log.error((err as Error).message);
  }
}

function handleStatusCommand(session: ChatSession, ctx: CLIContext): void {
  const barState = buildStatusBarState(session, ctx, false);
  console.log(renderHeader(barState));
}

async function handleModelCommand(ctx: CLIContext): Promise<void> {
  const provider = ctx.getProvider();
  if (!provider.listModels) {
    p.log.warn("Current provider does not support model listing.");
    return;
  }

  const s = p.spinner();
  s.start("Fetching available models...");

  try {
    const models = await provider.listModels();
    s.stop(`${models.length} models available`);

    if (models.length === 0) {
      p.log.info("No models returned by provider.");
      return;
    }

    const selected = await p.select({
      message: "Select a model:",
      options: models.slice(0, 20).map((m) => ({ value: m, label: m })),
    });

    if (p.isCancel(selected)) return;

    // Update model in context for subsequent commands
    ctx.globalOpts.model = selected as string;
    process.env.DOJOPS_MODEL = selected as string;
    p.log.success(`Model switched to ${pc.yellow(selected as string)}`);
  } catch (err) {
    s.stop("Error");
    p.log.error(formatError(err));
  }
}

function handleSessionsCommand(rootDir: string): void {
  const sessions = listChatSessions(rootDir);
  if (sessions.length === 0) {
    p.log.info("No saved sessions.");
    return;
  }

  const lines = sessions.slice(0, 15).map((s, i) => {
    const name = s.name ? pc.cyan(s.name) : pc.dim(s.id.slice(0, 12));
    const msgs = `${s.metadata.messageCount} msgs`;
    const time = pc.dim(new Date(s.updatedAt).toLocaleDateString());
    const agent = s.metadata.lastAgentUsed ? pc.magenta(s.metadata.lastAgentUsed) : "";
    const marker = i === 0 ? pc.green(" (latest)") : "";
    return `  ${name}  ${msgs}  ${agent}  ${time}${marker}`;
  });

  p.log.info(`Sessions (${sessions.length}):\n${lines.join("\n")}`);
  p.log.info(pc.dim("Resume with: dojops chat --resume --session <name|id>"));
}

function logCommandError(err: unknown): void {
  p.log.error(formatError(err));
}

async function handlePlanCommand(
  trimmed: string,
  rootDir: string,
  session: ChatSession,
  ctx: CLIContext,
): Promise<void> {
  const goal = trimmed.slice(6).trim();
  if (!goal) {
    p.log.warn("Usage: /plan <goal>");
    return;
  }
  saveChatSession(rootDir, session.getState());
  try {
    const { planCommand } = await import("./plan");
    await planCommand([goal], ctx);
  } catch (err) {
    logCommandError(err);
  }
}

async function handleApplyCommand(
  trimmed: string,
  rootDir: string,
  session: ChatSession,
  ctx: CLIContext,
): Promise<void> {
  const planId = trimmed.slice(7).trim() || undefined;
  saveChatSession(rootDir, session.getState());
  try {
    const { applyCommand } = await import("./apply");
    const applyArgs: string[] = [];
    if (planId) applyArgs.push(planId);
    await applyCommand(applyArgs, ctx);
  } catch (err) {
    logCommandError(err);
  }
}

async function handleScanCommand(
  trimmed: string,
  rootDir: string,
  session: ChatSession,
  ctx: CLIContext,
): Promise<void> {
  const scanArgs = trimmed.slice(6).trim().split(/\s+/).filter(Boolean);
  saveChatSession(rootDir, session.getState());
  try {
    const { scanCommand } = await import("./scan");
    await scanCommand(scanArgs, ctx);
  } catch (err) {
    logCommandError(err);
  }
}

// ── Streaming message handler ───────────────────────────────────

async function handleSendMessage(
  session: ChatSession,
  trimmed: string,
  ctx: CLIContext,
): Promise<void> {
  const model = ctx.globalOpts.model ?? process.env.DOJOPS_MODEL ?? "(default)";
  const provider = ctx.globalOpts.provider ?? process.env.DOJOPS_PROVIDER ?? "openai";

  try {
    const startTime = Date.now();

    // Step 1: Show routing
    process.stdout.write(
      `\n${pc.dim("○")} ${pc.dim("Routing query")} ${pc.dim("→")} ${pc.yellow(provider)}${pc.dim("/")}${pc.yellow(model)}\n`,
    );

    // Step 2: Start streaming
    let firstChunk = true;

    const result = await session.sendStream(trimmed, (chunk: string) => {
      if (firstChunk) {
        // Show which agent was selected once streaming begins
        process.stdout.write(
          `${pc.dim("○")} ${pc.dim("Agent")} ${pc.magenta("...")} ${pc.dim("generating")}\n\n`,
        );
        firstChunk = false;
      }
      process.stdout.write(chunk);
    });

    if (!firstChunk) {
      // Had streaming output
      process.stdout.write("\n");
    }

    const durationMs = Date.now() - startTime;

    // Step 3: Show completion with agent info
    process.stdout.write(
      `\n${pc.green("●")} ${pc.dim("Completed via")} ${pc.magenta(result.agent)}\n`,
    );

    // Render per-turn stats
    const turnStats: TurnStats = {
      agent: result.agent,
      durationMs,
      usage: result.usage,
      sessionTokens: result.sessionTokens,
      model,
    };
    process.stdout.write(`${renderTurnStats(turnStats)}\n`);

    // Context warning for large sessions
    if (result.sessionTokens > 100_000) {
      p.log.warn(
        pc.yellow(
          `Context: ~${Math.round(result.sessionTokens / 1000)}K tokens. Consider /clear or start a new session.`,
        ),
      );
    }
  } catch (err) {
    p.log.error(formatError(err));
  }
}

// ── Slash command router ────────────────────────────────────────

async function handleSlashCommand(
  trimmed: string,
  session: ChatSession,
  rootDir: string,
  ctx: CLIContext,
): Promise<boolean> {
  if (trimmed === "/history") {
    handleHistoryCommand(session);
    return true;
  }
  if (trimmed === "/clear") {
    session.clearMessages();
    p.log.success("Session messages cleared.");
    return true;
  }
  if (trimmed === "/save") {
    saveChatSession(rootDir, session.getState());
    p.log.success(`Session saved: ${session.id}`);
    return true;
  }
  if (trimmed === "/status") {
    handleStatusCommand(session, ctx);
    return true;
  }
  if (trimmed === "/model") {
    await handleModelCommand(ctx);
    return true;
  }
  if (trimmed === "/sessions") {
    handleSessionsCommand(rootDir);
    return true;
  }
  if (trimmed.startsWith("/agent ")) {
    handleAgentCommand(session, trimmed);
    return true;
  }
  if (trimmed.startsWith("/plan ")) {
    await handlePlanCommand(trimmed, rootDir, session, ctx);
    return true;
  }
  if (trimmed === "/apply" || trimmed.startsWith("/apply ")) {
    await handleApplyCommand(trimmed, rootDir, session, ctx);
    return true;
  }
  if (trimmed === "/scan" || trimmed.startsWith("/scan ")) {
    await handleScanCommand(trimmed, rootDir, session, ctx);
    return true;
  }
  return false;
}

// ── Interactive loop ────────────────────────────────────────────

function showGoodbye(session: ChatSession): void {
  const state = session.getState();
  const msgCount = state.metadata.messageCount;
  const tokens = state.metadata.totalTokensEstimate;
  const width = getTermWidth();
  const divider = pc.dim("─".repeat(Math.min(width, 80)));

  console.log(`\n${divider}`);
  console.log(`${pc.cyan("Session saved")} ${pc.dim(state.name ?? state.id)}`);

  const stats: string[] = [];
  if (msgCount > 0) stats.push(`${msgCount} messages`);
  if (tokens > 0) stats.push(`~${Math.round(tokens / 1000)}K tokens`);
  if (state.metadata.lastAgentUsed) stats.push(`last agent: ${state.metadata.lastAgentUsed}`);
  if (stats.length > 0) console.log(pc.dim(stats.join(" · ")));

  console.log(pc.dim("Resume with: dojops chat --resume"));
  console.log(divider);
  p.outro(pc.dim("Goodbye!"));
}

function isExitInput(input: unknown): boolean {
  return p.isCancel(input) || input === "/exit";
}

async function processLoopInput(
  input: string,
  session: ChatSession,
  rootDir: string,
  ctx: CLIContext,
): Promise<void> {
  const trimmed = input.trim();
  if (!trimmed) return;

  const handled = await handleSlashCommand(trimmed, session, rootDir, ctx);
  if (!handled) {
    await handleSendMessage(session, trimmed, ctx);
  }
}

async function runInteractiveLoop(
  session: ChatSession,
  rootDir: string,
  ctx: CLIContext,
): Promise<void> {
  const saveAndExit = () => {
    saveChatSession(rootDir, session.getState());
    showGoodbye(session);
    process.exit(ExitCode.SUCCESS);
  };
  process.on("SIGINT", saveAndExit);

  while (true) {
    const input = await p.text({
      message: pc.cyan("You"),
      placeholder: "Type a message or /command...",
    });

    if (isExitInput(input)) {
      saveChatSession(rootDir, session.getState());
      showGoodbye(session);
      break;
    }

    await processLoopInput(input as string, session, rootDir, ctx);
  }

  process.off("SIGINT", saveAndExit);
  saveChatSession(rootDir, session.getState());
  // Force exit — Ollama's axios keep-alive connections prevent natural shutdown
  process.exit(ExitCode.SUCCESS);
}

// ── Export / format helpers ──────────────────────────────────────

/** @internal exported for testing */
export function getRoleLabel(role: string): string {
  if (role === "user") return "**You**";
  if (role === "assistant") return "**Agent**";
  return "**System**";
}

/** @internal exported for testing */
export function formatSessionAsMarkdown(session: ChatSessionState): string {
  const lines: string[] = [
    `# Chat Session: ${session.name ?? session.id}`,
    "",
    `- **ID:** ${session.id}`,
    `- **Created:** ${session.createdAt}`,
    `- **Updated:** ${session.updatedAt}`,
    `- **Mode:** ${session.mode}`,
  ];
  if (session.pinnedAgent) lines.push(`- **Agent:** ${session.pinnedAgent}`);
  lines.push(`- **Messages:** ${session.metadata.messageCount}`, "", "---", "");

  for (const msg of session.messages) {
    const role = getRoleLabel(msg.role);
    const time = new Date(msg.timestamp).toLocaleString();
    lines.push(`### ${role} — ${time}`, "", msg.content, "");
  }
  return lines.join("\n");
}

// ── Chat export ─────────────────────────────────────────────────

async function chatExportCommand(args: string[], ctx: CLIContext): Promise<void> {
  const rootDir = findProjectRoot(ctx.cwd);
  if (!rootDir) {
    throw new CLIError(
      ExitCode.VALIDATION_ERROR,
      "No .dojops/ project found. Run `dojops init` first.",
    );
  }

  const sessions = listChatSessions(rootDir);
  if (sessions.length === 0) {
    p.log.info("No chat sessions found.");
    return;
  }

  const format = extractFlagValue(args, "--format") ?? "markdown";
  const outputPath = extractFlagValue(args, "--output");
  // Session ID is the first positional arg after "export" (skip flags)
  const sessionId = args
    .slice(1)
    .find((a) => !a.startsWith("-") && a !== format && a !== outputPath);

  const toExport = sessionId
    ? sessions.filter((s) => s.id === sessionId || s.name === sessionId)
    : sessions;

  if (toExport.length === 0) {
    throw new CLIError(ExitCode.VALIDATION_ERROR, `Session "${sessionId}" not found.`);
  }

  let content: string;
  if (format === "json") {
    content = JSON.stringify(toExport.length === 1 ? toExport[0] : toExport, null, 2);
  } else {
    content = toExport.map(formatSessionAsMarkdown).join("\n\n---\n\n");
  }

  if (outputPath) {
    fs.writeFileSync(outputPath, content, "utf-8");
    p.log.success(`Exported ${toExport.length} session(s) to ${pc.underline(outputPath)}`);
  } else {
    process.stdout.write(content);
    if (!content.endsWith("\n")) process.stdout.write("\n");
  }
}

// ── Main entry point ────────────────────────────────────────────

export async function chatCommand(args: string[], ctx: CLIContext): Promise<void> {
  if (args[0] === "export") {
    return chatExportCommand(args, ctx);
  }

  const sessionName = extractFlagValue(args, "--session");
  const resumeFlag = hasFlag(args, "--resume");
  const deterministic = hasFlag(args, "--deterministic");
  const agentFlag = ctx.globalOpts.agent ?? extractFlagValue(args, "--agent");
  const messageFlag = extractFlagValue(args, "--message") ?? extractFlagValue(args, "-m");

  const rootDir = findProjectRoot(ctx.cwd);
  if (!rootDir) {
    throw new CLIError(
      ExitCode.VALIDATION_ERROR,
      "No .dojops/ project found. Run `dojops init` first.",
    );
  }

  const provider = ctx.getProvider();
  const docAugmenter = await loadDocAugmenter();
  const { router } = createRouter(provider, rootDir, docAugmenter);

  const state = resolveSessionState(rootDir, resumeFlag, sessionName, deterministic);
  const mode: SessionMode = deterministic ? "DETERMINISTIC" : "INTERACTIVE";

  const contextInfo = buildSessionContext(rootDir);

  const session = new ChatSession({ provider, router, state, mode, projectContext: contextInfo });

  if (agentFlag) validateAgentFlag(session, agentFlag);

  if (messageFlag) {
    await handleSingleMessage(session, messageFlag, rootDir, ctx);
    return;
  }

  showWelcome(session, ctx, contextInfo);
  await runInteractiveLoop(session, rootDir, ctx);
}
