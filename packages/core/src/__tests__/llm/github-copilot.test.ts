import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

const TestSchema = z.object({ answer: z.string() });

const mockCreate = vi.fn();
const mockModelsList = vi.fn();

vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: mockCreate } };
    models = { list: mockModelsList };
  },
}));

vi.mock("../../llm/copilot-auth", () => ({
  getValidCopilotToken: vi.fn().mockResolvedValue({
    token: "jwt-test-token",
    apiBaseUrl: "https://api.githubcopilot.com",
  }),
}));

import { GitHubCopilotProvider } from "../../llm/github-copilot";

describe("GitHubCopilotProvider", () => {
  beforeEach(() => vi.clearAllMocks());

  it("has name 'github-copilot'", () => {
    expect(new GitHubCopilotProvider().name).toBe("github-copilot");
  });

  it("defaults to gpt-4o model", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "Hi" } }],
    });

    const provider = new GitHubCopilotProvider();
    await provider.generate({ prompt: "Hi" });

    expect(mockCreate.mock.calls[0][0].model).toBe("gpt-4o");
  });

  it("uses custom model when specified", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "Hi" } }],
    });

    const provider = new GitHubCopilotProvider("claude-3.5-sonnet");
    await provider.generate({ prompt: "Hi" });

    expect(mockCreate.mock.calls[0][0].model).toBe("claude-3.5-sonnet");
  });

  it("generates plain text response", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "Hello!" } }],
    });

    const provider = new GitHubCopilotProvider();
    const res = await provider.generate({ prompt: "Hi" });

    expect(res.content).toBe("Hello!");
    expect(res.parsed).toBeUndefined();
  });

  it("generates structured JSON response with schema", async () => {
    const json = JSON.stringify({ answer: "42" });
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: json } }],
    });

    const provider = new GitHubCopilotProvider();
    const res = await provider.generate({ prompt: "question", schema: TestSchema });

    expect(res.parsed).toEqual({ answer: "42" });
  });

  it("appends JSON instruction to system prompt when schema is provided", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '{"answer":"x"}' } }],
    });

    const provider = new GitHubCopilotProvider();
    await provider.generate({
      prompt: "q",
      system: "Be helpful.",
      schema: TestSchema,
    });

    const call = mockCreate.mock.calls[0][0];
    expect(call.messages[0].content).toContain("Be helpful.");
    expect(call.messages[0].content).toContain("valid JSON");
    expect(call.response_format).toEqual({ type: "json_object" });
  });

  it("handles null content gracefully", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: null } }],
    });

    const provider = new GitHubCopilotProvider();
    const res = await provider.generate({ prompt: "Hi" });

    expect(res.content).toBe("");
  });

  it("throws on empty choices", async () => {
    mockCreate.mockResolvedValue({ choices: [] });

    const provider = new GitHubCopilotProvider();
    await expect(provider.generate({ prompt: "Hi" })).rejects.toThrow(
      "GitHub Copilot returned empty choices array",
    );
  });

  it("throws on truncated response with schema", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '{"answer":' }, finish_reason: "length" }],
    });

    const provider = new GitHubCopilotProvider();
    await expect(provider.generate({ prompt: "Hi", schema: TestSchema })).rejects.toThrow(
      "truncated",
    );
  });

  it("returns usage data when present", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "ok" } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });

    const provider = new GitHubCopilotProvider();
    const res = await provider.generate({ prompt: "Hi" });

    expect(res.usage).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });
  });

  it("returns undefined usage when not present", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "ok" } }],
    });

    const provider = new GitHubCopilotProvider();
    const res = await provider.generate({ prompt: "Hi" });

    expect(res.usage).toBeUndefined();
  });

  it("passes temperature when provided", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "ok" } }],
    });

    const provider = new GitHubCopilotProvider();
    await provider.generate({ prompt: "Hi", temperature: 0.3 });

    const call = mockCreate.mock.calls[0][0];
    expect(call.temperature).toBe(0.3);
  });

  it("omits temperature when not provided", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "ok" } }],
    });

    const provider = new GitHubCopilotProvider();
    await provider.generate({ prompt: "Hi" });

    const call = mockCreate.mock.calls[0][0];
    expect(call.temperature).toBeUndefined();
  });

  it("supports multi-turn messages", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "response" } }],
    });

    const provider = new GitHubCopilotProvider();
    await provider.generate({
      prompt: "",
      messages: [
        { role: "system", content: "You are helpful" },
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi!" },
        { role: "user", content: "How are you?" },
      ],
    });

    const call = mockCreate.mock.calls[0][0];
    // System message is first, then non-system messages
    expect(call.messages[0].role).toBe("system");
    expect(call.messages).toHaveLength(4);
  });

  it("lists models from API", async () => {
    const asyncIterable = {
      async *[Symbol.asyncIterator]() {
        yield { id: "gpt-4o" };
        yield { id: "claude-3.5-sonnet" };
      },
    };
    mockModelsList.mockResolvedValue(asyncIterable);

    const provider = new GitHubCopilotProvider();
    const models = await provider.listModels();

    expect(models).toEqual(["claude-3.5-sonnet", "gpt-4o"]);
  });

  it("returns known models when API returns empty list", async () => {
    const asyncIterable = {
      async *[Symbol.asyncIterator]() {
        // yields nothing
      },
    };
    mockModelsList.mockResolvedValue(asyncIterable);

    const provider = new GitHubCopilotProvider();
    const models = await provider.listModels();

    expect(models).toContain("gpt-4o");
    expect(models).toContain("claude-3.5-sonnet");
    expect(models.length).toBeGreaterThan(0);
  });

  it("returns known models when API call fails", async () => {
    mockModelsList.mockRejectedValue(new Error("API error"));

    const provider = new GitHubCopilotProvider();
    const models = await provider.listModels();

    expect(models).toContain("gpt-4o");
    expect(models).toContain("o1-mini");
  });

  it("wraps API errors with readable message", async () => {
    mockCreate.mockRejectedValue(new Error('{"error":{"message":"Rate limit exceeded"}}'));

    const provider = new GitHubCopilotProvider();
    await expect(provider.generate({ prompt: "Hi" })).rejects.toThrow("Rate limit exceeded");
  });

  it("handles non-JSON error messages", async () => {
    mockCreate.mockRejectedValue(new Error("Connection refused"));

    const provider = new GitHubCopilotProvider();
    await expect(provider.generate({ prompt: "Hi" })).rejects.toThrow("Connection refused");
  });

  it("handles non-Error throw", async () => {
    mockCreate.mockRejectedValue("string error");

    const provider = new GitHubCopilotProvider();
    await expect(provider.generate({ prompt: "Hi" })).rejects.toThrow("string error");
  });
});
