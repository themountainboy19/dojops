import * as fs from "node:fs";
import * as path from "node:path";

const SKILL_DIR_NAME = "skills";

function getGlobalSkillsDir(): string | null {
  const home = process.env.HOME ?? process.env.USERPROFILE;
  if (!home) return null;
  return path.join(home, ".dojops", SKILL_DIR_NAME);
}

function getProjectSkillsDir(projectPath: string): string {
  return path.join(projectPath, ".dojops", SKILL_DIR_NAME);
}

/**
 * Discovered .dops file path entry.
 */
export interface DopsFileEntry {
  filePath: string;
  location: "global" | "project";
}

/**
 * Discover .dops files from a directory.
 * Returns file paths for .dops files found in the directory.
 */
export function discoverDopsFiles(dir: string, location: "global" | "project"): DopsFileEntry[] {
  const entries: DopsFileEntry[] = [];
  if (!fs.existsSync(dir)) return entries;
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file.endsWith(".dops")) {
        entries.push({ filePath: path.join(dir, file), location });
      }
    }
  } catch {
    // Directory not readable
  }
  return entries;
}

/** Merge discovered .dops entries into the map. When `override` is true, always overwrites; otherwise only adds new names. */
function mergeDopsEntries(
  dir: string,
  location: "global" | "project",
  byName: Map<string, DopsFileEntry>,
  override: boolean,
): void {
  for (const entry of discoverDopsFiles(dir, location)) {
    const name = path.basename(entry.filePath, ".dops");
    if (override || !byName.has(name)) {
      byName.set(name, entry);
    }
  }
}

/**
 * Discover all user .dops files from global and project directories.
 * Project .dops files override global by name.
 */
export function discoverUserDopsFiles(projectPath?: string): DopsFileEntry[] {
  const byName = new Map<string, DopsFileEntry>();

  // Global skills
  const globalDir = getGlobalSkillsDir();
  if (globalDir) mergeDopsEntries(globalDir, "global", byName, true);

  // Project (overrides global)
  if (projectPath) {
    mergeDopsEntries(getProjectSkillsDir(projectPath), "project", byName, true);
  }

  return Array.from(byName.values());
}
