import Anthropic from "@anthropic-ai/sdk";
import { LLMProvider, LLMRequest, LLMResponse } from "./provider";
import { parseAndValidate } from "./json-validator";

export class AnthropicProvider implements LLMProvider {
  name = "anthropic";
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generate(req: LLMRequest): Promise<LLMResponse> {
    const system = req.schema
      ? `${req.system ?? ""}\n\nYou MUST respond with valid JSON only. No markdown, no extra text.`.trim()
      : req.system;

    const messages: Anthropic.MessageParam[] = [{ role: "user", content: req.prompt }];

    if (req.schema) {
      messages.push({ role: "assistant", content: "{" });
    }

    const message = await this.client.messages.create({
      model: "claude-3-sonnet-20240229",
      max_tokens: 1024,
      system,
      messages,
    });

    let content = message.content[0].type === "text" ? message.content[0].text : "";

    if (req.schema) {
      content = "{" + content;
      const parsed = parseAndValidate(content, req.schema);
      return { content, parsed };
    }

    return { content };
  }
}
