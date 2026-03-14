import { GoogleGenAI } from "@google/genai";
import { LLMProvider, LLMRequest, LLMResponse, LLMUsage, getRequestTimeoutMs } from "./provider";
import type { AgentMessage, LLMToolRequest, LLMToolResponse, ToolCall } from "./tool-types";
import { buildLLMResponse, extractApiError } from "./openai-compat";
import { augmentSystemPrompt } from "./schema-prompt";

export class GeminiProvider implements LLMProvider {
  name = "gemini";
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(apiKey: string, model = "gemini-2.5-flash") {
    this.client = new GoogleGenAI({
      apiKey,
      httpOptions: { timeout: getRequestTimeoutMs() },
    });
    this.model = model;
  }

  async generate(req: LLMRequest): Promise<LLMResponse> {
    const systemPrompt = augmentSystemPrompt(req.system, req.schema) || undefined;

    const contents = req.messages?.length
      ? req.messages
          .filter((m) => m.role !== "system")
          .map((m) => ({
            role: m.role === "assistant" ? ("model" as const) : ("user" as const),
            parts: [{ text: m.content }],
          }))
      : [{ role: "user" as const, parts: [{ text: req.prompt }] }];

    let response;
    try {
      response = await this.client.models.generateContent({
        model: this.model,
        contents,
        config: {
          systemInstruction: systemPrompt,
          ...(req.schema ? { responseMimeType: "application/json" } : {}),
          ...(req.temperature === undefined ? {} : { temperature: req.temperature }),
        },
      });
    } catch (err: unknown) {
      throw new Error(extractApiError(err), { cause: err });
    }

    const content = response.text ?? "";

    // Check for truncation or safety blocks
    const candidates = (response as unknown as { candidates?: Array<{ finishReason?: string }> })
      .candidates;
    const finishReason = candidates?.[0]?.finishReason;
    if (req.schema && finishReason === "MAX_TOKENS") {
      throw new Error(
        "LLM response was truncated (hit max tokens limit). The generated JSON is incomplete.",
      );
    }
    if (finishReason === "SAFETY") {
      throw new Error("LLM response was blocked by safety filters.");
    }

    const usageMeta = (
      response as unknown as {
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          totalTokenCount?: number;
        };
      }
    ).usageMetadata;
    const usage: LLMUsage | undefined = usageMeta
      ? {
          promptTokens: usageMeta.promptTokenCount ?? 0,
          completionTokens: usageMeta.candidatesTokenCount ?? 0,
          totalTokens: usageMeta.totalTokenCount ?? 0,
        }
      : undefined;

    return buildLLMResponse(content, usage, req);
  }

  async generateWithTools(req: LLMToolRequest): Promise<LLMToolResponse> {
    const tools = [
      {
        functionDeclarations: req.tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      },
    ];

    const contents = mapToGeminiContents(req.messages);

    let response;
    try {
      response = await this.client.models.generateContent({
        model: this.model,
        contents,
        tools,
        config: {
          systemInstruction: req.system || undefined,
          ...(req.temperature === undefined ? {} : { temperature: req.temperature }),
        },
      } as Parameters<typeof this.client.models.generateContent>[0]);
    } catch (err: unknown) {
      throw new Error(extractApiError(err), { cause: err });
    }

    const { content, toolCalls } = extractGeminiToolResponse(response);
    const finishReason = extractGeminiFinishReason(response);
    const stopReason = mapGeminiStopReason(toolCalls, finishReason);
    const usage = extractGeminiUsage(response);

    return { content, toolCalls, stopReason, usage };
  }

  async listModels(): Promise<string[]> {
    try {
      const pager = await this.client.models.list();
      const models: string[] = [];
      for (const model of pager.page) {
        if (model.name?.startsWith("models/gemini-")) {
          models.push(model.name.replace("models/", ""));
        }
      }
      return models.sort((a, b) => a.localeCompare(b));
    } catch {
      return [];
    }
  }
}

/** Map AgentMessages to Gemini contents format. */
function mapToGeminiContents(
  messages: AgentMessage[],
): Array<{ role: string; parts: Array<Record<string, unknown>> }> {
  const contents: Array<{ role: string; parts: Array<Record<string, unknown>> }> = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    contents.push(mapSingleGeminiContent(m));
  }
  return contents;
}

/** Map a single AgentMessage to a Gemini content entry. */
function mapSingleGeminiContent(m: AgentMessage): {
  role: string;
  parts: Array<Record<string, unknown>>;
} {
  if (m.role === "tool") {
    return {
      role: "function",
      parts: [{ functionResponse: { name: "tool", response: { result: m.content } } }],
    };
  }

  if (m.role === "assistant" && m.toolCalls?.length) {
    const parts: Array<Record<string, unknown>> = [];
    if (m.content) parts.push({ text: m.content });
    for (const tc of m.toolCalls) {
      parts.push({ functionCall: { name: tc.name, args: tc.arguments } });
    }
    return { role: "model", parts };
  }

  const role = m.role === "assistant" ? "model" : "user";
  return { role, parts: [{ text: m.content }] };
}

/** Extract text and function calls from a Gemini response. */
function extractGeminiToolResponse(response: unknown): {
  content: string;
  toolCalls: ToolCall[];
} {
  let content = "";
  const toolCalls: ToolCall[] = [];
  const candidates = (
    response as { candidates?: Array<{ content?: { parts?: Array<Record<string, unknown>> } }> }
  ).candidates;
  const parts = candidates?.[0]?.content?.parts ?? [];
  let callIdCounter = 0;

  for (const part of parts) {
    if (part.text && typeof part.text === "string") {
      content += part.text;
    }
    if (part.functionCall && typeof part.functionCall === "object") {
      const fc = part.functionCall as { name: string; args?: Record<string, unknown> };
      toolCalls.push({
        id: `gemini-call-${callIdCounter++}`,
        name: fc.name,
        arguments: fc.args ?? {},
      });
    }
  }

  return { content, toolCalls };
}

/** Extract finish reason from a Gemini response. */
function extractGeminiFinishReason(response: unknown): string | undefined {
  const candidates = (response as { candidates?: Array<{ finishReason?: string }> }).candidates;
  return candidates?.[0]?.finishReason;
}

/** Map Gemini stop reason to LLMToolResponse stopReason. */
function mapGeminiStopReason(
  toolCalls: ToolCall[],
  finishReason: string | undefined,
): LLMToolResponse["stopReason"] {
  if (toolCalls.length > 0) return "tool_use";
  if (finishReason === "MAX_TOKENS") return "max_tokens";
  return "end_turn";
}

/** Extract usage metadata from a Gemini response. */
function extractGeminiUsage(response: unknown): LLMUsage | undefined {
  const usageMeta = (
    response as {
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    }
  ).usageMetadata;
  if (!usageMeta) return undefined;
  return {
    promptTokens: usageMeta.promptTokenCount ?? 0,
    completionTokens: usageMeta.candidatesTokenCount ?? 0,
    totalTokens: usageMeta.totalTokenCount ?? 0,
  };
}
