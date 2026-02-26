import { Router } from "express";
import type { MetricsAggregator } from "../metrics";

export function createMetricsRouter(aggregator: MetricsAggregator): Router {
  const router = Router();

  router.get("/", (_req, res, next) => {
    try {
      res.json(aggregator.getAll());
    } catch (err) {
      next(err);
    }
  });

  router.get("/overview", (_req, res, next) => {
    try {
      res.json(aggregator.getOverview());
    } catch (err) {
      next(err);
    }
  });

  router.get("/security", (_req, res, next) => {
    try {
      res.json(aggregator.getSecurity());
    } catch (err) {
      next(err);
    }
  });

  router.get("/audit", (_req, res, next) => {
    try {
      res.json(aggregator.getAudit());
    } catch (err) {
      next(err);
    }
  });

  return router;
}
