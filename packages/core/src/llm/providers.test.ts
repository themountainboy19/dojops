import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { OpenAIProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";
import { OllamaProvider } from "./ollama";

const TestSchema = z.object({ answer: z.string() });

const { mockOpenAICreate, mockAnthropicCreate, mockAxiosPost } = vi.hoisted(() => ({
  mockOpenAICreate: vi.fn(),
  mockAnthropicCreate: vi.fn(),
  mockAxiosPost: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: mockOpenAICreate } };
  },
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockAnthropicCreate };
  },
}));

vi.mock("axios", () => ({
  default: { post: mockAxiosPost },
}));

// ---- Tests ----

describe("OpenAIProvider", () => {
  beforeEach(() => vi.clearAllMocks());

  it("has name 'openai'", () => {
    expect(new OpenAIProvider("key").name).toBe("openai");
  });

  it("generates plain text response", async () => {
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: "Hello!" } }],
    });

    const provider = new OpenAIProvider("key");
    const res = await provider.generate({ prompt: "Hi" });

    expect(res.content).toBe("Hello!");
    expect(res.parsed).toBeUndefined();
  });

  it("generates structured JSON response with schema", async () => {
    const json = JSON.stringify({ answer: "42" });
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: json } }],
    });

    const provider = new OpenAIProvider("key");
    const res = await provider.generate({ prompt: "question", schema: TestSchema });

    expect(res.parsed).toEqual({ answer: "42" });
  });

  it("appends JSON instruction to system prompt when schema is provided", async () => {
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: '{"answer":"x"}' } }],
    });

    const provider = new OpenAIProvider("key");
    await provider.generate({
      prompt: "q",
      system: "Be helpful.",
      schema: TestSchema,
    });

    const call = mockOpenAICreate.mock.calls[0][0];
    expect(call.messages[0].content).toContain("Be helpful.");
    expect(call.messages[0].content).toContain("valid JSON");
    expect(call.response_format).toEqual({ type: "json_object" });
  });

  it("handles null content gracefully", async () => {
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: null } }],
    });

    const provider = new OpenAIProvider("key");
    const res = await provider.generate({ prompt: "Hi" });

    expect(res.content).toBe("");
  });

  it("passes temperature when provided", async () => {
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: "ok" } }],
    });

    const provider = new OpenAIProvider("key");
    await provider.generate({ prompt: "Hi", temperature: 0.7 });

    const call = mockOpenAICreate.mock.calls[0][0];
    expect(call.temperature).toBe(0.7);
  });

  it("omits temperature when not provided", async () => {
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: "ok" } }],
    });

    const provider = new OpenAIProvider("key");
    await provider.generate({ prompt: "Hi" });

    const call = mockOpenAICreate.mock.calls[0][0];
    expect(call.temperature).toBeUndefined();
  });

  // ---------------------------------------------------------------
  // Error path tests
  // ---------------------------------------------------------------

  it("throws clear error on HTTP 401 Unauthorized", async () => {
    mockOpenAICreate.mockRejectedValue(
      new Error(
        '401 {"error":{"message":"Incorrect API key provided: sk-proj-abc123...","type":"invalid_request_error","code":"invalid_api_key"}}',
      ),
    );

    const provider = new OpenAIProvider("bad-key");
    await expect(provider.generate({ prompt: "Hi" })).rejects.toThrow(/Incorrect API key/);
  });

  it("throws appropriate error on HTTP 429 rate limiting", async () => {
    mockOpenAICreate.mockRejectedValue(
      new Error(
        '429 {"error":{"message":"Rate limit reached for gpt-4o-mini. Please retry after 20s.","type":"tokens","code":"rate_limit_exceeded"}}',
      ),
    );

    const provider = new OpenAIProvider("key");
    await expect(provider.generate({ prompt: "Hi" })).rejects.toThrow(/Rate limit reached/);
  });

  it("throws appropriate error on HTTP 503 service unavailability", async () => {
    mockOpenAICreate.mockRejectedValue(
      new Error(
        '503 {"error":{"message":"The server is temporarily unable to handle the request.","type":"server_error"}}',
      ),
    );

    const provider = new OpenAIProvider("key");
    await expect(provider.generate({ prompt: "Hi" })).rejects.toThrow(/temporarily unable/);
  });

  it("throws clear error on network ECONNREFUSED", async () => {
    const networkErr = new Error("connect ECONNREFUSED 127.0.0.1:443");
    mockOpenAICreate.mockRejectedValue(networkErr);

    const provider = new OpenAIProvider("key");
    await expect(provider.generate({ prompt: "Hi" })).rejects.toThrow(/ECONNREFUSED/);
  });

  it("throws error on malformed LLM response (invalid JSON) with schema", async () => {
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: "This is not valid JSON {{{" } }],
    });

    const provider = new OpenAIProvider("key");
    await expect(provider.generate({ prompt: "Hi", schema: TestSchema })).rejects.toThrow(
      /Failed to parse JSON|Schema validation failed/,
    );
  });

  it("throws error when choices array is empty", async () => {
    mockOpenAICreate.mockResolvedValue({ choices: [] });

    const provider = new OpenAIProvider("key");
    await expect(provider.generate({ prompt: "Hi" })).rejects.toThrow(/empty choices/);
  });

  it("throws error when structured response is truncated (finish_reason=length)", async () => {
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: '{"answer":"partial' }, finish_reason: "length" }],
    });

    const provider = new OpenAIProvider("key");
    await expect(provider.generate({ prompt: "Hi", schema: TestSchema })).rejects.toThrow(
      /truncated/i,
    );
  });

  it("redacts API keys in error messages", async () => {
    mockOpenAICreate.mockRejectedValue(
      new Error(
        '401 {"error":{"message":"Invalid API key: sk-proj-abcdefghijklmnopqrstuvwxyz123456"}}',
      ),
    );

    const provider = new OpenAIProvider("key");
    try {
      await provider.generate({ prompt: "Hi" });
      expect.fail("should have thrown");
    } catch (err: unknown) {
      const msg = (err as Error).message;
      expect(msg).not.toContain("sk-proj-abcdefghijklmnopqrstuvwxyz123456");
      expect(msg).toContain("REDACTED");
    }
  });

  it("extracts nested error message from SDK JSON errors", async () => {
    mockOpenAICreate.mockRejectedValue(
      new Error(
        '400 {"error":{"message":"Invalid prompt: too long","type":"invalid_request_error"}}',
      ),
    );

    const provider = new OpenAIProvider("key");
    await expect(provider.generate({ prompt: "Hi" })).rejects.toThrow(/Invalid prompt: too long/);
  });

  it("falls back to raw error message when JSON extraction fails", async () => {
    mockOpenAICreate.mockRejectedValue(new Error("Something went wrong without JSON"));

    const provider = new OpenAIProvider("key");
    await expect(provider.generate({ prompt: "Hi" })).rejects.toThrow(
      /Something went wrong without JSON/,
    );
  });

  it("handles non-Error thrown values", async () => {
    mockOpenAICreate.mockRejectedValue("plain string error");

    const provider = new OpenAIProvider("key");
    await expect(provider.generate({ prompt: "Hi" })).rejects.toThrow(/plain string error/);
  });

  it("includes token usage in successful response", async () => {
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: "Hello!" } }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      },
    });

    const provider = new OpenAIProvider("key");
    const res = await provider.generate({ prompt: "Hi" });

    expect(res.usage).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });
  });
});

describe("AnthropicProvider", () => {
  beforeEach(() => vi.clearAllMocks());

  it("has name 'anthropic'", () => {
    expect(new AnthropicProvider("key").name).toBe("anthropic");
  });

  it("generates plain text response", async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: "Hello!" }],
    });

    const provider = new AnthropicProvider("key");
    const res = await provider.generate({ prompt: "Hi" });

    expect(res.content).toBe("Hello!");
    expect(res.parsed).toBeUndefined();
  });

  it("generates structured JSON response with schema", async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: '"answer":"42"}' }],
    });

    const provider = new AnthropicProvider("key");
    const res = await provider.generate({ prompt: "q", schema: TestSchema });

    expect(res.parsed).toEqual({ answer: "42" });
  });

  it("adds assistant prefill when schema is provided", async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: '"answer":"x"}' }],
    });

    const provider = new AnthropicProvider("key");
    await provider.generate({ prompt: "q", schema: TestSchema });

    const call = mockAnthropicCreate.mock.calls[0][0];
    expect(call.messages).toContainEqual({ role: "assistant", content: "{" });
  });

  it("passes temperature when provided", async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: "ok" }],
    });

    const provider = new AnthropicProvider("key");
    await provider.generate({ prompt: "Hi", temperature: 0 });

    const call = mockAnthropicCreate.mock.calls[0][0];
    expect(call.temperature).toBe(0);
  });

  it("omits temperature when not provided", async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: "ok" }],
    });

    const provider = new AnthropicProvider("key");
    await provider.generate({ prompt: "Hi" });

    const call = mockAnthropicCreate.mock.calls[0][0];
    expect(call.temperature).toBeUndefined();
  });
});

describe("OllamaProvider", () => {
  beforeEach(() => vi.clearAllMocks());

  it("has name 'ollama'", () => {
    expect(new OllamaProvider().name).toBe("ollama");
  });

  it("generates plain text response", async () => {
    mockAxiosPost.mockResolvedValue({ data: { response: "Hello!" } });

    const provider = new OllamaProvider();
    const res = await provider.generate({ prompt: "Hi" });

    expect(res.content).toBe("Hello!");
    expect(res.parsed).toBeUndefined();
  });

  it("generates structured JSON response with schema", async () => {
    mockAxiosPost.mockResolvedValue({
      data: { response: '{"answer":"42"}' },
    });

    const provider = new OllamaProvider();
    const res = await provider.generate({ prompt: "q", schema: TestSchema });

    expect(res.parsed).toEqual({ answer: "42" });
  });

  it("sends JSON format flag when schema is provided", async () => {
    mockAxiosPost.mockResolvedValue({
      data: { response: '{"answer":"x"}' },
    });

    const provider = new OllamaProvider("http://localhost:11434");
    await provider.generate({ prompt: "q", schema: TestSchema });

    const call = mockAxiosPost.mock.calls[0];
    expect(call[0]).toBe("http://localhost:11434/api/generate");
    expect(call[1].format).toBe("json");
    expect(call[1].stream).toBe(false);
  });

  it("uses custom base URL", async () => {
    mockAxiosPost.mockResolvedValue({ data: { response: "ok" } });

    const provider = new OllamaProvider("http://custom:9999");
    await provider.generate({ prompt: "Hi" });

    expect(mockAxiosPost.mock.calls[0][0]).toBe("http://custom:9999/api/generate");
  });

  it("passes temperature via options when provided", async () => {
    mockAxiosPost.mockResolvedValue({ data: { response: "ok" } });

    const provider = new OllamaProvider();
    await provider.generate({ prompt: "Hi", temperature: 0.5 });

    const call = mockAxiosPost.mock.calls[0];
    expect(call[1].options).toEqual({ temperature: 0.5 });
  });

  it("omits options when temperature not provided", async () => {
    mockAxiosPost.mockResolvedValue({ data: { response: "ok" } });

    const provider = new OllamaProvider();
    await provider.generate({ prompt: "Hi" });

    const call = mockAxiosPost.mock.calls[0];
    expect(call[1].options).toBeUndefined();
  });
});
