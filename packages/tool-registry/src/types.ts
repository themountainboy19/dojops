export interface PluginManifest {
  spec: number;
  name: string;
  version: string;
  type: "tool";
  description: string;
  inputSchema: string;
  outputSchema?: string;
  tags?: string[];
  generator: {
    strategy: "llm";
    systemPrompt: string;
    updateMode?: boolean;
    existingDelimiter?: string;
    userPromptTemplate?: string;
  };
  files: Array<{
    path: string;
    serializer: "yaml" | "json" | "hcl" | "ini" | "toml" | "raw";
  }>;
  verification?: {
    command: string;
  };
  detector?: {
    path: string | string[];
  };
  permissions?: {
    filesystem?: "project" | "global";
    network?: "none" | "inherit";
    child_process?: "none" | "required";
  };
}

export interface PluginSource {
  type: "built-in" | "plugin";
  location?: "global" | "project";
  pluginPath?: string;
  pluginVersion?: string;
  pluginHash?: string;
}

export interface PluginEntry {
  manifest: PluginManifest;
  pluginDir: string;
  source: PluginSource;
  inputSchemaRaw: Record<string, unknown>;
  outputSchemaRaw?: Record<string, unknown>;
}
