import * as fs from "fs";
import * as path from "path";

export interface DockerDetectionResult {
  projectType: string;
  entryFile: string | null;
  hasLockfile: boolean;
  confidence: number;
  reason: string;
}

const INDICATORS: {
  file: string;
  type: string;
  entry: string;
  lockfiles: string[];
}[] = [
  {
    file: "package.json",
    type: "node",
    entry: "index.js",
    lockfiles: ["package-lock.json", "pnpm-lock.yaml", "yarn.lock"],
  },
  {
    file: "requirements.txt",
    type: "python",
    entry: "app.py",
    lockfiles: ["Pipfile.lock", "poetry.lock"],
  },
  {
    file: "pyproject.toml",
    type: "python",
    entry: "app.py",
    lockfiles: ["poetry.lock"],
  },
  {
    file: "go.mod",
    type: "go",
    entry: "main.go",
    lockfiles: ["go.sum"],
  },
  {
    file: "Cargo.toml",
    type: "rust",
    entry: "src/main.rs",
    lockfiles: ["Cargo.lock"],
  },
  {
    file: "pom.xml",
    type: "java",
    entry: "src/main/java",
    lockfiles: [],
  },
];

export function detectDockerContext(projectPath: string): DockerDetectionResult {
  for (const indicator of INDICATORS) {
    if (fs.existsSync(path.join(projectPath, indicator.file))) {
      const hasLockfile = indicator.lockfiles.some((lf) =>
        fs.existsSync(path.join(projectPath, lf)),
      );

      return {
        projectType: indicator.type,
        entryFile: indicator.entry,
        hasLockfile,
        confidence: 0.9,
        reason: `Found ${indicator.file}`,
      };
    }
  }

  return {
    projectType: "unknown",
    entryFile: null,
    hasLockfile: false,
    confidence: 0,
    reason: "No recognized project files found",
  };
}
