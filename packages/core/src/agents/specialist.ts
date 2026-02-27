import { ChatMessage, LLMProvider, LLMRequest, LLMResponse } from "../llm/provider";
import { sanitizeUserInput } from "../llm/sanitizer";
import { validateRequestSize } from "../llm/input-validator";
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
    const fullRequest = {
      ...request,
      prompt: sanitizeUserInput(request.prompt),
      system: this.config.systemPrompt,
    };

    const validation = validateRequestSize(fullRequest);
    if (validation.warning) {
      console.warn(`[${this.config.name}] ${validation.warning}`);
    }

    return this.provider.generate(fullRequest);
  }

  async runWithHistory(
    messages: ChatMessage[],
    opts?: Omit<LLMRequest, "system" | "prompt" | "messages">,
  ): Promise<LLMResponse> {
    const sanitizedMessages = messages.map((m) =>
      m.role === "user" ? { ...m, content: sanitizeUserInput(m.content) } : m,
    );
    return this.provider.generate({
      ...opts,
      prompt: "",
      messages: sanitizedMessages,
      system: this.config.systemPrompt,
    });
  }
}
