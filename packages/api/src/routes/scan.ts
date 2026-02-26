import { Router } from "express";
import fs from "fs";
import path from "path";
import { runScan } from "@dojops/scanner";
import type { ScanType } from "@dojops/scanner";
import { HistoryStore } from "../store";
import { ScanRequestSchema } from "../schemas";
import { validateBody } from "../middleware";

export function createScanRouter(store: HistoryStore, rootDir?: string): Router {
  const router = Router();

  router.post("/", validateBody(ScanRequestSchema), async (req, res, next) => {
    const start = Date.now();
    try {
      const { target, scanType } = req.body as { target?: string; scanType: ScanType };
      const projectPath = target ?? process.cwd();
      let realResolved: string;
      let realRoot: string;
      try {
        realResolved = fs.realpathSync(path.resolve(projectPath));
        realRoot = fs.realpathSync(path.resolve(rootDir ?? process.cwd()));
      } catch {
        res.status(400).json({ error: "Target path does not exist" });
        return;
      }
      if (realResolved !== realRoot && !realResolved.startsWith(realRoot + path.sep)) {
        res.status(400).json({ error: "Target path must be within the project directory" });
        return;
      }

      const report = await runScan(projectPath, scanType);

      const entry = store.add({
        type: "scan",
        request: { target: projectPath, scanType },
        response: report,
        durationMs: Date.now() - start,
        success: true,
      });

      res.json({ ...report, historyId: entry.id });
    } catch (err) {
      store.add({
        type: "scan",
        request: req.body,
        response: null,
        durationMs: Date.now() - start,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
      next(err);
    }
  });

  return router;
}
