import { describe, it, expect } from "vitest";
import {
  GenerateRequestSchema,
  PlanRequestSchema,
  DebugCIRequestSchema,
  DiffRequestSchema,
} from "../schemas";

describe("GenerateRequestSchema", () => {
  it("accepts valid input", () => {
    const result = GenerateRequestSchema.safeParse({ prompt: "hello" });
    expect(result.success).toBe(true);
  });

  it("accepts optional temperature", () => {
    const result = GenerateRequestSchema.safeParse({ prompt: "hello", temperature: 0.7 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.temperature).toBe(0.7);
    }
  });

  it("rejects empty prompt", () => {
    const result = GenerateRequestSchema.safeParse({ prompt: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing prompt", () => {
    const result = GenerateRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("PlanRequestSchema", () => {
  it("accepts valid input with defaults", () => {
    const result = PlanRequestSchema.safeParse({ goal: "deploy app" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.execute).toBe(false);
      expect(result.data.autoApprove).toBe(false);
    }
  });

  it("accepts all options", () => {
    const result = PlanRequestSchema.safeParse({
      goal: "deploy app",
      execute: true,
      autoApprove: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty goal", () => {
    const result = PlanRequestSchema.safeParse({ goal: "" });
    expect(result.success).toBe(false);
  });
});

describe("DebugCIRequestSchema", () => {
  it("accepts valid input", () => {
    const result = DebugCIRequestSchema.safeParse({ log: "ERROR: build failed" });
    expect(result.success).toBe(true);
  });

  it("rejects empty log", () => {
    const result = DebugCIRequestSchema.safeParse({ log: "" });
    expect(result.success).toBe(false);
  });
});

describe("DiffRequestSchema", () => {
  it("accepts diff only", () => {
    const result = DiffRequestSchema.safeParse({ diff: "+ resource aws_s3" });
    expect(result.success).toBe(true);
  });

  it("accepts diff with before/after", () => {
    const result = DiffRequestSchema.safeParse({ diff: "changes", before: "old", after: "new" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.before).toBe("old");
      expect(result.data.after).toBe("new");
    }
  });

  it("rejects empty diff", () => {
    const result = DiffRequestSchema.safeParse({ diff: "" });
    expect(result.success).toBe(false);
  });
});
