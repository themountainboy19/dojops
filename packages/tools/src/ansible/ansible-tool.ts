import * as fs from "fs";
import * as path from "path";
import { BaseTool, ToolOutput, readExistingConfig, backupFile } from "@dojops/sdk";
import { LLMProvider } from "@dojops/core";
import { AnsibleInputSchema, AnsibleInput } from "./schemas";
import { generateAnsiblePlaybook, playbookToYaml } from "./generator";

export class AnsibleTool extends BaseTool<AnsibleInput> {
  name = "ansible";
  description = "Generates Ansible playbooks for server configuration and provisioning";
  inputSchema = AnsibleInputSchema;

  constructor(private provider: LLMProvider) {
    super();
  }

  async generate(input: AnsibleInput): Promise<ToolOutput> {
    const existingContent =
      input.existingContent ??
      readExistingConfig(path.join(input.outputPath, `${input.playbookName}.yml`));
    const isUpdate = !!existingContent;

    try {
      const playbook = await generateAnsiblePlaybook(
        input,
        this.provider,
        existingContent ?? undefined,
      );
      const yamlContent = playbookToYaml(playbook, input);

      return {
        success: true,
        data: {
          playbook,
          yaml: yamlContent,
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

  async execute(input: AnsibleInput): Promise<ToolOutput> {
    const result = await this.generate(input);
    if (!result.success || !result.data) return result;

    const data = result.data as { yaml: string; isUpdate: boolean };
    const filePath = path.join(input.outputPath, `${input.playbookName}.yml`);

    if (data.isUpdate) {
      backupFile(filePath);
    }

    fs.mkdirSync(input.outputPath, { recursive: true });
    fs.writeFileSync(filePath, data.yaml, "utf-8");

    return result;
  }
}
