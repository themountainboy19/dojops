export interface LLMRequest {
  system?: string;
  prompt: string;
  temperature?: number;
}

export interface LLMResponse {
  content: string;
}

export interface LLMProvider {
  name: string;
  generate(request: LLMRequest): Promise<LLMResponse>;
}
