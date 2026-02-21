import Anthropic from "@anthropic-ai/sdk";
import axios from "axios";
import { LLMProvider, LLMRequest, LLMResponse } from "./provider";
import { parseAndValidate } from "./json-validator";

export class AnthropicProvider implements LLMProvider {
  name = "anthropic";
  private client: Anthropic;
  private model: string;

  private apiKey: string;

  constructor(apiKey: string, model = "claude-sonnet-4-5-20250929") {
    this.apiKey = apiKey;
    this.client = new Anthropic({ apiKey });
    this.model = model;
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
      model: this.model,
      max_tokens: req.maxTokens ?? 8192,
      system,
      messages,
    });

    let content = message.content[0].type === "text" ? message.content[0].text : "";

    if (req.schema) {
      if (message.stop_reason === "max_tokens") {
        throw new Error(
          "LLM response was truncated (hit max_tokens limit). The generated JSON is incomplete.",
        );
      }
      content = "{" + content;
      const parsed = parseAndValidate(content, req.schema);
      return { content, parsed };
    }

    return { content };
  }

  async listModels(): Promise<string[]> {
    const response = await axios.get("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
    });
    const models: string[] = (response.data.data ?? [])
      .filter((m: { id: string }) => m.id.startsWith("claude-"))
      .map((m: { id: string }) => m.id);
    return models.sort();
  }
}
