import { z } from "zod";

export const HelmInputSchema = z.object({
  chartName: z.string(),
  appVersion: z.string().default("0.1.0"),
  description: z.string().default("A Helm chart"),
  outputPath: z.string().describe("Directory to write the Helm chart to (e.g. './charts/my-app')"),
  image: z.string(),
  port: z.number().int().positive(),
});

export type HelmInput = z.infer<typeof HelmInputSchema>;

export const HelmValuesSchema = z.object({
  replicaCount: z.number().default(1),
  image: z.object({
    repository: z.string(),
    tag: z.string(),
    pullPolicy: z.enum(["Always", "IfNotPresent", "Never"]).default("IfNotPresent"),
  }),
  service: z.object({
    type: z.enum(["ClusterIP", "NodePort", "LoadBalancer"]).default("ClusterIP"),
    port: z.number(),
  }),
  resources: z
    .object({
      requests: z.record(z.string()).optional(),
      limits: z.record(z.string()).optional(),
    })
    .default({}),
  env: z.array(z.object({ name: z.string(), value: z.string() })).default([]),
});

export type HelmValues = z.infer<typeof HelmValuesSchema>;

export const HelmChartResponseSchema = z.object({
  values: HelmValuesSchema,
  notes: z.string().optional(),
});

export type HelmChartResponse = z.infer<typeof HelmChartResponseSchema>;
