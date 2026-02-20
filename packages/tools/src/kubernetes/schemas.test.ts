import { describe, it, expect } from "vitest";
import { KubernetesInputSchema, KubernetesManifestSchema } from "./schemas";

describe("Kubernetes schemas", () => {
  describe("KubernetesInputSchema", () => {
    it("accepts valid input with defaults", () => {
      const result = KubernetesInputSchema.safeParse({
        appName: "web",
        image: "nginx:latest",
        port: 80,
        outputPath: "/out",
      });
      expect(result.success).toBe(true);
      expect(result.data?.replicas).toBe(1);
      expect(result.data?.namespace).toBe("default");
    });

    it("rejects negative port", () => {
      const result = KubernetesInputSchema.safeParse({
        appName: "web",
        image: "nginx",
        port: -1,
        outputPath: "/out",
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-integer replicas", () => {
      const result = KubernetesInputSchema.safeParse({
        appName: "web",
        image: "nginx",
        port: 80,
        replicas: 1.5,
        outputPath: "/out",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("KubernetesManifestSchema", () => {
    it("accepts valid manifest", () => {
      const result = KubernetesManifestSchema.safeParse({
        deployment: {
          replicas: 3,
          containers: [{ name: "web", image: "nginx:latest", ports: [{ containerPort: 80 }] }],
        },
        service: {
          type: "ClusterIP",
          ports: [{ port: 80, targetPort: 80 }],
        },
      });
      expect(result.success).toBe(true);
    });

    it("rejects manifest with no containers", () => {
      const result = KubernetesManifestSchema.safeParse({
        deployment: { replicas: 1, containers: [] },
        service: { ports: [{ port: 80, targetPort: 80 }] },
      });
      expect(result.success).toBe(false);
    });

    it("rejects manifest with no service ports", () => {
      const result = KubernetesManifestSchema.safeParse({
        deployment: {
          replicas: 1,
          containers: [{ name: "web", image: "nginx", ports: [{ containerPort: 80 }] }],
        },
        service: { ports: [] },
      });
      expect(result.success).toBe(false);
    });
  });
});
