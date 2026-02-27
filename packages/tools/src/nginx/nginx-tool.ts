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
import { verifyNginxConfig } from "./verifier";
import { LLMProvider } from "@dojops/core";
import { NginxInputSchema, NginxInput } from "./schemas";
import { generateNginxConfig, nginxConfigToString } from "./generator";

export class NginxTool extends BaseTool<NginxInput> {
  name = "nginx";
  description = "Generates Nginx reverse proxy configuration with upstream and server blocks";
  inputSchema = NginxInputSchema;

  constructor(private provider: LLMProvider) {
    super();
  }

  async generate(input: NginxInput): Promise<ToolOutput> {
    const existingContent =
      input.existingContent ?? readExistingConfig(path.join(input.outputPath, "nginx.conf"));
    const isUpdate = !!existingContent;

    try {
      const config = await generateNginxConfig(input, this.provider, existingContent ?? undefined);
      const nginxConf = nginxConfigToString(config, input.fullConfig);

      return {
        success: true,
        data: {
          config,
          nginxConf,
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
    const d = data as { nginxConf?: string };
    return verifyNginxConfig(d?.nginxConf ?? "");
  }

  async execute(input: NginxInput): Promise<ToolOutput> {
    const result = await this.generate(input);
    if (!result.success || !result.data) return result;

    const data = result.data as { nginxConf: string; isUpdate: boolean };
    const filePath = path.join(input.outputPath, "nginx.conf");

    if (data.isUpdate) {
      backupFile(filePath);
    }

    fs.mkdirSync(input.outputPath, { recursive: true });
    atomicWriteFileSync(filePath, data.nginxConf);

    const filesWritten = [filePath];
    return { ...result, filesWritten, filesModified: data.isUpdate ? [filePath] : [] };
  }
}
