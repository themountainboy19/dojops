import { LLMProvider, parseAndValidate } from "@dojops/core";
import * as yaml from "js-yaml";
import { KubernetesManifest, KubernetesManifestSchema } from "./schemas";
import { YAML_DUMP_OPTIONS } from "../yaml-options";

export async function generateKubernetesManifest(
  appName: string,
  image: string,
  port: number,
  replicas: number,
  namespace: string,
  llm: LLMProvider,
  existingContent?: string,
): Promise<KubernetesManifest> {
  const isUpdate = !!existingContent;
  const resourceTypesNote = `
You may also include optional resource types in the response:
- "statefulSet": { "name", "replicas", "serviceName", "containers", "volumeClaimTemplates" }
- "daemonSet": { "name", "containers", "labels" }
- "cronJob": { "name", "schedule", "containers", "restartPolicy", "concurrencyPolicy" }
- "pvcs": [{ "name", "accessModes", "storageClassName", "storage" }]
- "rbac": { "role": { "name", "rules" }, "binding": { "name", "subjects" } }
- "networkPolicy": { "name", "podSelector", "policyTypes", "ingress", "egress" }
- "pdb": { "name", "minAvailable" or "maxUnavailable", "selector" }
Only include these if relevant to the request.`;

  const system = isUpdate
    ? `You are a Kubernetes expert. Update the existing Kubernetes deployment and service configuration as structured JSON.
Preserve existing structure and settings. Only add/modify what is requested.

You MUST respond with a JSON object matching this exact structure:
{
  "deployment": {
    "replicas": ${replicas},
    "containers": [
      {
        "name": "${appName}",
        "image": "${image}",
        "ports": [{ "containerPort": ${port}, "protocol": "TCP" }],
        "env": [],
        "resources": { "requests": { "cpu": "100m", "memory": "128Mi" }, "limits": { "cpu": "500m", "memory": "256Mi" } }
      }
    ],
    "labels": {}
  },
  "service": {
    "type": "ClusterIP",
    "ports": [{ "port": ${port}, "targetPort": ${port}, "protocol": "TCP" }]
  }
}
${resourceTypesNote}

IMPORTANT:
- Do NOT use standard Kubernetes manifest format (no apiVersion, kind, metadata)
- "deployment" and "service" are top-level keys with the structure shown above
- "containers" and "ports" must be ARRAYS
- Respond with valid JSON only, no markdown`
    : `You are a Kubernetes expert. Generate Kubernetes deployment and service configuration as structured JSON.

You MUST respond with a JSON object matching this exact structure:
{
  "deployment": {
    "replicas": ${replicas},
    "containers": [
      {
        "name": "${appName}",
        "image": "${image}",
        "ports": [{ "containerPort": ${port}, "protocol": "TCP" }],
        "env": [],
        "resources": { "requests": { "cpu": "100m", "memory": "128Mi" }, "limits": { "cpu": "500m", "memory": "256Mi" } }
      }
    ],
    "labels": {}
  },
  "service": {
    "type": "ClusterIP",
    "ports": [{ "port": ${port}, "targetPort": ${port}, "protocol": "TCP" }]
  }
}
${resourceTypesNote}

IMPORTANT:
- Do NOT use standard Kubernetes manifest format (no apiVersion, kind, metadata)
- "deployment" and "service" are top-level keys with the structure shown above
- "containers" and "ports" must be ARRAYS
- Respond with valid JSON only, no markdown`;

  const basePrompt = `${isUpdate ? "Update" : "Generate"} Kubernetes deployment and service config for app "${appName}" using image "${image}" on port ${port} with ${replicas} replicas in namespace "${namespace}".`;
  const prompt = isUpdate
    ? `${basePrompt}\n\n--- EXISTING CONFIGURATION ---\n${existingContent}\n--- END ---`
    : basePrompt;

  const response = await llm.generate({
    system,
    prompt,
    schema: KubernetesManifestSchema,
  });

  if (response.parsed) {
    return response.parsed as KubernetesManifest;
  }
  return parseAndValidate(response.content, KubernetesManifestSchema);
}

export function manifestToYaml(
  manifest: KubernetesManifest,
  appName: string,
  namespace: string,
): string {
  const labels = { app: appName, ...manifest.deployment.labels };

  const deployment = {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: { name: appName, namespace, labels },
    spec: {
      replicas: manifest.deployment.replicas,
      selector: { matchLabels: { app: appName } },
      template: {
        metadata: { labels: { app: appName } },
        spec: {
          containers: manifest.deployment.containers.map((c) => ({
            name: c.name,
            image: c.image,
            ports: c.ports,
            ...(c.env.length > 0 ? { env: c.env } : {}),
            ...(c.resources ? { resources: c.resources } : {}),
          })),
        },
      },
    },
  };

  const service = {
    apiVersion: "v1",
    kind: "Service",
    metadata: { name: appName, namespace },
    spec: {
      type: manifest.service.type,
      selector: { app: appName },
      ports: manifest.service.ports,
    },
  };

  const docs: string[] = [];
  docs.push(yaml.dump(deployment, YAML_DUMP_OPTIONS));
  docs.push(yaml.dump(service, YAML_DUMP_OPTIONS));

  // ConfigMaps
  for (const cm of manifest.configMaps ?? []) {
    docs.push(
      yaml.dump(
        {
          apiVersion: "v1",
          kind: "ConfigMap",
          metadata: { name: cm.name, namespace },
          data: cm.data,
        },
        YAML_DUMP_OPTIONS,
      ),
    );
  }

  // Secrets
  for (const secret of manifest.secrets ?? []) {
    docs.push(
      yaml.dump(
        {
          apiVersion: "v1",
          kind: "Secret",
          metadata: { name: secret.name, namespace },
          type: secret.type,
          data: secret.data,
        },
        YAML_DUMP_OPTIONS,
      ),
    );
  }

  // Ingress
  if (manifest.ingress) {
    const ing = manifest.ingress;
    docs.push(
      yaml.dump(
        {
          apiVersion: "networking.k8s.io/v1",
          kind: "Ingress",
          metadata: {
            name: ing.name,
            namespace,
            ...(Object.keys(ing.annotations).length > 0 ? { annotations: ing.annotations } : {}),
          },
          spec: {
            ...(ing.className ? { ingressClassName: ing.className } : {}),
            ...(ing.tls.length > 0 ? { tls: ing.tls } : {}),
            rules: ing.rules.map((r) => ({
              host: r.host,
              http: {
                paths: r.paths.map((p) => ({
                  path: p.path,
                  pathType: p.pathType,
                  backend: {
                    service: {
                      name: p.serviceName,
                      port: { number: p.servicePort },
                    },
                  },
                })),
              },
            })),
          },
        },
        YAML_DUMP_OPTIONS,
      ),
    );
  }

  // HPA
  if (manifest.hpa) {
    const hpa = manifest.hpa;
    docs.push(
      yaml.dump(
        {
          apiVersion: "autoscaling/v2",
          kind: "HorizontalPodAutoscaler",
          metadata: { name: hpa.name, namespace },
          spec: {
            scaleTargetRef: hpa.targetRef,
            minReplicas: hpa.minReplicas,
            maxReplicas: hpa.maxReplicas,
            ...(hpa.metrics.length > 0 ? { metrics: hpa.metrics } : {}),
          },
        },
        YAML_DUMP_OPTIONS,
      ),
    );
  }

  // StatefulSet
  if (manifest.statefulSet) {
    const ss = manifest.statefulSet;
    docs.push(
      yaml.dump(
        {
          apiVersion: "apps/v1",
          kind: "StatefulSet",
          metadata: { name: ss.name, namespace, labels: { app: ss.name } },
          spec: {
            replicas: ss.replicas,
            serviceName: ss.serviceName,
            selector: { matchLabels: { app: ss.name } },
            template: {
              metadata: { labels: { app: ss.name } },
              spec: {
                containers: ss.containers.map((c) => ({
                  name: c.name,
                  image: c.image,
                  ports: c.ports,
                  ...(c.env.length > 0 ? { env: c.env } : {}),
                  ...(c.resources ? { resources: c.resources } : {}),
                })),
              },
            },
            ...(ss.volumeClaimTemplates.length > 0
              ? {
                  volumeClaimTemplates: ss.volumeClaimTemplates.map((vct) => ({
                    metadata: { name: vct.name },
                    spec: {
                      accessModes: vct.accessModes,
                      ...(vct.storageClassName ? { storageClassName: vct.storageClassName } : {}),
                      resources: { requests: { storage: vct.storage } },
                    },
                  })),
                }
              : {}),
          },
        },
        YAML_DUMP_OPTIONS,
      ),
    );
  }

  // DaemonSet
  if (manifest.daemonSet) {
    const ds = manifest.daemonSet;
    const dsLabels = { app: ds.name, ...ds.labels };
    docs.push(
      yaml.dump(
        {
          apiVersion: "apps/v1",
          kind: "DaemonSet",
          metadata: { name: ds.name, namespace, labels: dsLabels },
          spec: {
            selector: { matchLabels: { app: ds.name } },
            template: {
              metadata: { labels: { app: ds.name } },
              spec: {
                containers: ds.containers.map((c) => ({
                  name: c.name,
                  image: c.image,
                  ports: c.ports,
                  ...(c.env.length > 0 ? { env: c.env } : {}),
                  ...(c.resources ? { resources: c.resources } : {}),
                })),
              },
            },
          },
        },
        YAML_DUMP_OPTIONS,
      ),
    );
  }

  // CronJob
  if (manifest.cronJob) {
    const cj = manifest.cronJob;
    docs.push(
      yaml.dump(
        {
          apiVersion: "batch/v1",
          kind: "CronJob",
          metadata: { name: cj.name, namespace },
          spec: {
            schedule: cj.schedule,
            concurrencyPolicy: cj.concurrencyPolicy,
            jobTemplate: {
              spec: {
                template: {
                  spec: {
                    restartPolicy: cj.restartPolicy,
                    containers: cj.containers.map((c) => ({
                      name: c.name,
                      image: c.image,
                      ports: c.ports,
                      ...(c.env.length > 0 ? { env: c.env } : {}),
                      ...(c.resources ? { resources: c.resources } : {}),
                    })),
                  },
                },
              },
            },
          },
        },
        YAML_DUMP_OPTIONS,
      ),
    );
  }

  // PVCs
  for (const pvc of manifest.pvcs ?? []) {
    docs.push(
      yaml.dump(
        {
          apiVersion: "v1",
          kind: "PersistentVolumeClaim",
          metadata: { name: pvc.name, namespace },
          spec: {
            accessModes: pvc.accessModes,
            ...(pvc.storageClassName ? { storageClassName: pvc.storageClassName } : {}),
            resources: { requests: { storage: pvc.storage } },
          },
        },
        YAML_DUMP_OPTIONS,
      ),
    );
  }

  // RBAC
  if (manifest.rbac) {
    const rbac = manifest.rbac;
    docs.push(
      yaml.dump(
        {
          apiVersion: "rbac.authorization.k8s.io/v1",
          kind: "Role",
          metadata: { name: rbac.role.name, namespace },
          rules: rbac.role.rules,
        },
        YAML_DUMP_OPTIONS,
      ),
    );
    docs.push(
      yaml.dump(
        {
          apiVersion: "rbac.authorization.k8s.io/v1",
          kind: "RoleBinding",
          metadata: { name: rbac.binding.name, namespace },
          roleRef: {
            apiGroup: "rbac.authorization.k8s.io",
            kind: "Role",
            name: rbac.role.name,
          },
          subjects: rbac.binding.subjects,
        },
        YAML_DUMP_OPTIONS,
      ),
    );
  }

  // NetworkPolicy
  if (manifest.networkPolicy) {
    const np = manifest.networkPolicy;
    docs.push(
      yaml.dump(
        {
          apiVersion: "networking.k8s.io/v1",
          kind: "NetworkPolicy",
          metadata: { name: np.name, namespace },
          spec: {
            podSelector: {
              matchLabels: np.podSelector,
            },
            policyTypes: np.policyTypes,
            ...(np.ingress ? { ingress: np.ingress } : {}),
            ...(np.egress ? { egress: np.egress } : {}),
          },
        },
        YAML_DUMP_OPTIONS,
      ),
    );
  }

  // PodDisruptionBudget
  if (manifest.pdb) {
    const pdb = manifest.pdb;
    docs.push(
      yaml.dump(
        {
          apiVersion: "policy/v1",
          kind: "PodDisruptionBudget",
          metadata: { name: pdb.name, namespace },
          spec: {
            ...(pdb.minAvailable !== undefined ? { minAvailable: pdb.minAvailable } : {}),
            ...(pdb.maxUnavailable !== undefined ? { maxUnavailable: pdb.maxUnavailable } : {}),
            selector: {
              matchLabels: pdb.selector,
            },
          },
        },
        YAML_DUMP_OPTIONS,
      ),
    );
  }

  return docs.join("---\n");
}
