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

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LLMResponse<T = unknown> {
  content: string;
  parsed?: T;
  usage?: LLMUsage;
}

export interface LLMProvider {
  name: string;
  generate(request: LLMRequest): Promise<LLMResponse>;
  listModels?(): Promise<string[]>;
}
