import { z } from "zod";

export const PrometheusInputSchema = z.object({
  targets: z.array(z.string()).min(1).describe("List of scrape targets (e.g. 'localhost:9090')"),
  scrapeInterval: z.string().default("15s"),
  alertRules: z.string().optional().describe("Description of alert rules to generate"),
  outputPath: z.string().describe("Directory to write Prometheus config files to"),
});

export type PrometheusInput = z.infer<typeof PrometheusInputSchema>;

export const ScrapeConfigSchema = z.object({
  job_name: z.string(),
  metrics_path: z.string().optional(),
  scrape_interval: z.string().optional(),
  static_configs: z.array(
    z.object({
      targets: z.array(z.string()),
      labels: z.record(z.string()).optional(),
    }),
  ),
});

export const AlertRuleSchema = z.object({
  alert: z.string(),
  expr: z.string(),
  for: z.string().optional(),
  labels: z.record(z.string()).default({}),
  annotations: z.record(z.string()).default({}),
});

export const AlertGroupSchema = z.object({
  name: z.string(),
  rules: z.array(AlertRuleSchema).min(1),
});

export const PrometheusResponseSchema = z.object({
  global: z.object({
    scrape_interval: z.string(),
    evaluation_interval: z.string(),
  }),
  scrape_configs: z.array(ScrapeConfigSchema).min(1),
  alertGroups: z.array(AlertGroupSchema).default([]),
});

export type PrometheusResponse = z.infer<typeof PrometheusResponseSchema>;
export type AlertGroup = z.infer<typeof AlertGroupSchema>;
