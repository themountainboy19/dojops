import axios from "axios";
import { LLMProvider, LLMRequest, LLMResponse } from "./provider";

export class OllamaProvider implements LLMProvider {
  name = "ollama";

  constructor(private baseUrl = "http://localhost:11434") {}

  async generate(req: LLMRequest): Promise<LLMResponse> {
    const response = await axios.post(`${this.baseUrl}/api/generate`, {
      model: "llama3",
      prompt: req.prompt,
      system: req.system,
      stream: false
    });

    return { content: response.data.response };
  }
}
