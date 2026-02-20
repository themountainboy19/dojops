import { z } from "zod";

export const TerraformProviderEnum = z.enum(["aws", "gcp", "azure"]);

export const TerraformInputSchema = z.object({
  projectPath: z.string(),
  provider: TerraformProviderEnum,
  resources: z.string().describe("Description of infrastructure resources to provision"),
  backendType: z.enum(["local", "s3", "gcs", "azurerm"]).default("local"),
});

export type TerraformInput = z.infer<typeof TerraformInputSchema>;

export const TerraformVariableSchema = z.object({
  name: z.string(),
  type: z.string(),
  description: z.string(),
  default: z.unknown().optional(),
});

export const TerraformResourceSchema = z.object({
  type: z.string(),
  name: z.string(),
  config: z.record(z.unknown()),
});

export const TerraformConfigSchema = z.object({
  provider: z.object({
    name: z.string(),
    region: z.string().optional(),
    config: z.record(z.unknown()).default({}),
  }),
  backend: z
    .object({
      type: z.string(),
      config: z.record(z.unknown()).default({}),
    })
    .optional(),
  variables: z.array(TerraformVariableSchema).default([]),
  resources: z.array(TerraformResourceSchema).min(1),
  outputs: z
    .array(
      z.object({
        name: z.string(),
        value: z.string(),
        description: z.string().optional(),
      }),
    )
    .default([]),
});

export type TerraformConfig = z.infer<typeof TerraformConfigSchema>;
