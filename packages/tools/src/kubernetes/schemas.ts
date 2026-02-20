import { z } from "zod";

export const KubernetesInputSchema = z.object({
  appName: z.string(),
  image: z.string(),
  port: z.number().int().positive(),
  replicas: z.number().int().positive().default(1),
  namespace: z.string().default("default"),
  outputPath: z.string().describe("Directory to write Kubernetes manifests to (e.g. './k8s')"),
});

export type KubernetesInput = z.infer<typeof KubernetesInputSchema>;

export const ContainerPortSchema = z.object({
  containerPort: z.number(),
  protocol: z.string().default("TCP"),
});

export const ContainerSchema = z.object({
  name: z.string(),
  image: z.string(),
  ports: z.array(ContainerPortSchema).min(1),
  env: z
    .array(
      z.object({
        name: z.string(),
        value: z.string().optional(),
        valueFrom: z.record(z.unknown()).optional(),
      }),
    )
    .default([]),
  resources: z
    .object({
      requests: z.record(z.string()).optional(),
      limits: z.record(z.string()).optional(),
    })
    .optional(),
});

export const ServicePortSchema = z.object({
  port: z.number(),
  targetPort: z.number(),
  protocol: z.string().default("TCP"),
  name: z.string().optional(),
});

export const KubernetesManifestSchema = z.object({
  deployment: z.object({
    replicas: z.number(),
    containers: z.array(ContainerSchema).min(1),
    labels: z.record(z.string()).default({}),
  }),
  service: z.object({
    type: z.enum(["ClusterIP", "NodePort", "LoadBalancer"]).default("ClusterIP"),
    ports: z.array(ServicePortSchema).min(1),
  }),
});

export type KubernetesManifest = z.infer<typeof KubernetesManifestSchema>;
