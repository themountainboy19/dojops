import { z } from "zod";

export const PrometheusInputSchema = z.object({
  targets: z.array(z.string()).min(1).describe("List of scrape targets (e.g. 'localhost:9090')"),
  scrapeInterval: z.string().default("15s"),
  alertRules: z.string().optional().describe("Description of alert rules to generate"),
  outputPath: z.string().describe("Directory to write Prometheus config files to"),
  environment: z.string().optional(),
  existingContent: z
    .string()
    .optional()
    .describe(
      "Existing config file content to update/enhance. If omitted, tool auto-detects existing files.",
    ),
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

export const AlertmanagerReceiverSchema = z.object({
  name: z.string(),
  email_configs: z.array(z.record(z.unknown())).optional(),
  slack_configs: z.array(z.record(z.unknown())).optional(),
  pagerduty_configs: z.array(z.record(z.unknown())).optional(),
  webhook_configs: z.array(z.record(z.unknown())).optional(),
});

export const AlertmanagerRouteSchema = z.object({
  receiver: z.string(),
  group_by: z.array(z.string()).optional(),
  group_wait: z.string().optional(),
  group_interval: z.string().optional(),
  repeat_interval: z.string().optional(),
  match: z.record(z.string()).optional(),
  match_re: z.record(z.string()).optional(),
  routes: z.array(z.lazy((): z.ZodType => AlertmanagerRouteSchema)).optional(),
});

export const AlertmanagerConfigSchema = z.object({
  route: AlertmanagerRouteSchema,
  receivers: z.array(AlertmanagerReceiverSchema).min(1),
  inhibit_rules: z
    .array(
      z.object({
        source_match: z.record(z.string()).optional(),
        target_match: z.record(z.string()).optional(),
        equal: z.array(z.string()).optional(),
      }),
    )
    .optional(),
});

export const PrometheusResponseSchema = z.object({
  global: z.object({
    scrape_interval: z.string(),
    evaluation_interval: z.string(),
  }),
  scrape_configs: z.array(ScrapeConfigSchema).min(1),
  alertGroups: z.array(AlertGroupSchema).default([]),
  alertmanager: AlertmanagerConfigSchema.optional(),
});

export type PrometheusResponse = z.infer<typeof PrometheusResponseSchema>;
export type AlertGroup = z.infer<typeof AlertGroupSchema>;
