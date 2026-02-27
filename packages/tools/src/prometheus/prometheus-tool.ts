import * as fs from "fs";
import * as path from "path";
import {
  BaseTool,
  ToolOutput,
  VerificationResult,
  readExistingConfig,
  backupFile,
  atomicWriteFileSync,
} from "@dojops/sdk";
import { verifyPrometheusConfig } from "./verifier";
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

  async verify(data: unknown): Promise<VerificationResult> {
    const d = data as { prometheusYaml?: string };
    return verifyPrometheusConfig(d?.prometheusYaml ?? "");
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
    atomicWriteFileSync(filePath, data.prometheusYaml);

    const filesWritten = [filePath];
    if (data.alertsYaml) {
      const alertPath = path.join(input.outputPath, "alert-rules.yml");
      atomicWriteFileSync(alertPath, data.alertsYaml);
      filesWritten.push(alertPath);
    }

    return { ...result, filesWritten, filesModified: data.isUpdate ? [filePath] : [] };
  }
}
