import { LLMProvider } from "./llm/provider";

export class DevOpsAgent {
  constructor(private provider: LLMProvider) {}

  async run(prompt: string) {
    return this.provider.generate({
      system: "You are an expert DevOps engineer.",
      prompt,
    });
  }
}
