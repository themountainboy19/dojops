import axios from "axios";
import { LLMProvider, LLMRequest, LLMResponse } from "./provider";
import { parseAndValidate } from "./json-validator";

export class OllamaProvider implements LLMProvider {
  name = "ollama";
  private model: string;

  constructor(
    private baseUrl = "http://localhost:11434",
    model = "llama3",
  ) {
    this.model = model;
  }

  async generate(req: LLMRequest): Promise<LLMResponse> {
    const system = req.schema
      ? `${req.system ?? ""}\n\nYou MUST respond with valid JSON only. No markdown, no extra text.`.trim()
      : req.system;

    const response = await axios.post(`${this.baseUrl}/api/generate`, {
      model: this.model,
      prompt: req.prompt,
      system,
      stream: false,
      ...(req.schema ? { format: "json" } : {}),
    });

    const content: string = response.data.response;

    if (req.schema) {
      const parsed = parseAndValidate(content, req.schema);
      return { content, parsed };
    }

    return { content };
  }
}
