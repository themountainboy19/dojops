import * as fs from "fs";
import * as path from "path";

export interface TerraformDetectResult {
  exists: boolean;
  hasState: boolean;
  providers: string[];
}

export function detectTerraformProject(projectPath: string): TerraformDetectResult {
  const tfFiles = fs.existsSync(projectPath)
    ? fs.readdirSync(projectPath).filter((f) => f.endsWith(".tf"))
    : [];

  const hasState =
    fs.existsSync(path.join(projectPath, "terraform.tfstate")) ||
    fs.existsSync(path.join(projectPath, ".terraform"));

  const providers: string[] = [];
  for (const file of tfFiles) {
    const content = fs.readFileSync(path.join(projectPath, file), "utf-8");
    if (content.includes('"aws"') || content.includes("aws_")) providers.push("aws");
    if (content.includes('"google"') || content.includes("google_")) providers.push("gcp");
    if (content.includes('"azurerm"') || content.includes("azurerm_")) providers.push("azure");
  }

  return {
    exists: tfFiles.length > 0,
    hasState,
    providers: [...new Set(providers)],
  };
}
