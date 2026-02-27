import { LLMProvider, parseAndValidate } from "@dojops/core";
import { TerraformConfig, TerraformConfigSchema } from "./schemas";

/**
 * Attributes that should use HCL assignment syntax (`key = { ... }`)
 * rather than block syntax (`key { ... }`). These are maps/objects that
 * represent key-value assignments, not nested sub-resource blocks.
 */
const MAP_ATTRIBUTES = new Set([
  "tags",
  "labels",
  "annotations",
  "metadata",
  "variables",
  "environment",
  "default_tags",
]);

export async function generateTerraformConfig(
  provider: string,
  resources: string,
  backendType: string,
  llm: LLMProvider,
  existingContent?: string,
): Promise<TerraformConfig> {
  const isUpdate = !!existingContent;
  const system = isUpdate
    ? `You are a Terraform expert. Update the existing Terraform configuration as structured JSON.
Preserve existing resources and settings. Only add/modify what is requested.
Use the ${provider} provider. Backend type: ${backendType}.

You MUST respond with a JSON object matching this exact structure:
{
  "provider": { "name": "${provider}", "region": "us-east-1", "config": {} },
  "backend": { "type": "${backendType}", "config": {} },
  "variables": [
    { "name": "var_name", "type": "string", "description": "desc", "default": "value" }
  ],
  "resources": [
    { "type": "aws_instance", "name": "web", "config": { "ami": "ami-xxx", "instance_type": "t2.micro" } }
  ],
  "outputs": [
    { "name": "output_name", "value": "aws_instance.web.public_ip", "description": "desc" }
  ]
}

IMPORTANT:
- "provider" must be an object with "name" (string), optional "region", and "config" (object)
- "variables", "resources", and "outputs" must be ARRAYS of objects, not objects/maps
- Each resource must have "type", "name", and "config" fields
- Respond with valid JSON only, no markdown`
    : `You are a Terraform expert. Generate Terraform configuration as structured JSON.
Use the ${provider} provider. Backend type: ${backendType}.

You MUST respond with a JSON object matching this exact structure:
{
  "provider": { "name": "${provider}", "region": "us-east-1", "config": {} },
  "backend": { "type": "${backendType}", "config": {} },
  "variables": [
    { "name": "var_name", "type": "string", "description": "desc", "default": "value" }
  ],
  "resources": [
    { "type": "aws_instance", "name": "web", "config": { "ami": "ami-xxx", "instance_type": "t2.micro" } }
  ],
  "outputs": [
    { "name": "output_name", "value": "aws_instance.web.public_ip", "description": "desc" }
  ]
}

IMPORTANT:
- "provider" must be an object with "name" (string), optional "region", and "config" (object)
- "variables", "resources", and "outputs" must be ARRAYS of objects, not objects/maps
- Each resource must have "type", "name", and "config" fields
- Respond with valid JSON only, no markdown`;

  const basePrompt = `${isUpdate ? "Update" : "Generate"} Terraform configuration for: ${resources}`;
  const prompt = isUpdate
    ? `${basePrompt}\n\n--- EXISTING CONFIGURATION ---\n${existingContent}\n--- END ---`
    : basePrompt;

  const response = await llm.generate({
    system,
    prompt,
    schema: TerraformConfigSchema,
  });

  if (response.parsed) {
    return response.parsed as TerraformConfig;
  }
  return parseAndValidate(response.content, TerraformConfigSchema);
}

export function configToHcl(config: TerraformConfig): string {
  const lines: string[] = [];

  lines.push(`terraform {`);
  lines.push(`  required_providers {`);
  lines.push(`    ${config.provider.name} = {`);
  lines.push(`      source = "${providerSource(config.provider.name)}"`);
  lines.push(`    }`);
  lines.push(`  }`);
  if (config.backend) {
    lines.push(`  backend "${config.backend.type}" {`);
    for (const [k, v] of Object.entries(config.backend.config)) {
      lines.push(`    ${k} = ${hclValue(v)}`);
    }
    lines.push(`  }`);
  }
  lines.push(`}`);
  lines.push(``);

  lines.push(`provider "${config.provider.name}" {`);
  if (config.provider.region) {
    lines.push(`  region = "${config.provider.region}"`);
  }
  for (const [k, v] of Object.entries(config.provider.config)) {
    lines.push(`  ${k} = ${hclValue(v)}`);
  }
  lines.push(`}`);
  lines.push(``);

  for (const variable of config.variables) {
    lines.push(`variable "${variable.name}" {`);
    lines.push(`  type        = ${variable.type}`);
    lines.push(`  description = "${variable.description}"`);
    if (variable.default !== undefined) {
      lines.push(`  default     = ${hclValue(variable.default)}`);
    }
    lines.push(`}`);
    lines.push(``);
  }

  if (config.locals && config.locals.length > 0) {
    lines.push(`locals {`);
    for (const local of config.locals) {
      lines.push(`  ${local.name} = ${hclValue(local.value)}`);
    }
    lines.push(`}`);
    lines.push(``);
  }

  if (config.dataSources) {
    for (const ds of config.dataSources) {
      lines.push(`data "${ds.type}" "${ds.name}" {`);
      for (const [k, v] of Object.entries(ds.config)) {
        if (typeof v === "object" && v !== null && !Array.isArray(v)) {
          if (MAP_ATTRIBUTES.has(k)) {
            lines.push(`  ${k} = ${hclMap(v as Record<string, unknown>, 2)}`);
          } else {
            lines.push(`  ${k} ${hclBlock(v as Record<string, unknown>, 2)}`);
          }
        } else {
          lines.push(`  ${k} = ${hclValue(v)}`);
        }
      }
      lines.push(`}`);
      lines.push(``);
    }
  }

  if (config.modules) {
    for (const mod of config.modules) {
      lines.push(`module "${mod.name}" {`);
      lines.push(`  source = "${escapeHclString(mod.source)}"`);
      for (const [k, v] of Object.entries(mod.config)) {
        if (typeof v === "object" && v !== null && !Array.isArray(v)) {
          if (MAP_ATTRIBUTES.has(k)) {
            lines.push(`  ${k} = ${hclMap(v as Record<string, unknown>, 2)}`);
          } else {
            lines.push(`  ${k} ${hclBlock(v as Record<string, unknown>, 2)}`);
          }
        } else {
          lines.push(`  ${k} = ${hclValue(v)}`);
        }
      }
      lines.push(`}`);
      lines.push(``);
    }
  }

  for (const resource of config.resources) {
    lines.push(`resource "${resource.type}" "${resource.name}" {`);
    for (const [k, v] of Object.entries(resource.config)) {
      if (typeof v === "object" && v !== null && !Array.isArray(v)) {
        if (MAP_ATTRIBUTES.has(k)) {
          lines.push(`  ${k} = ${hclMap(v as Record<string, unknown>, 2)}`);
        } else {
          lines.push(`  ${k} ${hclBlock(v as Record<string, unknown>, 2)}`);
        }
      } else {
        lines.push(`  ${k} = ${hclValue(v)}`);
      }
    }
    lines.push(`}`);
    lines.push(``);
  }

  for (const output of config.outputs) {
    lines.push(`output "${output.name}" {`);
    lines.push(`  value = ${output.value}`);
    if (output.description) {
      lines.push(`  description = "${output.description}"`);
    }
    lines.push(`}`);
    lines.push(``);
  }

  return lines.join("\n");
}

function providerSource(name: string): string {
  const sources: Record<string, string> = {
    aws: "hashicorp/aws",
    google: "hashicorp/google",
    azurerm: "hashicorp/azurerm",
  };
  return sources[name] ?? `hashicorp/${name}`;
}

function escapeHclString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\t/g, "\\t");
}

function hclValue(v: unknown): string {
  if (typeof v === "string") return `"${escapeHclString(v)}"`;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return "[]";
    if (v.every((item) => typeof item !== "object" || item === null)) {
      return `[${v.map((item) => hclValue(item)).join(", ")}]`;
    }
    return `[${v.map((item) => hclValue(item)).join(", ")}]`;
  }
  if (typeof v === "object" && v !== null) {
    return hclBlock(v as Record<string, unknown>, 2);
  }
  return JSON.stringify(v);
}

function hclBlock(obj: Record<string, unknown>, indent: number): string {
  const pad = " ".repeat(indent);
  const lines: string[] = ["{"];
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === "object" && val !== null && !Array.isArray(val)) {
      if (MAP_ATTRIBUTES.has(key)) {
        lines.push(`${pad}  ${key} = ${hclMap(val as Record<string, unknown>, indent + 2)}`);
      } else {
        lines.push(`${pad}  ${key} ${hclBlock(val as Record<string, unknown>, indent + 2)}`);
      }
    } else {
      lines.push(`${pad}  ${key} = ${hclValue(val)}`);
    }
  }
  lines.push(`${pad}}`);
  return lines.join("\n");
}

/**
 * Serializes an object as an HCL map using assignment syntax: `{ key = value, ... }`.
 * Used for attributes like tags, labels, annotations, etc. that are maps rather than blocks.
 */
function hclMap(obj: Record<string, unknown>, indent: number): string {
  const pad = " ".repeat(indent);
  const entries = Object.entries(obj);
  if (entries.length === 0) return "{}";
  const lines: string[] = ["{"];
  for (const [key, val] of entries) {
    lines.push(`${pad}  ${key} = ${hclValue(val)}`);
  }
  lines.push(`${pad}}`);
  return lines.join("\n");
}
