import { DevOpsTool } from "@dojops/sdk";

/**
 * Interface for DopsRuntime metadata access.
 * Avoids direct dependency on @dojops/runtime from tool-registry.
 */
export interface DopsRuntimeLike extends DevOpsTool {
  readonly systemPromptHash: string;
  readonly moduleHash: string;
  readonly metadata: {
    toolType: "built-in" | "custom";
    toolVersion: string;
    toolHash: string;
    toolSource: string;
    systemPromptHash: string;
  };
}

function isDopsRuntime(tool: DevOpsTool): tool is DopsRuntimeLike {
  return (
    "moduleHash" in tool &&
    "metadata" in tool &&
    typeof (tool as DopsRuntimeLike).metadata === "object"
  );
}

/**
 * Central registry combining built-in and user .dops modules.
 * Provides a unified getAll() / get(name) interface for Planner, Executor, CLI, and API.
 */
export class ToolRegistry {
  private readonly toolMap: Map<string, DevOpsTool>;
  private readonly builtIn: DevOpsTool[];

  constructor(builtInTools: DevOpsTool[]) {
    this.builtIn = builtInTools;
    this.toolMap = new Map();

    for (const tool of builtInTools) {
      this.toolMap.set(tool.name, tool);
    }
  }

  /** All tools, deduplicated by name. */
  getAll(): DevOpsTool[] {
    return Array.from(this.toolMap.values());
  }

  /** Look up a tool by name. */
  get(name: string): DevOpsTool | undefined {
    return this.toolMap.get(name);
  }

  /** Check if a tool exists by name. */
  has(name: string): boolean {
    return this.toolMap.has(name);
  }

  /** Get only built-in tools. */
  getBuiltIn(): DevOpsTool[] {
    return [...this.builtIn];
  }

  /** Extract tool metadata for a tool by name. */
  getToolMetadata(name: string):
    | {
        toolType: "built-in" | "custom";
        toolVersion?: string;
        toolHash?: string;
        toolSource?: string;
        systemPromptHash?: string;
      }
    | undefined {
    const tool = this.toolMap.get(name);
    if (!tool) return undefined;

    // Check if it's a DopsRuntime instance (has metadata property)
    if (isDopsRuntime(tool)) {
      return tool.metadata;
    }

    return { toolType: "built-in" };
  }

  /** Total count of unique tools. */
  get size(): number {
    return this.toolMap.size;
  }
}
