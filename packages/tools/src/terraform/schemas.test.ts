import { describe, it, expect } from "vitest";
import { TerraformInputSchema, TerraformConfigSchema } from "./schemas";

describe("Terraform schemas", () => {
  describe("TerraformInputSchema", () => {
    it("accepts valid input", () => {
      const result = TerraformInputSchema.safeParse({
        projectPath: "/infra",
        provider: "aws",
        resources: "S3 bucket with versioning",
      });
      expect(result.success).toBe(true);
      expect(result.data?.backendType).toBe("local");
    });

    it("rejects invalid provider", () => {
      const result = TerraformInputSchema.safeParse({
        projectPath: "/infra",
        provider: "invalid",
        resources: "stuff",
      });
      expect(result.success).toBe(false);
    });

    it("accepts custom backend type", () => {
      const result = TerraformInputSchema.safeParse({
        projectPath: "/infra",
        provider: "gcp",
        resources: "GCS bucket",
        backendType: "gcs",
      });
      expect(result.success).toBe(true);
      expect(result.data?.backendType).toBe("gcs");
    });
  });

  describe("TerraformConfigSchema", () => {
    it("accepts valid config", () => {
      const result = TerraformConfigSchema.safeParse({
        provider: { name: "aws", region: "us-east-1", config: {} },
        resources: [{ type: "aws_s3_bucket", name: "main", config: { bucket: "my-bucket" } }],
      });
      expect(result.success).toBe(true);
      expect(result.data?.variables).toEqual([]);
      expect(result.data?.outputs).toEqual([]);
    });

    it("rejects config with no resources", () => {
      const result = TerraformConfigSchema.safeParse({
        provider: { name: "aws", config: {} },
        resources: [],
      });
      expect(result.success).toBe(false);
    });

    it("accepts config with backend and variables", () => {
      const result = TerraformConfigSchema.safeParse({
        provider: { name: "aws", config: {} },
        backend: { type: "s3", config: { bucket: "tf-state" } },
        variables: [{ name: "region", type: "string", description: "AWS region" }],
        resources: [{ type: "aws_instance", name: "web", config: { ami: "ami-123" } }],
        outputs: [{ name: "ip", value: "aws_instance.web.public_ip" }],
      });
      expect(result.success).toBe(true);
    });
  });
});
