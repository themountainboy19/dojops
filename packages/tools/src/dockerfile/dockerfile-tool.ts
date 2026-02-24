import * as fs from "fs";
import * as path from "path";
import {
  BaseTool,
  ToolOutput,
  VerificationResult,
  readExistingConfig,
  backupFile,
} from "@dojops/sdk";
import { LLMProvider } from "@dojops/core";
import { DockerfileInputSchema, DockerfileInput } from "./schemas";
import { detectDockerContext } from "./detector";
import { generateDockerfileConfig, dockerfileToString, dockerignoreToString } from "./generator";
import { verifyDockerfile as verifyDockerfileContent } from "./verifier";

export class DockerfileTool extends BaseTool<DockerfileInput> {
  name = "dockerfile";
  description = "Generates multi-stage Dockerfiles and .dockerignore based on project type";
  inputSchema = DockerfileInputSchema;

  constructor(private provider: LLMProvider) {
    super();
  }

  async generate(input: DockerfileInput): Promise<ToolOutput> {
    const detection = detectDockerContext(input.projectPath);

    if (detection.projectType === "unknown") {
      return {
        success: false,
        error: `Could not detect project type at ${input.projectPath}`,
      };
    }

    const existingContent =
      input.existingContent ??
      readExistingConfig(path.join(input.outputPath, "Dockerfile")) ??
      readExistingConfig(path.join(input.projectPath, "Dockerfile"));
    const isUpdate = !!existingContent;

    try {
      const config = await generateDockerfileConfig(
        detection,
        input.baseImage,
        this.provider,
        existingContent ?? undefined,
      );

      const dockerfile = dockerfileToString(config);
      const dockerignore =
        config.dockerignorePatterns.length > 0
          ? dockerignoreToString(config.dockerignorePatterns)
          : null;

      return {
        success: true,
        data: {
          detection,
          config,
          dockerfile,
          dockerignore,
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
    const d = data as { dockerfile?: string };
    const dockerfile = d?.dockerfile ?? "";
    return verifyDockerfileContent(dockerfile);
  }

  async execute(input: DockerfileInput): Promise<ToolOutput> {
    const result = await this.generate(input);
    if (!result.success || !result.data) return result;

    const data = result.data as {
      dockerfile: string;
      dockerignore: string | null;
      isUpdate: boolean;
    };
    const filePath = path.join(input.outputPath, "Dockerfile");

    if (data.isUpdate) {
      backupFile(filePath);
    }

    fs.mkdirSync(input.outputPath, { recursive: true });
    fs.writeFileSync(filePath, data.dockerfile, "utf-8");

    if (data.dockerignore) {
      fs.writeFileSync(path.join(input.outputPath, ".dockerignore"), data.dockerignore, "utf-8");
    }

    return result;
  }
}
