import * as fs from "fs";
import * as path from "path";
import { BaseTool, ToolOutput, readExistingConfig, backupFile } from "@dojops/sdk";
import { LLMProvider } from "@dojops/core";
import { GitHubActionsInputSchema, GitHubActionsInput } from "./schemas";
import { detectProjectType } from "./detector";
import { generateWorkflow, workflowToYaml } from "./generator";

export class GitHubActionsTool extends BaseTool<GitHubActionsInput> {
  name = "github-actions";
  description = "Generates GitHub Actions CI/CD workflow files based on project type";
  inputSchema = GitHubActionsInputSchema;

  constructor(private provider: LLMProvider) {
    super();
  }

  async generate(input: GitHubActionsInput): Promise<ToolOutput> {
    const projectType = detectProjectType(input.projectPath);

    if (projectType.type === "unknown") {
      return {
        success: false,
        error: `Could not detect project type at ${input.projectPath}`,
      };
    }

    const existingContent =
      input.existingContent ??
      readExistingConfig(path.join(input.projectPath, ".github", "workflows", "ci.yml"));
    const isUpdate = !!existingContent;

    try {
      const workflow = await generateWorkflow(
        projectType,
        input.defaultBranch,
        input.nodeVersion,
        this.provider,
        existingContent ?? undefined,
      );

      const yamlContent = workflowToYaml(workflow);

      return {
        success: true,
        data: {
          projectType,
          workflow,
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

  async execute(input: GitHubActionsInput): Promise<ToolOutput> {
    const result = await this.generate(input);
    if (!result.success || !result.data) return result;

    const data = result.data as { yaml: string; isUpdate: boolean };
    const workflowDir = path.join(input.projectPath, ".github", "workflows");
    const filePath = path.join(workflowDir, "ci.yml");

    if (data.isUpdate) {
      backupFile(filePath);
    }

    fs.mkdirSync(workflowDir, { recursive: true });
    fs.writeFileSync(filePath, data.yaml, "utf-8");

    return result;
  }
}
