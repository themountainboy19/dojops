import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

export function createTempDir(prefix = "dojops-metrics-test-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function computeAuditHash(entry: Record<string, unknown>): string {
  const payload = [
    entry.seq,
    entry.timestamp,
    entry.user,
    entry.command,
    entry.action,
    (entry.planId as string) ?? "",
    entry.status,
    entry.durationMs,
    (entry.previousHash as string) ?? "genesis",
  ].join("\0");
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export function writeAuditEntries(dojopsDir: string, entries: Array<Record<string, unknown>>) {
  let previousHash = "genesis";
  const lines: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e: Record<string, unknown> = { ...entries[i], seq: i + 1, previousHash };
    e.hash = computeAuditHash(e);
    previousHash = e.hash as string;
    lines.push(JSON.stringify(e));
  }
  fs.writeFileSync(path.join(dojopsDir, "history", "audit.jsonl"), lines.join("\n") + "\n");
}
