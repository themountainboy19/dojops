/**
 * Smart output compression for LLM context reduction.
 *
 * Strips ANSI codes, progress indicators, success lines, and duplicates
 * from CLI tool output before sending to the LLM. Typical savings: 70-90%.
 */

/** ANSI escape code pattern (SGR, cursor movement, erase, OSC) */
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1B(?:\[[0-9;]*[A-Za-z]|\].*?(?:\x07|\x1B\\)|\([0-9A-Z])/g;

/** Braille spinner characters used in progress indicators */
const SPINNER_CHARS = /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/;

/** Progress-bar style lines: spinners, percentage bars, download counters */
function isProgressLine(line: string): boolean {
  const lower = line.toLowerCase();
  if (SPINNER_CHARS.test(line)) return true;
  if (lower.includes("downloading") || lower.includes("pulling") || lower.includes("fetching")) {
    return true;
  }
  if (/\|[#=\-\s]*\|/.test(line)) return true;
  if (/\.{3,}\s*\d+%/.test(line)) return true;
  if (/\b\d+%\b/.test(line) && line.includes("[")) return true;
  return false;
}

/** Lines that only contain blank space or decorative separators */
const BLANK_RE = /^\s*$/;
const SEPARATOR_RE = /^[-=~_*]{4,}\s*$/;

/** ISO timestamp lines */
const TIMESTAMP_RE = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\S*Z\s*$/;

/** Check if a line is noise (blank, separator, or timestamp-only). */
function isNoiseLine(line: string): boolean {
  return BLANK_RE.test(line) || SEPARATOR_RE.test(line) || TIMESTAMP_RE.test(line);
}

/** Success/pass keywords */
const SUCCESS_WORDS_RE = /\b(?:passed?|passing|ok|success(?:fully?)?|clean|up to date)\b/i;
const SUCCESS_SYMBOLS_RE = /[✓✔]/;
const SUCCESS_NO_RE = /\bno (?:issues|errors|warnings|vulnerabilities) found\b/i;
const SUCCESS_ZERO_RE = /\b0 (?:errors?|warnings?|issues?)\b/i;

/** Check if a line is a success/pass line with no diagnostic value. */
function isSuccessLine(line: string): boolean {
  return (
    SUCCESS_WORDS_RE.test(line) ||
    SUCCESS_SYMBOLS_RE.test(line) ||
    SUCCESS_NO_RE.test(line) ||
    SUCCESS_ZERO_RE.test(line)
  );
}

export interface CompressOptions {
  /** Keep success/pass lines (default: false) */
  keepSuccess?: boolean;
  /** Keep blank/separator lines (default: false) */
  keepNoise?: boolean;
  /** Maximum output lines (0 = unlimited, default: 500) */
  maxLines?: number;
  /** Maximum output bytes (0 = unlimited, default: 64KB) */
  maxBytes?: number;
  /** Minimum number of repetitions before collapsing (default: 2) */
  deduplicateThreshold?: number;
}

const DEFAULTS: Required<CompressOptions> = {
  keepSuccess: false,
  keepNoise: false,
  maxLines: 500,
  maxBytes: 64 * 1024,
  deduplicateThreshold: 2,
};

export interface CompressResult {
  /** Compressed output text */
  output: string;
  /** Original line count */
  originalLines: number;
  /** Compressed line count */
  compressedLines: number;
  /** Number of lines removed */
  linesRemoved: number;
  /** Number of duplicate groups collapsed */
  duplicateGroups: number;
  /** Compression ratio (0-1, lower = more compressed) */
  ratio: number;
}

/**
 * Compress CLI tool output for LLM consumption.
 *
 * Pipeline: strip ANSI → remove progress → remove success → deduplicate → truncate
 */
export function compressOutput(raw: string, options?: CompressOptions): CompressResult {
  const opts = { ...DEFAULTS, ...options };
  const originalLines = raw.split("\n").length;

  // Step 1: Strip ANSI escape codes
  const text = stripAnsi(raw);

  // Step 2: Split into lines and filter
  let lines = text.split("\n");

  // Step 3: Remove progress indicators
  lines = lines.filter((line) => !isProgressLine(line));

  // Step 4: Remove noise (blank lines, separators)
  if (!opts.keepNoise) {
    lines = lines.filter((line) => !isNoiseLine(line));
  }

  // Step 5: Remove success/pass lines
  if (!opts.keepSuccess) {
    lines = lines.filter((line) => !isSuccessLine(line));
  }

  // Step 6: Deduplicate consecutive identical lines
  let duplicateGroups = 0;
  if (opts.deduplicateThreshold > 0) {
    const result = deduplicateLines(lines, opts.deduplicateThreshold);
    lines = result.lines;
    duplicateGroups = result.groups;
  }

  // Step 7: Truncate to max lines
  if (opts.maxLines > 0 && lines.length > opts.maxLines) {
    const removed = lines.length - opts.maxLines;
    // Keep head and tail for context
    const headCount = Math.floor(opts.maxLines * 0.3);
    const tailCount = opts.maxLines - headCount;
    lines = [
      ...lines.slice(0, headCount),
      `[...${removed} lines truncated...]`,
      ...lines.slice(-tailCount),
    ];
  }

  // Step 8: Truncate to max bytes
  let output = lines.join("\n");
  if (opts.maxBytes > 0 && Buffer.byteLength(output) > opts.maxBytes) {
    const buf = Buffer.from(output);
    const truncated = buf.subarray(0, opts.maxBytes).toString("utf-8");
    const lastNewline = truncated.lastIndexOf("\n");
    output =
      (lastNewline > 0 ? truncated.slice(0, lastNewline) : truncated) +
      `\n[...truncated to ${Math.round(opts.maxBytes / 1024)}KB...]`;
  }

  const compressedLines = output.split("\n").length;

  return {
    output,
    originalLines,
    compressedLines,
    linesRemoved: originalLines - compressedLines,
    duplicateGroups,
    ratio: raw.length > 0 ? output.length / raw.length : 1,
  };
}

/** Strip all ANSI escape codes from a string. */
export function stripAnsi(text: string): string {
  return text.replaceAll(ANSI_RE, "");
}

/** Flush a group of repeated lines into the result array. Returns 1 if collapsed, 0 otherwise. */
function flushGroup(result: string[], line: string, count: number, threshold: number): number {
  if (count >= threshold) {
    result.push(`${line} (×${count})`);
    return 1;
  }
  for (let j = 0; j < count; j++) result.push(line);
  return 0;
}

/**
 * Collapse consecutive identical lines into "line (×N)".
 * Returns the deduplicated lines and the number of groups collapsed.
 */
export function deduplicateLines(
  lines: string[],
  threshold: number,
): { lines: string[]; groups: number } {
  if (lines.length === 0) return { lines: [], groups: 0 };

  const result: string[] = [];
  let groups = 0;
  let current = lines[0];
  let count = 1;

  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === current) {
      count++;
    } else {
      groups += flushGroup(result, current, count, threshold);
      current = lines[i];
      count = 1;
    }
  }

  // Flush last group
  groups += flushGroup(result, current, count, threshold);

  return { lines: result, groups };
}

/**
 * Compress CI log specifically — more aggressive filtering tuned for CI output.
 * Keeps error/failure context, strips boilerplate.
 */
export function compressCILog(raw: string): CompressResult {
  return compressOutput(raw, {
    keepSuccess: false,
    keepNoise: false,
    maxLines: 300,
    maxBytes: 64 * 1024,
    deduplicateThreshold: 2,
  });
}

/**
 * Compress scanner output — preserves findings, strips boilerplate.
 */
export function compressScannerOutput(raw: string): CompressResult {
  return compressOutput(raw, {
    keepSuccess: false,
    keepNoise: false,
    maxLines: 200,
    maxBytes: 48 * 1024,
    deduplicateThreshold: 3,
  });
}
