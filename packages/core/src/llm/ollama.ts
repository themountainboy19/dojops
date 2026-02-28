import https from "node:https";
import axios from "axios";
import { zodToJsonSchema } from "zod-to-json-schema";
import { LLMProvider, LLMRequest, LLMResponse, LLMUsage } from "./provider";
import { parseAndValidate } from "./json-validator";

const OLLAMA_TIMEOUT_MS = 120_000;

function extractUsage(data: Record<string, unknown>): LLMUsage | undefined {
  const prompt = data?.prompt_eval_count;
  const completion = data?.eval_count;
  if (typeof prompt === "number" && typeof completion === "number") {
    return { promptTokens: prompt, completionTokens: completion, totalTokens: prompt + completion };
  }
  return undefined;
}

export class OllamaProvider implements LLMProvider {
  name = "ollama";
  private model: string;

  constructor(
    private baseUrl = "http://localhost:11434",
    model = "llama3",
    private keepAlive: string = "5m",
    private tlsRejectUnauthorized?: boolean,
  ) {
    this.model = model;
    // Warn about plain HTTP to non-localhost endpoints
    try {
      const url = new URL(this.baseUrl);
      if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.protocol === "http:") {
        console.error(
          "[WARN] Ollama connection uses plain HTTP to non-localhost endpoint. Consider using HTTPS.",
        );
      }
    } catch {
      // invalid URL — will fail at request time
    }
  }

  private getAxiosConfig(): Record<string, unknown> {
    const config: Record<string, unknown> = { timeout: OLLAMA_TIMEOUT_MS };
    if (this.tlsRejectUnauthorized === false) {
      config.httpsAgent = new https.Agent({ rejectUnauthorized: false });
    }
    return config;
  }

  async generate(req: LLMRequest): Promise<LLMResponse> {
    const system = req.schema
      ? `${req.system ?? ""}\n\nYou MUST respond with valid JSON only. No markdown, no extra text.`.trim()
      : req.system;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const format = req.schema ? zodToJsonSchema(req.schema as any) : undefined;

    let content: string;
    let usage: LLMUsage | undefined;

    try {
      if (req.messages?.length) {
        const chatMessages = [
          { role: "system", content: system ?? "" },
          ...req.messages.filter((m) => m.role !== "system"),
        ];
        const response = await axios.post(
          `${this.baseUrl}/api/chat`,
          {
            model: this.model,
            messages: chatMessages,
            stream: false,
            ...(format ? { format } : {}),
            ...(req.temperature !== undefined ? { options: { temperature: req.temperature } } : {}),
            keep_alive: this.keepAlive,
          },
          this.getAxiosConfig(),
        );
        content = response.data?.message?.content ?? "";
        usage = extractUsage(response.data);
      } else {
        const response = await axios.post(
          `${this.baseUrl}/api/generate`,
          {
            model: this.model,
            prompt: req.prompt,
            system,
            stream: false,
            ...(format ? { format } : {}),
            ...(req.temperature !== undefined ? { options: { temperature: req.temperature } } : {}),
            keep_alive: this.keepAlive,
          },
          this.getAxiosConfig(),
        );
        content = response.data?.response ?? "";
        usage = extractUsage(response.data);
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 404) {
          throw new Error(
            `Model "${this.model}" not found on Ollama. Run: ollama pull ${this.model}`,
            { cause: err },
          );
        }
        if (err.code === "ECONNREFUSED") {
          throw new Error(
            `Cannot connect to Ollama at ${this.baseUrl}. Is the Ollama server running?`,
            { cause: err },
          );
        }
        if (err.code === "ECONNABORTED") {
          throw new Error(`Ollama request timed out after ${OLLAMA_TIMEOUT_MS / 1000}s`, {
            cause: err,
          });
        }
        throw new Error(`Ollama request failed: ${err.message}`, { cause: err });
      }
      throw err;
    }

    if (req.schema) {
      const parsed = parseAndValidate(content, req.schema);
      return { content, parsed, usage };
    }

    return { content, usage };
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/tags`, this.getAxiosConfig());
      const models: string[] = (response.data.models ?? []).map((m: { name: string }) => m.name);
      return models.sort();
    } catch {
      return [];
    }
  }
}
