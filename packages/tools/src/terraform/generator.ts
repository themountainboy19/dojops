import { LLMProvider } from "@oda/core";
import { TerraformConfig, TerraformConfigSchema } from "./schemas";

export async function generateTerraformConfig(
  provider: string,
  resources: string,
  backendType: string,
  llm: LLMProvider,
): Promise<TerraformConfig> {
  const response = await llm.generate({
    system: `You are a Terraform expert. Generate Terraform configuration as structured JSON.
The JSON must include provider config, variables, resources, and outputs.
Use the ${provider} provider. Backend type: ${backendType}.
Respond with valid JSON only.`,
    prompt: `Generate Terraform configuration for the following infrastructure:
${resources}

Cloud provider: ${provider}
Backend: ${backendType}`,
    schema: TerraformConfigSchema,
  });

  return response.parsed as TerraformConfig;
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

  for (const resource of config.resources) {
    lines.push(`resource "${resource.type}" "${resource.name}" {`);
    for (const [k, v] of Object.entries(resource.config)) {
      lines.push(`  ${k} = ${hclValue(v)}`);
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

function hclValue(v: unknown): string {
  if (typeof v === "string") return `"${v}"`;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}
