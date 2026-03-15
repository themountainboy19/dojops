import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { HistoryStore, HistoryEntry } from "../store";

const ALLOWED_TYPES = new Set([
  "generate",
  "plan",
  "debug-ci",
  "diff",
  "scan",
  "chat",
  "review",
  "auto",
]);
const MAX_LIMIT = 1000;

/** Map an audit command name to a HistoryEntry type. */
function auditCommandToType(command: string): HistoryEntry["type"] {
  const map: Record<string, HistoryEntry["type"]> = {
    plan: "plan",
    apply: "plan",
    generate: "generate",
    auto: "auto",
    scan: "scan",
    "debug-ci": "debug-ci",
    diff: "diff",
    chat: "chat",
    review: "review",
  };
  return map[command] ?? "generate";
}

/** Read audit.jsonl from disk and convert to HistoryEntry format. */
function readAuditAsHistory(rootDir: string): HistoryEntry[] {
  const auditPath = path.join(rootDir, ".dojops", "history", "audit.jsonl");
  if (!fs.existsSync(auditPath)) return [];

  try {
    const content = fs.readFileSync(auditPath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());
    return lines
      .map((line) => {
        try {
          const entry = JSON.parse(line) as {
            timestamp: string;
            user?: string;
            command: string;
            action: string;
            planId?: string;
            status: string;
            durationMs: number;
            seq?: number;
          };
          return {
            id: `audit-${entry.seq ?? Date.parse(entry.timestamp)}`,
            type: auditCommandToType(entry.command),
            request: {
              prompt: entry.action,
              planId: entry.planId,
              source: "cli",
            },
            response: null,
            timestamp: entry.timestamp,
            durationMs: entry.durationMs,
            success: entry.status === "success",
            error: entry.status === "failure" ? entry.action : undefined,
          } as HistoryEntry;
        } catch {
          return null;
        }
      })
      .filter((e): e is HistoryEntry => e !== null);
  } catch {
    return [];
  }
}

export function createHistoryRouter(store: HistoryStore, rootDir?: string): Router {
  const router = Router();

  router.get("/", (req, res) => {
    const rawType = req.query.type as string | undefined;
    const type = rawType && ALLOWED_TYPES.has(rawType) ? rawType : undefined;
    const parsedLimit = req.query.limit
      ? Number.parseInt(req.query.limit as string, 10)
      : undefined;
    const limit =
      parsedLimit !== undefined && Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, MAX_LIMIT)
        : undefined;
    const parsedOffset = req.query.offset ? Number.parseInt(req.query.offset as string, 10) : 0;
    const offset = Number.isFinite(parsedOffset) && parsedOffset > 0 ? parsedOffset : 0;

    // Merge in-memory entries with file-based audit entries
    const memEntries = store.getAll({ type, limit: undefined });
    let entries: HistoryEntry[];

    if (rootDir) {
      let auditEntries = readAuditAsHistory(rootDir);
      if (type) {
        auditEntries = auditEntries.filter((e) => e.type === type);
      }
      // Deduplicate: in-memory entries take precedence (they have full request/response)
      const memTimestamps = new Set(memEntries.map((e) => e.timestamp));
      const uniqueAudit = auditEntries.filter((e) => !memTimestamps.has(e.timestamp));
      entries = [...memEntries, ...uniqueAudit].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
    } else {
      entries = memEntries;
    }

    // Apply offset then limit via slice
    if (offset > 0 || limit) {
      const end = limit ? offset + limit : undefined;
      entries = entries.slice(offset, end);
    }

    res.json({ entries, count: entries.length, offset });
  });

  router.get("/:id", (req, res) => {
    const entry = store.getById(req.params.id);
    if (!entry) {
      res.status(404).json({ error: "History entry not found" });
      return;
    }
    res.json(entry);
  });

  router.delete("/", (req, res) => {
    if (req.headers["x-confirm"] !== "clear") {
      res.status(400).json({ error: "Missing X-Confirm: clear header" });
      return;
    }
    store.clear();
    res.json({ message: "History cleared" });
  });

  return router;
}
