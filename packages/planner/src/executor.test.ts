import { describe, it, expect } from "vitest";
import { BaseTool, ToolOutput, z } from "@oda/sdk";
import { PlannerExecutor } from "./executor";
import { TaskGraph } from "./types";

const SuccessInputSchema = z.object({}).passthrough();

class SuccessTool extends BaseTool<Record<string, unknown>> {
  name = "success-tool";
  description = "Always succeeds";
  inputSchema = SuccessInputSchema;
  async generate(input: Record<string, unknown>): Promise<ToolOutput> {
    return { success: true, data: { result: "ok", ...input } };
  }
}

class FailTool extends BaseTool<Record<string, unknown>> {
  name = "fail-tool";
  description = "Always fails";
  inputSchema = SuccessInputSchema;
  async generate(): Promise<ToolOutput> {
    return { success: false, error: "intentional failure" };
  }
}

describe("PlannerExecutor", () => {
  it("executes a chain of tasks in dependency order", async () => {
    const graph: TaskGraph = {
      goal: "test chain",
      tasks: [
        { id: "t1", tool: "success-tool", description: "first", dependsOn: [], input: {} },
        {
          id: "t2",
          tool: "success-tool",
          description: "second",
          dependsOn: ["t1"],
          input: { prev: "$ref:t1" },
        },
      ],
    };

    const executor = new PlannerExecutor([new SuccessTool()]);
    const result = await executor.execute(graph);

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].status).toBe("completed");
    expect(result.results[1].status).toBe("completed");
    expect(result.results[1].output).toHaveProperty("prev");
  });

  it("skips downstream tasks when a dependency fails", async () => {
    const graph: TaskGraph = {
      goal: "test failure cascade",
      tasks: [
        { id: "t1", tool: "fail-tool", description: "will fail", dependsOn: [], input: {} },
        {
          id: "t2",
          tool: "success-tool",
          description: "depends on t1",
          dependsOn: ["t1"],
          input: {},
        },
      ],
    };

    const executor = new PlannerExecutor([new SuccessTool(), new FailTool()]);
    const result = await executor.execute(graph);

    expect(result.success).toBe(false);
    expect(result.results[0].status).toBe("failed");
    expect(result.results[1].status).toBe("skipped");
  });

  it("reports error for missing tools", async () => {
    const graph: TaskGraph = {
      goal: "test missing tool",
      tasks: [
        {
          id: "t1",
          tool: "nonexistent",
          description: "unknown tool",
          dependsOn: [],
          input: {},
        },
      ],
    };

    const executor = new PlannerExecutor([new SuccessTool()]);
    const result = await executor.execute(graph);

    expect(result.success).toBe(false);
    expect(result.results[0].status).toBe("failed");
    expect(result.results[0].error).toContain("Unknown tool");
  });

  it("detects circular dependencies", async () => {
    const graph: TaskGraph = {
      goal: "circular",
      tasks: [
        { id: "t1", tool: "success-tool", description: "a", dependsOn: ["t2"], input: {} },
        { id: "t2", tool: "success-tool", description: "b", dependsOn: ["t1"], input: {} },
      ],
    };

    const executor = new PlannerExecutor([new SuccessTool()]);
    await expect(executor.execute(graph)).rejects.toThrow("Circular dependency");
  });
});
