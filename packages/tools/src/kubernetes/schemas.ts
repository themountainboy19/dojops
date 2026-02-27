import { z } from "zod";

export const KubernetesInputSchema = z.object({
  appName: z.string(),
  image: z.string(),
  port: z.number().int().positive(),
  replicas: z.number().int().positive().default(1),
  namespace: z.string().default("default"),
  outputPath: z.string().describe("Directory to write Kubernetes manifests to (e.g. './k8s')"),
  existingContent: z
    .string()
    .optional()
    .describe(
      "Existing config file content to update/enhance. If omitted, tool auto-detects existing files.",
    ),
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

// ConfigMap schema
export const ConfigMapSchema = z.object({
  name: z.string(),
  data: z.record(z.string()).default({}),
});

// Secret schema
export const SecretSchema = z.object({
  name: z.string(),
  type: z.string().default("Opaque"),
  data: z.record(z.string()).default({}),
});

// Ingress schema
export const IngressRuleSchema = z.object({
  host: z.string(),
  paths: z.array(
    z.object({
      path: z.string().default("/"),
      pathType: z.enum(["Prefix", "Exact", "ImplementationSpecific"]).default("Prefix"),
      serviceName: z.string(),
      servicePort: z.number(),
    }),
  ),
});

export const IngressSchema = z.object({
  name: z.string(),
  className: z.string().optional(),
  annotations: z.record(z.string()).default({}),
  tls: z
    .array(
      z.object({
        hosts: z.array(z.string()),
        secretName: z.string(),
      }),
    )
    .default([]),
  rules: z.array(IngressRuleSchema).min(1),
});

// HorizontalPodAutoscaler schema
export const HPASchema = z.object({
  name: z.string(),
  targetRef: z.object({
    apiVersion: z.string().default("apps/v1"),
    kind: z.string().default("Deployment"),
    name: z.string(),
  }),
  minReplicas: z.number().int().positive().default(1),
  maxReplicas: z.number().int().positive(),
  metrics: z
    .array(
      z.object({
        type: z.enum(["Resource", "Pods", "Object"]).default("Resource"),
        resource: z
          .object({
            name: z.string(),
            target: z.object({
              type: z.enum(["Utilization", "Value", "AverageValue"]).default("Utilization"),
              averageUtilization: z.number().optional(),
              value: z.string().optional(),
            }),
          })
          .optional(),
      }),
    )
    .default([]),
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
  configMaps: z.array(ConfigMapSchema).default([]),
  secrets: z.array(SecretSchema).default([]),
  ingress: IngressSchema.optional(),
  hpa: HPASchema.optional(),
});

export type KubernetesManifest = z.infer<typeof KubernetesManifestSchema>;
