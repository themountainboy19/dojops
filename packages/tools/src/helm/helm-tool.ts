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
import { verifyHelmChart } from "./verifier";
import { LLMProvider } from "@dojops/core";
import { HelmInputSchema, HelmInput } from "./schemas";
import {
  generateHelmValues,
  generateChartYaml,
  valuesToYaml,
  generateDeploymentTemplate,
  generateServiceTemplate,
  generateHelpersTemplate,
  generateIngressTemplate,
  generateServiceAccountTemplate,
  generateHPATemplate,
} from "./generator";

export class HelmTool extends BaseTool<HelmInput> {
  name = "helm";
  description = "Generates Helm chart scaffolding with deployment, service, and values";
  inputSchema = HelmInputSchema;

  constructor(private provider: LLMProvider) {
    super();
  }

  async generate(input: HelmInput): Promise<ToolOutput> {
    const existingContent =
      input.existingContent ??
      readExistingConfig(path.join(input.outputPath, input.chartName, "values.yaml"));
    const isUpdate = !!existingContent;

    try {
      const chartResponse = await generateHelmValues(
        input,
        this.provider,
        existingContent ?? undefined,
      );
      const chartYaml = generateChartYaml(input);
      const valuesYaml = valuesToYaml(chartResponse.values);
      const deploymentTpl = generateDeploymentTemplate(input.chartName);
      const serviceTpl = generateServiceTemplate(input.chartName);
      const helpersTpl = generateHelpersTemplate(input.chartName);

      const templates: Record<string, string> = {
        deployment: deploymentTpl,
        service: serviceTpl,
        helpers: helpersTpl,
      };

      if (chartResponse.ingress?.enabled) {
        templates.ingress = generateIngressTemplate(input.chartName);
      }
      if (chartResponse.serviceAccount?.create) {
        templates.serviceaccount = generateServiceAccountTemplate(input.chartName);
      }
      if (chartResponse.autoscaling?.enabled) {
        templates.hpa = generateHPATemplate(input.chartName);
      }

      return {
        success: true,
        data: {
          chartYaml,
          valuesYaml,
          templates,
          notes: chartResponse.notes,
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
    const d = data as {
      chartYaml?: string;
      valuesYaml?: string;
      templates?: Record<string, string>;
    };
    return verifyHelmChart(d?.chartYaml ?? "", d?.valuesYaml ?? "", d?.templates ?? {});
  }

  async execute(input: HelmInput): Promise<ToolOutput> {
    const result = await this.generate(input);
    if (!result.success || !result.data) return result;

    const data = result.data as {
      chartYaml: string;
      valuesYaml: string;
      templates: Record<string, string>;
      isUpdate: boolean;
    };

    const chartDir = path.join(input.outputPath, input.chartName);
    const templatesDir = path.join(chartDir, "templates");

    // Map template keys to filenames
    const templateFileMap: Record<string, string> = {
      deployment: "deployment.yaml",
      service: "service.yaml",
      helpers: "_helpers.tpl",
      ingress: "ingress.yaml",
      serviceaccount: "serviceaccount.yaml",
      hpa: "hpa.yaml",
    };

    if (data.isUpdate) {
      backupFile(path.join(chartDir, "Chart.yaml"));
      backupFile(path.join(chartDir, "values.yaml"));
      for (const key of Object.keys(data.templates)) {
        const fileName = templateFileMap[key] ?? `${key}.yaml`;
        backupFile(path.join(templatesDir, fileName));
      }
    }

    fs.mkdirSync(templatesDir, { recursive: true });

    const chartYamlPath = path.join(chartDir, "Chart.yaml");
    const valuesYamlPath = path.join(chartDir, "values.yaml");

    atomicWriteFileSync(chartYamlPath, data.chartYaml);
    atomicWriteFileSync(valuesYamlPath, data.valuesYaml);

    const filesWritten = [chartYamlPath, valuesYamlPath];

    for (const [key, content] of Object.entries(data.templates)) {
      const fileName = templateFileMap[key] ?? `${key}.yaml`;
      const filePath = path.join(templatesDir, fileName);
      atomicWriteFileSync(filePath, content);
      filesWritten.push(filePath);
    }

    return { ...result, filesWritten, filesModified: data.isUpdate ? filesWritten : [] };
  }
}
