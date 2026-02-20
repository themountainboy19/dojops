import { describe, it, expect, vi } from "vitest";
import { LLMProvider } from "@oda/core";
import { BaseTool, ToolOutput, z } from "@oda/sdk";
import { decompose } from "./decomposer";
import { TaskGraphSchema } from "./types";

class MockTool extends BaseTool<unknown> {
  name = "mock-tool";
  description = "A mock tool for testing";
  inputSchema = z.object({});
  async generate(): Promise<ToolOutput> {
    return { success: true };
  }
}

describe("decompose", () => {
  it("returns a valid TaskGraph from the LLM response", async () => {
    const mockGraph = {
      goal: "deploy app",
      tasks: [
        {
          id: "t1",
          tool: "mock-tool",
          description: "First task",
          dependsOn: [],
          input: {},
        },
        {
          id: "t2",
          tool: "mock-tool",
          description: "Second task",
          dependsOn: ["t1"],
          input: { ref: "$ref:t1" },
        },
      ],
    };

    const provider: LLMProvider = {
      name: "mock",
      generate: vi.fn().mockResolvedValue({
        content: JSON.stringify(mockGraph),
        parsed: mockGraph,
      }),
    };

    const result = await decompose("deploy app", provider, [new MockTool()]);

    expect(result.goal).toBe("deploy app");
    expect(result.tasks).toHaveLength(2);
    expect(result.tasks[0].id).toBe("t1");
    expect(result.tasks[1].dependsOn).toContain("t1");

    const validation = TaskGraphSchema.safeParse(result);
    expect(validation.success).toBe(true);
  });

  it("passes available tools to the LLM system prompt", async () => {
    const provider: LLMProvider = {
      name: "mock",
      generate: vi.fn().mockResolvedValue({
        content: "{}",
        parsed: {
          goal: "test",
          tasks: [{ id: "t1", tool: "mock-tool", description: "test", dependsOn: [], input: {} }],
        },
      }),
    };

    await decompose("test", provider, [new MockTool()]);

    const call = vi.mocked(provider.generate).mock.calls[0][0];
    expect(call.system).toContain("mock-tool");
    expect(call.system).toContain("A mock tool for testing");
  });
});
