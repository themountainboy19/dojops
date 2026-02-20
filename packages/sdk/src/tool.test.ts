import { describe, it, expect } from "vitest";
import { DevOpsTool, ToolInput, ToolOutput } from "./tool";

class EchoTool implements DevOpsTool {
  name = "echo";

  async validate(input: ToolInput): Promise<boolean> {
    return typeof input.message === "string" && input.message.length > 0;
  }

  async generate(input: ToolInput): Promise<ToolOutput> {
    return { success: true, data: { echo: input.message } };
  }
}

describe("DevOpsTool interface", () => {
  it("validates correct input", async () => {
    const tool = new EchoTool();
    expect(await tool.validate({ message: "hello" })).toBe(true);
  });

  it("rejects invalid input", async () => {
    const tool = new EchoTool();
    expect(await tool.validate({ message: "" })).toBe(false);
    expect(await tool.validate({})).toBe(false);
  });

  it("generates output from valid input", async () => {
    const tool = new EchoTool();
    const output = await tool.generate({ message: "hello" });
    expect(output.success).toBe(true);
    expect(output.data).toEqual({ echo: "hello" });
  });

  it("exposes tool name", () => {
    const tool = new EchoTool();
    expect(tool.name).toBe("echo");
  });
});
