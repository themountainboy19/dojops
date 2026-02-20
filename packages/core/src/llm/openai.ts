import OpenAI from "openai";
import { LLMProvider, LLMRequest, LLMResponse } from "./provider";

export class OpenAIProvider implements LLMProvider {
  name = "openai";
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async generate(req: LLMRequest): Promise<LLMResponse> {
    const completion = await this.client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: req.system ?? "" },
        { role: "user", content: req.prompt }
      ]
    });

    return { content: completion.choices[0].message.content ?? "" };
  }
}
