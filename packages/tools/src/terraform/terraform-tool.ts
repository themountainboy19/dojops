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
import { LLMProvider } from "@dojops/core";
import { TerraformInputSchema, TerraformInput } from "./schemas";
import { detectTerraformProject } from "./detector";
import { generateTerraformConfig, configToHcl } from "./generator";
import { verifyTerraformHcl } from "./verifier";

export class TerraformTool extends BaseTool<TerraformInput> {
  name = "terraform";
  description = "Generates Terraform infrastructure-as-code configurations";
  inputSchema = TerraformInputSchema;

  constructor(private provider: LLMProvider) {
    super();
  }

  async generate(input: TerraformInput): Promise<ToolOutput> {
    const detection = detectTerraformProject(input.projectPath);

    const existingContent =
      input.existingContent ?? readExistingConfig(path.join(input.projectPath, "main.tf"));
    const isUpdate = !!existingContent;

    try {
      const config = await generateTerraformConfig(
        input.provider,
        input.resources,
        input.backendType,
        this.provider,
        existingContent ?? undefined,
      );

      const hcl = configToHcl(config);

      return {
        success: true,
        data: {
          existingProject: detection.exists,
          config,
          hcl,
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
    const d = data as { hcl?: string };
    const hcl = d?.hcl ?? "";
    return verifyTerraformHcl(hcl);
  }

  async execute(input: TerraformInput): Promise<ToolOutput> {
    const result = await this.generate(input);
    if (!result.success || !result.data) return result;

    const data = result.data as { hcl: string; isUpdate: boolean };
    const filePath = path.join(input.projectPath, "main.tf");

    if (data.isUpdate) {
      backupFile(filePath);
    }

    fs.mkdirSync(input.projectPath, { recursive: true });
    atomicWriteFileSync(filePath, data.hcl);

    const filesWritten = [filePath];
    return { ...result, filesWritten, filesModified: data.isUpdate ? [filePath] : [] };
  }
}
