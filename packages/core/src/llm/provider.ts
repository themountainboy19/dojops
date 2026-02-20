import { ZodTypeAny } from "zod";

export interface LLMRequest {
  system?: string;
  prompt: string;
  temperature?: number;
  schema?: ZodTypeAny;
}

export interface LLMResponse {
  content: string;
  parsed?: unknown;
}

export interface LLMProvider {
  name: string;
  generate(request: LLMRequest): Promise<LLMResponse>;
}
