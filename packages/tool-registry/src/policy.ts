import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";

export interface PluginPolicy {
  allowedPlugins?: string[];
  blockedPlugins?: string[];
}

/**
 * Loads plugin policy from .dojops/policy.yaml if present.
 * Returns empty policy (everything allowed) if file is missing.
 */
export function loadPluginPolicy(projectPath?: string): PluginPolicy {
  if (!projectPath) return {};

  const policyPath = path.join(projectPath, ".dojops", "policy.yaml");
  if (!fs.existsSync(policyPath)) return {};

  try {
    const content = fs.readFileSync(policyPath, "utf-8");
    const data = yaml.load(content) as Record<string, unknown> | null;
    if (!data) return {};

    const policy: PluginPolicy = {};
    if (Array.isArray(data.allowedPlugins)) {
      policy.allowedPlugins = data.allowedPlugins.filter((p): p is string => typeof p === "string");
    }
    if (Array.isArray(data.blockedPlugins)) {
      policy.blockedPlugins = data.blockedPlugins.filter((p): p is string => typeof p === "string");
    }
    return policy;
  } catch {
    return {};
  }
}

/**
 * Checks whether a plugin is allowed by the given policy.
 *
 * Rules:
 * 1. If blockedPlugins is set and includes the name → denied
 * 2. If allowedPlugins is set → only those names are allowed
 * 3. Otherwise → allowed (default-open)
 */
export function isPluginAllowed(name: string, policy: PluginPolicy): boolean {
  if (policy.blockedPlugins?.includes(name)) {
    return false;
  }
  if (policy.allowedPlugins && policy.allowedPlugins.length > 0) {
    return policy.allowedPlugins.includes(name);
  }
  return true;
}
