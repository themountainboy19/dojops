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

    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: req.prompt },
      ],
      ...(req.schema ? { response_format: { type: "json_object" } } : {}),
    });

    const content = completion.choices[0].message.content ?? "";

    if (req.schema) {
      const parsed = parseAndValidate(content, req.schema);
      return { content, parsed };
    }

    return { content };
  }
}
