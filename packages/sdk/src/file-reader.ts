import * as fs from "fs";

const MAX_CONTENT_SIZE = 50 * 1024; // 50 KB

export function readExistingConfig(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_CONTENT_SIZE) return null;
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

export function backupFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.copyFileSync(filePath, `${filePath}.bak`);
    }
  } catch {
    /* best-effort */
  }
}
