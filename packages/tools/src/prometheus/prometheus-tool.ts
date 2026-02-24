import * as fs from "fs";
import * as path from "path";
import { BaseTool, ToolOutput, readExistingConfig, backupFile } from "@dojops/sdk";
import { LLMProvider } from "@dojops/core";
import { PrometheusInputSchema, PrometheusInput } from "./schemas";
import { generatePrometheusConfig, prometheusToYaml, alertRulesToYaml } from "./generator";

export class PrometheusTool extends BaseTool<PrometheusInput> {
  name = "prometheus";
  description = "Generates Prometheus monitoring configuration and alert rules";
  inputSchema = PrometheusInputSchema;

  constructor(private provider: LLMProvider) {
    super();
  }

  async generate(input: PrometheusInput): Promise<ToolOutput> {
    const existingContent =
      input.existingContent ?? readExistingConfig(path.join(input.outputPath, "prometheus.yml"));
    const isUpdate = !!existingContent;

    try {
      const config = await generatePrometheusConfig(
        input,
        this.provider,
        existingContent ?? undefined,
      );
      const prometheusYaml = prometheusToYaml(config);
      const alertsYaml = alertRulesToYaml(config);

      return {
        success: true,
        data: {
          config,
          prometheusYaml,
          alertsYaml,
          isUpdate,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async execute(input: PrometheusInput): Promise<ToolOutput> {
    const result = await this.generate(input);
    if (!result.success || !result.data) return result;

    const data = result.data as {
      prometheusYaml: string;
      alertsYaml: string | null;
      isUpdate: boolean;
    };
    const filePath = path.join(input.outputPath, "prometheus.yml");

    if (data.isUpdate) {
      backupFile(filePath);
    }

    fs.mkdirSync(input.outputPath, { recursive: true });
    fs.writeFileSync(filePath, data.prometheusYaml, "utf-8");

    if (data.alertsYaml) {
      fs.writeFileSync(path.join(input.outputPath, "alert-rules.yml"), data.alertsYaml, "utf-8");
    }

    return result;
  }
}
