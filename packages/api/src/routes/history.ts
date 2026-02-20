import { Router } from "express";
import { HistoryStore } from "../store";

export function createHistoryRouter(store: HistoryStore): Router {
  const router = Router();

  router.get("/", (req, res) => {
    const type = req.query.type as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

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

  router.delete("/", (_req, res) => {
    store.clear();
    res.json({ message: "History cleared" });
  });

  return router;
}
