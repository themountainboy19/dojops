import Anthropic from "@anthropic-ai/sdk";
import { LLMProvider, LLMRequest, LLMResponse } from "./provider";

export class AnthropicProvider implements LLMProvider {
  name = "anthropic";
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generate(req: LLMRequest): Promise<LLMResponse> {
    const message = await this.client.messages.create({
      model: "claude-3-sonnet-20240229",
      max_tokens: 1024,
      system: req.system,
      messages: [{ role: "user", content: req.prompt }],
    });

    return { content: message.content[0].text };
  }
}
