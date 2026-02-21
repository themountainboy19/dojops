import * as fs from "fs";
import * as path from "path";

export interface GitLabProjectTypeResult {
  type: string;
  confidence: number;
  reason: string;
}

const INDICATORS: { file: string; type: string; reason: string }[] = [
  { file: "package.json", type: "node", reason: "Found package.json" },
  { file: "requirements.txt", type: "python", reason: "Found requirements.txt" },
  { file: "pyproject.toml", type: "python", reason: "Found pyproject.toml" },
  { file: "go.mod", type: "go", reason: "Found go.mod" },
  { file: "Cargo.toml", type: "rust", reason: "Found Cargo.toml" },
  { file: "pom.xml", type: "java", reason: "Found pom.xml" },
  { file: "build.gradle", type: "java", reason: "Found build.gradle" },
  { file: "Gemfile", type: "ruby", reason: "Found Gemfile" },
];

export function detectGitLabProjectType(projectPath: string): GitLabProjectTypeResult {
  for (const indicator of INDICATORS) {
    const filePath = path.join(projectPath, indicator.file);
    if (fs.existsSync(filePath)) {
      return {
        type: indicator.type,
        confidence: 0.9,
        reason: indicator.reason,
      };
    }
  }

  return {
    type: "unknown",
    confidence: 0,
    reason: "No recognized project files found",
  };
}
