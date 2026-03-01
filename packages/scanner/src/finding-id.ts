import * as crypto from "node:crypto";

/**
 * Generate a deterministic finding ID based on stable attributes.
 * This ensures the same vulnerability produces the same ID across scans,
 * enabling accurate scan comparison and trend analysis.
 */
export function deterministicFindingId(tool: string, ...attributes: string[]): string {
  const payload = [tool, ...attributes].join(":");
  return `${tool}-${crypto.createHash("sha256").update(payload).digest("hex").slice(0, 12)}`;
}
