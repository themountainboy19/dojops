import OpenAI from "openai";
import { LLMProvider, LLMRequest, LLMResponse } from "./provider";
import { parseAndValidate } from "./json-validator";

export class OpenAIProvider implements LLMProvider {
  name = "openai";
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model = "gpt-4o-mini") {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async generate(req: LLMRequest): Promise<LLMResponse> {
    const systemContent = req.schema
      ? `${req.system ?? ""}\n\nYou MUST respond with valid JSON only. No markdown, no extra text.`.trim()
      : (req.system ?? "");

    let completion: OpenAI.Chat.ChatCompletion;
    try {
      completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: systemContent },
          { role: "user", content: req.prompt },
        ],
        ...(req.schema ? { response_format: { type: "json_object" } } : {}),
      });
    } catch (err: unknown) {
      throw new Error(extractApiError(err), { cause: err });
    }

    const content = completion.choices[0].message.content ?? "";

    if (req.schema) {
      const parsed = parseAndValidate(content, req.schema);
      return { content, parsed };
    }

    return { content };
  }

  async listModels(): Promise<string[]> {
    const list = await this.client.models.list();
    const models: string[] = [];
    for await (const model of list) {
      if (model.id.startsWith("gpt-")) {
        models.push(model.id);
      }
    }
    return models.sort();
  }
}

function extractApiError(err: unknown): string {
  if (err instanceof Error) {
    const jsonMatch = err.message.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const body = JSON.parse(jsonMatch[0]);
        const msg = body?.error?.message;
        if (typeof msg === "string") return msg;
      } catch {
        // fall through
      }
    }
    return err.message;
  }
  return String(err);
}
