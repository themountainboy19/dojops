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
import { verifySystemdUnit } from "./verifier";
import { LLMProvider } from "@dojops/core";
import { SystemdInputSchema, SystemdInput } from "./schemas";
import { generateSystemdConfig, systemdConfigToString } from "./generator";

export class SystemdTool extends BaseTool<SystemdInput> {
  name = "systemd";
  description = "Generates systemd service unit files for Linux daemon management";
  inputSchema = SystemdInputSchema;

  constructor(private provider: LLMProvider) {
    super();
  }

  async generate(input: SystemdInput): Promise<ToolOutput> {
    const existingContent =
      input.existingContent ??
      readExistingConfig(path.join(input.outputPath, `${input.serviceName}.service`));
    const isUpdate = !!existingContent;

    try {
      const config = await generateSystemdConfig(
        input,
        this.provider,
        existingContent ?? undefined,
      );
      const unitFile = systemdConfigToString(config);

      return {
        success: true,
        data: {
          config,
          unitFile,
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
    const d = data as { unitFile?: string };
    return verifySystemdUnit(d?.unitFile ?? "");
  }

  async execute(input: SystemdInput): Promise<ToolOutput> {
    const result = await this.generate(input);
    if (!result.success || !result.data) return result;

    const data = result.data as { unitFile: string; isUpdate: boolean };
    const filePath = path.join(input.outputPath, `${input.serviceName}.service`);

    if (data.isUpdate) {
      backupFile(filePath);
    }

    fs.mkdirSync(input.outputPath, { recursive: true });
    atomicWriteFileSync(filePath, data.unitFile);

    const filesWritten = [filePath];
    return { ...result, filesWritten, filesModified: data.isUpdate ? [filePath] : [] };
  }
}
