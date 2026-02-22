import { ZodTypeAny } from "zod";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMRequest {
  system?: string;
  prompt: string;
  messages?: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  schema?: ZodTypeAny;
}

export interface LLMResponse {
  content: string;
  parsed?: unknown;
}

export interface LLMProvider {
  name: string;
  generate(request: LLMRequest): Promise<LLMResponse>;
  listModels?(): Promise<string[]>;
}
