import { vi } from "vitest";
import type * as execAsyncMod from "../exec-async";

type MockExecFileAsync = ReturnType<typeof vi.fn<typeof execAsyncMod.execFileAsync>>;

/**
 * Creates an ENOENT error matching the pattern used by child_process when a binary is not found.
 * This is the most common skip-condition in scanner tests.
 */
export function createEnoentError(): Error & { stdout?: string; stderr?: string; code?: string } {
  const err = new Error("ENOENT") as NodeJS.ErrnoException & {
    stdout?: string;
    stderr?: string;
  };
  err.code = "ENOENT";
  return err as Error & { stdout?: string; stderr?: string; code?: string };
}

/**
 * Creates an error with stdout/stderr that simulates a non-zero exit from a scanner binary.
 * Used when scanners exit non-zero but still produce parseable output in stdout.
 */
export function createExecError(
  message: string,
  opts: { stdout?: string; stderr?: string; status?: number } = {},
): Error & { stdout?: string; stderr?: string; code?: string } {
  return Object.assign(new Error(message), {
    stdout: opts.stdout ?? "",
    stderr: opts.stderr ?? "",
    status: opts.status,
  }) as Error & { stdout?: string; stderr?: string; code?: string };
}

/**
 * Configure mockExecFileAsync to resolve with stdout.
 */
export function mockExecSuccess(mock: MockExecFileAsync, stdout: string): void {
  mock.mockResolvedValue({ stdout, stderr: "" });
}

/**
 * Configure mockExecFileAsync to reject with an error.
 */
export function mockExecError(
  mock: MockExecFileAsync,
  err: Error & { stdout?: string; stderr?: string; code?: string },
): void {
  mock.mockRejectedValue(err);
}
