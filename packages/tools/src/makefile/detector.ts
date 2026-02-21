import * as fs from "fs";
import * as path from "path";

export interface MakefileDetectionResult {
  projectType: string;
  hasExistingMakefile: boolean;
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

export function detectMakefileContext(projectPath: string): MakefileDetectionResult {
  const hasExistingMakefile = ["Makefile", "makefile", "GNUmakefile"].some((f) =>
    fs.existsSync(path.join(projectPath, f)),
  );

  let projectType = "unknown";
  for (const indicator of INDICATORS) {
    if (fs.existsSync(path.join(projectPath, indicator.file))) {
      projectType = indicator.type;
      break;
    }
  }

  return {
    projectType,
    hasExistingMakefile,
    confidence: projectType !== "unknown" ? 0.9 : 0,
    reason:
      projectType !== "unknown"
        ? `Detected ${projectType} project`
        : "No recognized project files found",
  };
}
