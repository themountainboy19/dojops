import { z } from "zod";

export const HelmInputSchema = z.object({
  chartName: z.string(),
  appVersion: z.string().default("0.1.0"),
  description: z.string().default("A Helm chart"),
  outputPath: z.string().describe("Directory to write the Helm chart to (e.g. './charts/my-app')"),
  image: z.string(),
  port: z.number().int().positive(),
  environment: z.string().optional(),
  existingContent: z
    .string()
    .optional()
    .describe(
      "Existing config file content to update/enhance. If omitted, tool auto-detects existing files.",
    ),
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
  ingress: z
    .object({
      enabled: z.boolean(),
      className: z.string().optional(),
      hosts: z
        .array(
          z.object({
            host: z.string(),
            paths: z.array(
              z.object({
                path: z.string(),
                pathType: z.string().default("ImplementationSpecific"),
              }),
            ),
          }),
        )
        .default([]),
      tls: z
        .array(
          z.object({
            secretName: z.string(),
            hosts: z.array(z.string()),
          }),
        )
        .default([]),
    })
    .optional(),
  serviceAccount: z
    .object({
      create: z.boolean().default(true),
      name: z.string().optional(),
      annotations: z.record(z.string()).default({}),
    })
    .optional(),
  autoscaling: z
    .object({
      enabled: z.boolean().default(false),
      minReplicas: z.number().default(1),
      maxReplicas: z.number().default(10),
      targetCPUUtilization: z.number().optional(),
    })
    .optional(),
});

export type HelmChartResponse = z.infer<typeof HelmChartResponseSchema>;
