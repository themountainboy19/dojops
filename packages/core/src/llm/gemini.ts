import { GoogleGenAI } from "@google/genai";
import { LLMProvider, LLMRequest, LLMResponse } from "./provider";
import { parseAndValidate } from "./json-validator";

export class GeminiProvider implements LLMProvider {
  name = "gemini";
  private client: GoogleGenAI;
  private model: string;

  constructor(apiKey: string, model = "gemini-2.5-flash") {
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async generate(req: LLMRequest): Promise<LLMResponse> {
    const systemPrompt = req.schema
      ? `${req.system ?? ""}\n\nYou MUST respond with valid JSON only. No markdown, no extra text.`.trim()
      : req.system;

    const response = await this.client.models.generateContent({
      model: this.model,
      contents: req.prompt,
      config: {
        systemInstruction: systemPrompt,
        ...(req.schema ? { responseMimeType: "application/json" } : {}),
      },
    });

    const content = response.text ?? "";

    if (req.schema) {
      const parsed = parseAndValidate(content, req.schema);
      return { content, parsed };
    }

    return { content };
  }

  async listModels(): Promise<string[]> {
    const pager = await this.client.models.list();
    const models: string[] = [];
    for (const model of pager.page) {
      if (model.name?.startsWith("models/gemini-")) {
        models.push(model.name.replace("models/", ""));
      }
    }
    return models.sort();
  }
}
