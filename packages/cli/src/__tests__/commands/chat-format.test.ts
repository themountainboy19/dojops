import { describe, it, expect, vi } from "vitest";

vi.mock("@dojops/api", () => ({
  createRouter: vi.fn(),
}));

vi.mock("@dojops/session", () => ({
  ChatSession: vi.fn(),
  buildSessionContext: vi.fn(),
  saveSession: vi.fn(),
  listSessions: vi.fn(),
  generateSessionId: vi.fn(),
}));

import { getRoleLabel, formatSessionAsMarkdown } from "../../commands/chat";
import type { ChatSessionState } from "@dojops/session";

describe("getRoleLabel", () => {
  it("returns **You** for user role", () => {
    expect(getRoleLabel("user")).toBe("**You**");
  });

  it("returns **Agent** for assistant role", () => {
    expect(getRoleLabel("assistant")).toBe("**Agent**");
  });

  it("returns **System** for system role", () => {
    expect(getRoleLabel("system")).toBe("**System**");
  });

  it("returns **System** for unknown role", () => {
    expect(getRoleLabel("other")).toBe("**System**");
  });
});

describe("formatSessionAsMarkdown", () => {
  const baseSession: ChatSessionState = {
    id: "sess-001",
    name: "Test Session",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T01:00:00Z",
    mode: "INTERACTIVE",
    messages: [],
    metadata: { totalTokensEstimate: 0, messageCount: 0 },
  };

  it("includes session header with name", () => {
    const md = formatSessionAsMarkdown(baseSession);
    expect(md).toContain("# Chat Session: Test Session");
    expect(md).toContain("- **ID:** sess-001");
    expect(md).toContain("- **Mode:** INTERACTIVE");
  });

  it("uses id when name is undefined", () => {
    const session = { ...baseSession, name: undefined };
    const md = formatSessionAsMarkdown(session);
    expect(md).toContain("# Chat Session: sess-001");
  });

  it("includes pinned agent when present", () => {
    const session = { ...baseSession, pinnedAgent: "terraform-specialist" };
    const md = formatSessionAsMarkdown(session);
    expect(md).toContain("- **Agent:** terraform-specialist");
  });

  it("omits agent line when no pinned agent", () => {
    const md = formatSessionAsMarkdown(baseSession);
    expect(md).not.toContain("**Agent:**");
  });

  it("formats messages with role labels", () => {
    const session: ChatSessionState = {
      ...baseSession,
      messages: [
        { role: "user", content: "Hello", timestamp: "2025-01-01T00:00:00Z" },
        { role: "assistant", content: "Hi there", timestamp: "2025-01-01T00:00:01Z" },
      ],
      metadata: { totalTokensEstimate: 10, messageCount: 2 },
    };
    const md = formatSessionAsMarkdown(session);
    expect(md).toContain("### **You**");
    expect(md).toContain("Hello");
    expect(md).toContain("### **Agent**");
    expect(md).toContain("Hi there");
  });

  it("includes message count in metadata", () => {
    const session: ChatSessionState = {
      ...baseSession,
      metadata: { totalTokensEstimate: 0, messageCount: 5 },
    };
    const md = formatSessionAsMarkdown(session);
    expect(md).toContain("- **Messages:** 5");
  });
});
