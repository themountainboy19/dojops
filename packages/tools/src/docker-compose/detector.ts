import * as fs from "fs";
import * as path from "path";

export interface ComposeDetectionResult {
  projectType: string;
  hasExistingCompose: boolean;
  hasDockerfile: boolean;
  confidence: number;
  reason: string;
}

const INDICATORS: { file: string; type: string }[] = [
  { file: "package.json", type: "node" },
  { file: "requirements.txt", type: "python" },
  { file: "pyproject.toml", type: "python" },
  { file: "go.mod", type: "go" },
  { file: "Cargo.toml", type: "rust" },
  { file: "pom.xml", type: "java" },
  { file: "Gemfile", type: "ruby" },
];

const COMPOSE_FILES = ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"];

export function detectComposeContext(projectPath: string): ComposeDetectionResult {
  const hasExistingCompose = COMPOSE_FILES.some((f) => fs.existsSync(path.join(projectPath, f)));
  const hasDockerfile = fs.existsSync(path.join(projectPath, "Dockerfile"));

  let projectType = "unknown";
  for (const indicator of INDICATORS) {
    if (fs.existsSync(path.join(projectPath, indicator.file))) {
      projectType = indicator.type;
      break;
    }
  }

  return {
    projectType,
    hasExistingCompose,
    hasDockerfile,
    confidence: projectType !== "unknown" ? 0.9 : 0,
    reason:
      projectType !== "unknown"
        ? `Detected ${projectType} project`
        : "No recognized project files found",
  };
}
