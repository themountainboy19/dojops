import { execFile } from "node:child_process";
import type { ExecFileOptions } from "node:child_process";

/**
 * Async wrapper for child_process.execFile that returns { stdout, stderr }.
 * Using a manual wrapper instead of util.promisify to ensure correct
 * behavior with vi.mock() in tests (Node.js execFile has a custom
 * promisify symbol that doesn't work with mocked functions).
 */
export function execFileAsync(
  command: string,
  args: string[],
  options: ExecFileOptions & { encoding: "utf-8" },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (err, stdout, stderr) => {
      // NOSONAR — S4721: execFile wrapper with array args, no shell injection
      if (err) {
        // Attach stdout/stderr to the error for callers that need partial output
        const enrichedErr = err as Error & { stdout?: string; stderr?: string };
        enrichedErr.stdout = typeof stdout === "string" ? stdout : "";
        enrichedErr.stderr = typeof stderr === "string" ? stderr : "";
        reject(enrichedErr);
      } else {
        resolve({
          stdout: typeof stdout === "string" ? stdout : "",
          stderr: typeof stderr === "string" ? stderr : "",
        });
      }
    });
  });
}
