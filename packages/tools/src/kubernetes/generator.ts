import { LLMProvider } from "@oda/core";
import * as yaml from "js-yaml";
import { KubernetesManifest, KubernetesManifestSchema } from "./schemas";

export async function generateKubernetesManifest(
  appName: string,
  image: string,
  port: number,
  replicas: number,
  namespace: string,
  llm: LLMProvider,
): Promise<KubernetesManifest> {
  const response = await llm.generate({
    system: `You are a Kubernetes expert. Generate Kubernetes deployment and service configuration as structured JSON.
Include container specs, resource limits, health checks info, and service routing.
Respond with valid JSON only.`,
    prompt: `Generate Kubernetes manifests for:
App: ${appName}
Image: ${image}
Port: ${port}
Replicas: ${replicas}
Namespace: ${namespace}`,
    schema: KubernetesManifestSchema,
  });

  return response.parsed as KubernetesManifest;
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

  const deployYaml = yaml.dump(deployment, { lineWidth: 120, noRefs: true });
  const serviceYaml = yaml.dump(service, { lineWidth: 120, noRefs: true });

  return `${deployYaml}---\n${serviceYaml}`;
}
