import { Router } from "express";
import { HistoryStore } from "../store";

const ALLOWED_TYPES = new Set(["generate", "plan", "debug-ci", "diff", "scan", "chat"]);
const MAX_LIMIT = 1000;

export function createHistoryRouter(store: HistoryStore): Router {
  const router = Router();

  router.get("/", (req, res) => {
    const rawType = req.query.type as string | undefined;
    const type = rawType && ALLOWED_TYPES.has(rawType) ? rawType : undefined;
    const rawLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const limit = rawLimit && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : undefined;

    const entries = store.getAll({ type, limit });
    res.json({ entries, count: entries.length });
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
