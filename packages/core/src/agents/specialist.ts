import { LLMProvider, LLMRequest, LLMResponse } from "../llm/provider";
import { ToolDependency } from "./tool-deps";

export interface SpecialistConfig {
  name: string;
  domain: string;
  description?: string;
  systemPrompt: string;
  keywords: string[];
  toolDependencies?: ToolDependency[];
}

export class SpecialistAgent {
  constructor(
    private provider: LLMProvider,
    private config: SpecialistConfig,
  ) {}

  get name(): string {
    return this.config.name;
  }

  get domain(): string {
    return this.config.domain;
  }

  get description(): string | undefined {
    return this.config.description;
  }

  get keywords(): string[] {
    return this.config.keywords;
  }

  get toolDependencies(): ToolDependency[] {
    return this.config.toolDependencies ?? [];
  }

  async run(request: Omit<LLMRequest, "system">): Promise<LLMResponse> {
    return this.provider.generate({
      ...request,
      system: this.config.systemPrompt,
    });
  }
}
