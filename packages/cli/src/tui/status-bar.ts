/**
 * Rich terminal status bar for the TUI chat.
 *
 * Renders a persistent header showing session info, agent, model, token count.
 * Also renders per-turn stats after each LLM response.
 * Uses raw ANSI escape codes — zero new dependencies.
 */
import pc from "picocolors";

export interface StatusBarState {
  sessionId: string;
  sessionName?: string;
  agent: string;
  model: string;
  provider: string;
  tokenEstimate: number;
  messageCount: number;
  mode: string;
  streaming: boolean;
}

export interface TurnStats {
  agent: string;
  durationMs: number;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  sessionTokens: number;
  model: string;
}

const DIVIDER_CHAR = "─";
const THIN_DIVIDER = "╌";

/** Build a single-line status bar string (no newlines). */
export function renderStatusBar(state: StatusBarState): string {
  const sessionLabel = state.sessionName
    ? `${pc.cyan(state.sessionName)} ${pc.dim(`(${state.sessionId.slice(0, 8)})`)}`
    : pc.cyan(state.sessionId.slice(0, 12));

  const agentLabel = state.agent === "auto-route" ? pc.dim("auto") : pc.magenta(state.agent);
  const modelLabel = pc.yellow(state.model);
  const tokenLabel = formatTokens(state.tokenEstimate);
  const msgLabel = pc.dim(`${state.messageCount} msgs`);
  const modeLabel = state.mode === "DETERMINISTIC" ? pc.yellow("DET") : "";
  const streamLabel = state.streaming ? pc.green("◉ streaming") : "";

  const parts = [
    `${pc.dim("Session")} ${sessionLabel}`,
    `${pc.dim("Agent")} ${agentLabel}`,
    `${pc.dim("Model")} ${modelLabel}`,
    `${pc.dim("Tokens")} ${tokenLabel}`,
    msgLabel,
    modeLabel,
    streamLabel,
  ].filter(Boolean);

  return parts.join(pc.dim(" │ "));
}

/** Render the full header block (divider + status + divider). */
export function renderHeader(state: StatusBarState): string {
  const width = getTermWidth();
  const divider = pc.dim(DIVIDER_CHAR.repeat(Math.min(width, 80)));
  const bar = renderStatusBar(state);
  return `${divider}\n${bar}\n${divider}`;
}

/** Render compact stats after an LLM response. */
export function renderTurnStats(stats: TurnStats): string {
  const width = getTermWidth();
  const thinDiv = pc.dim(THIN_DIVIDER.repeat(Math.min(width, 80)));

  const parts: string[] = [];

  // Agent
  parts.push(pc.magenta(stats.agent));

  // Duration
  parts.push(pc.dim(formatDuration(stats.durationMs)));

  // Per-turn tokens (from LLM provider if available)
  if (stats.usage) {
    const { promptTokens, completionTokens, totalTokens } = stats.usage;
    parts.push(
      `${pc.dim("in:")}${formatCompactTokens(promptTokens)} ${pc.dim("out:")}${formatCompactTokens(completionTokens)} ${pc.dim("=")}${formatCompactTokens(totalTokens)}`,
    );
  }

  // Session total
  parts.push(`${pc.dim("session:")}${formatTokens(stats.sessionTokens)}`);

  // Estimated cost (rough: GPT-4o pricing as baseline)
  if (stats.usage) {
    const cost = estimateCost(stats.usage.promptTokens, stats.usage.completionTokens, stats.model);
    if (cost > 0) {
      parts.push(pc.dim(`~$${cost.toFixed(4)}`));
    }
  }

  return `${thinDiv}\n${parts.join(pc.dim(" │ "))}`;
}

/** Render the streaming indicator line. */
export function renderStreamingStart(agent: string): string {
  return `${pc.green("▸")} ${pc.magenta(agent)} ${pc.dim("is responding...")}`;
}

function formatTokens(estimate: number): string {
  if (estimate === 0) return pc.dim("0");
  const k = Math.round(estimate / 1000);
  if (estimate > 100_000) return pc.red(`~${k}K`);
  if (estimate > 50_000) return pc.yellow(`~${k}K`);
  return pc.green(`~${k}K`);
}

function formatCompactTokens(count: number): string {
  if (count === 0) return pc.dim("0");
  if (count < 1000) return pc.dim(String(count));
  const k = (count / 1000).toFixed(1).replace(/\.0$/, "");
  return pc.dim(`${k}K`);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = (ms / 1000).toFixed(1);
  return `${s}s`;
}

/** Rough cost estimate based on common model pricing. */
function estimateCost(promptTokens: number, completionTokens: number, model: string): number {
  const lower = model.toLowerCase();
  // Per-million token pricing (input, output)
  let inputPer1M = 2.5; // GPT-4o default
  let outputPer1M = 10;
  if (lower.includes("gpt-4o-mini") || lower.includes("gpt-4.1-mini")) {
    inputPer1M = 0.15;
    outputPer1M = 0.6;
  } else if (lower.includes("gpt-4.1-nano")) {
    inputPer1M = 0.1;
    outputPer1M = 0.4;
  } else if (lower.includes("gpt-4.1")) {
    inputPer1M = 2.0;
    outputPer1M = 8.0;
  } else if (lower.includes("gpt-4o")) {
    inputPer1M = 2.5;
    outputPer1M = 10;
  } else if (lower.includes("claude") || lower.includes("anthropic")) {
    inputPer1M = 3;
    outputPer1M = 15;
  } else if (lower.includes("deepseek")) {
    inputPer1M = 0.14;
    outputPer1M = 0.28;
  } else if (lower.includes("gemini")) {
    inputPer1M = 1.25;
    outputPer1M = 5;
  } else if (lower.includes("ollama") || lower.includes("local")) {
    return 0; // local models have no cost
  }
  return (promptTokens * inputPer1M + completionTokens * outputPer1M) / 1_000_000;
}

/** Get terminal width, defaulting to 80. */
export function getTermWidth(): number {
  return process.stdout.columns || 80;
}
