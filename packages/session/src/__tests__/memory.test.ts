import { describe, it, expect } from "vitest";
import { MemoryManager } from "../memory";
import { ChatMessage } from "../types";

function makeMsg(role: "user" | "assistant", content: string): ChatMessage {
  return { role, content, timestamp: new Date().toISOString() };
}

describe("MemoryManager", () => {
  it("returns all messages within the window", () => {
    const mm = new MemoryManager(10);
    const msgs = [makeMsg("user", "Hello"), makeMsg("assistant", "Hi")];
    const result = mm.getContextMessages(msgs);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe("Hello");
    expect(result[1].content).toBe("Hi");
  });

  it("returns only the last N messages when exceeding window", () => {
    const mm = new MemoryManager(3);
    const msgs = [
      makeMsg("user", "msg1"),
      makeMsg("assistant", "msg2"),
      makeMsg("user", "msg3"),
      makeMsg("assistant", "msg4"),
      makeMsg("user", "msg5"),
    ];
    const result = mm.getContextMessages(msgs);
    expect(result).toHaveLength(3);
    expect(result[0].content).toBe("msg3");
    expect(result[1].content).toBe("msg4");
    expect(result[2].content).toBe("msg5");
  });

  it("injects summary as first system message", () => {
    const mm = new MemoryManager(3);
    const msgs = [makeMsg("user", "msg1"), makeMsg("assistant", "msg2")];
    const result = mm.getContextMessages(msgs, "This is a summary of previous conversation.");
    expect(result).toHaveLength(3);
    expect(result[0].role).toBe("system");
    expect(result[0].content).toContain("summary");
    expect(result[1].content).toBe("msg1");
  });

  it("needsSummarization returns true when threshold exceeded", () => {
    const mm = new MemoryManager(10);
    expect(mm.needsSummarization(10)).toBe(false);
    expect(mm.needsSummarization(14)).toBe(false);
    expect(mm.needsSummarization(15)).toBe(false);
    expect(mm.needsSummarization(16)).toBe(true);
    expect(mm.needsSummarization(30)).toBe(true);
  });

  it("estimateTokens returns reasonable estimate", () => {
    const mm = new MemoryManager();
    const msgs = [
      makeMsg("user", "Hello world"), // 11 chars
      makeMsg("assistant", "Hi there"), // 8 chars
    ];
    const tokens = mm.estimateTokens(msgs);
    // ~19 chars / 4 = ~5 tokens
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(20);
  });

  it("estimateTokens returns 0 for empty array", () => {
    const mm = new MemoryManager();
    expect(mm.estimateTokens([])).toBe(0);
  });
});
