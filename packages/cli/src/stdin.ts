import * as fs from "node:fs";

/**
 * Read all data from stdin if it's being piped (not a TTY).
 * Returns the piped content or undefined if stdin is a TTY.
 */
export function readStdin(): string | undefined {
  if (process.stdin.isTTY) return undefined;
  try {
    return fs.readFileSync(0, "utf-8");
  } catch {
    return undefined;
  }
}
