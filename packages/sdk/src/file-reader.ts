import * as fs from "fs";
import * as path from "path";

const MAX_CONTENT_SIZE = 50 * 1024; // 50 KB

export function atomicWriteFileSync(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, content, "utf-8");
  fs.renameSync(tmpPath, filePath);
}

export function restoreBackup(filePath: string): boolean {
  const bakPath = `${filePath}.bak`;
  if (fs.existsSync(bakPath)) {
    fs.renameSync(bakPath, filePath);
    return true;
  }
  return false;
}

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
