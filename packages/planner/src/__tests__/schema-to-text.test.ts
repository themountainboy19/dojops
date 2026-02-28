import { describe, it, expect } from "vitest";
import { z } from "zod";
import { zodSchemaToText } from "../schema-to-text";

describe("zodSchemaToText", () => {
  it("describes a required string field", () => {
    const schema = z.object({ name: z.string() });
    const text = zodSchemaToText(schema);
    expect(text).toBe("name (string, required)");
  });

  it("describes a required number field", () => {
    const schema = z.object({ port: z.number() });
    const text = zodSchemaToText(schema);
    expect(text).toBe("port (number, required)");
  });

  it("describes a required boolean field", () => {
    const schema = z.object({ enabled: z.boolean() });
    const text = zodSchemaToText(schema);
    expect(text).toBe("enabled (boolean, required)");
  });

  it("describes an enum field", () => {
    const schema = z.object({ provider: z.enum(["aws", "gcp", "azure"]) });
    const text = zodSchemaToText(schema);
    expect(text).toBe('provider ("aws" | "gcp" | "azure", required)');
  });

  it("describes an optional field", () => {
    const schema = z.object({ tag: z.string().optional() });
    const text = zodSchemaToText(schema);
    expect(text).toBe("tag (string, optional)");
  });

  it("describes a field with default value", () => {
    const schema = z.object({ replicas: z.number().default(1) });
    const text = zodSchemaToText(schema);
    expect(text).toBe("replicas (number, optional, default: 1)");
  });

  it("describes an enum field with default", () => {
    const schema = z.object({
      backend: z.enum(["local", "s3", "gcs"]).default("local"),
    });
    const text = zodSchemaToText(schema);
    expect(text).toBe('backend ("local" | "s3" | "gcs", optional, default: "local")');
  });

  it("includes .describe() text", () => {
    const schema = z.object({
      resources: z.string().describe("Infrastructure resources to provision"),
    });
    const text = zodSchemaToText(schema);
    expect(text).toBe("resources (string, required) - Infrastructure resources to provision");
  });

  it("handles a composite schema matching TerraformInputSchema shape", () => {
    const schema = z.object({
      projectPath: z.string(),
      provider: z.enum(["aws", "gcp", "azure"]),
      resources: z.string().describe("Description of infrastructure resources to provision"),
      backendType: z.enum(["local", "s3", "gcs", "azurerm"]).default("local"),
    });

    const text = zodSchemaToText(schema);
    const lines = text.split("\n");

    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe("projectPath (string, required)");
    expect(lines[1]).toBe('provider ("aws" | "gcp" | "azure", required)');
    expect(lines[2]).toBe(
      "resources (string, required) - Description of infrastructure resources to provision",
    );
    expect(lines[3]).toBe(
      'backendType ("local" | "s3" | "gcs" | "azurerm", optional, default: "local")',
    );
  });

  it("handles non-object schema fallback", () => {
    const schema = z.string();
    const text = zodSchemaToText(schema);
    expect(text).toBe("string");
  });

  it("describes an array field", () => {
    const schema = z.object({ tags: z.array(z.string()) });
    const text = zodSchemaToText(schema);
    expect(text).toBe("tags (array of string, required)");
  });
});
