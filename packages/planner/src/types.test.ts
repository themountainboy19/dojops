import { describe, it, expect } from "vitest";
import { TaskNodeSchema, TaskGraphSchema } from "./types";

describe("TaskNodeSchema", () => {
  it("accepts valid task node", () => {
    const result = TaskNodeSchema.safeParse({
      id: "t1",
      tool: "terraform",
      description: "Create S3 bucket",
    });
    expect(result.success).toBe(true);
    expect(result.data?.dependsOn).toEqual([]);
    expect(result.data?.input).toEqual({});
  });

  it("accepts task with dependencies and input", () => {
    const result = TaskNodeSchema.safeParse({
      id: "t2",
      tool: "kubernetes",
      description: "Deploy app",
      dependsOn: ["t1"],
      input: { replicas: 3 },
    });
    expect(result.success).toBe(true);
    expect(result.data?.dependsOn).toEqual(["t1"]);
  });

  it("rejects task without required fields", () => {
    expect(TaskNodeSchema.safeParse({ id: "t1" }).success).toBe(false);
    expect(TaskNodeSchema.safeParse({ tool: "x" }).success).toBe(false);
    expect(TaskNodeSchema.safeParse({ id: "t1", tool: "x" }).success).toBe(false);
  });
});

describe("TaskGraphSchema", () => {
  it("accepts valid graph", () => {
    const result = TaskGraphSchema.safeParse({
      goal: "Deploy app",
      tasks: [{ id: "t1", tool: "terraform", description: "Provision infra" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects graph with no tasks", () => {
    const result = TaskGraphSchema.safeParse({ goal: "Deploy", tasks: [] });
    expect(result.success).toBe(false);
  });

  it("rejects graph without goal", () => {
    const result = TaskGraphSchema.safeParse({
      tasks: [{ id: "t1", tool: "x", description: "y" }],
    });
    expect(result.success).toBe(false);
  });
});
