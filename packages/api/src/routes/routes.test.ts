import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { LLMProvider, LLMResponse, AgentRouter, CIDebugger, InfraDiffAnalyzer } from "@dojops/core";
import { DevOpsTool } from "@dojops/sdk";
import { createApp, AppDependencies } from "../app";
import { HistoryStore } from "../store";

function createMockProvider(): LLMProvider {
  return {
    name: "mock",
    generate: vi.fn().mockResolvedValue({
      content: "Mock response",
    } satisfies LLMResponse),
  };
}

function createMockTool(): DevOpsTool {
  return {
    name: "mock-tool",
    description: "A mock tool",
    inputSchema: { safeParse: () => ({ success: true, data: {} }) } as never,
    validate: () => ({ valid: true }),
    generate: vi.fn().mockResolvedValue({ success: true, data: { yaml: "test: true" } }),
  };
}

function createTestDeps(): AppDependencies {
  const provider = createMockProvider();
  const tools = [createMockTool()];
  const router = new AgentRouter(provider);
  const debugger_ = new CIDebugger(provider);
  const diffAnalyzer = new InfraDiffAnalyzer(provider);
  const store = new HistoryStore();

  return { provider, tools, router, debugger: debugger_, diffAnalyzer, store };
}

describe("Chat routes", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp(createTestDeps());
  });

  it("POST /api/chat sends message and creates session", async () => {
    const res = await request(app).post("/api/chat").send({ message: "hello" });
    expect(res.status).toBe(200);
    expect(res.body.content).toBeDefined();
    expect(res.body.sessionId).toBeDefined();
  });

  it("POST /api/chat rejects empty message", async () => {
    const res = await request(app).post("/api/chat").send({ message: "" });
    expect(res.status).toBe(400);
  });

  it("POST /api/chat/sessions creates a session", async () => {
    const res = await request(app).post("/api/chat/sessions").send({});
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.mode).toBe("INTERACTIVE");
  });

  it("POST /api/chat/sessions with name and mode", async () => {
    const res = await request(app)
      .post("/api/chat/sessions")
      .send({ name: "Test Session", mode: "DETERMINISTIC" });
    expect(res.status).toBe(201);
    expect(res.body.mode).toBe("DETERMINISTIC");
  });

  it("GET /api/chat/sessions lists sessions", async () => {
    await request(app).post("/api/chat/sessions").send({});
    await request(app).post("/api/chat/sessions").send({});
    const res = await request(app).get("/api/chat/sessions");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
  });

  it("GET /api/chat/sessions/:id returns specific session", async () => {
    const createRes = await request(app).post("/api/chat/sessions").send({});
    const id = createRes.body.id;
    const res = await request(app).get(`/api/chat/sessions/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
  });

  it("GET /api/chat/sessions/:id returns 404 for unknown", async () => {
    const res = await request(app).get("/api/chat/sessions/unknown-id");
    expect(res.status).toBe(404);
  });

  it("DELETE /api/chat/sessions/:id deletes session", async () => {
    const createRes = await request(app).post("/api/chat/sessions").send({});
    const id = createRes.body.id;
    const delRes = await request(app).delete(`/api/chat/sessions/${id}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.deleted).toBe(true);

    const getRes = await request(app).get(`/api/chat/sessions/${id}`);
    expect(getRes.status).toBe(404);
  });

  it("DELETE /api/chat/sessions/:id returns 404 for unknown", async () => {
    const res = await request(app).delete("/api/chat/sessions/unknown-id");
    expect(res.status).toBe(404);
  });

  it("POST /api/chat reuses existing session by sessionId", async () => {
    const first = await request(app).post("/api/chat").send({ message: "hello" });
    const sessionId = first.body.sessionId;
    const second = await request(app).post("/api/chat").send({ message: "again", sessionId });
    expect(second.status).toBe(200);
    expect(second.body.sessionId).toBe(sessionId);
  });
});

describe("History route hardening", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    const deps = createTestDeps();
    app = createApp(deps);
  });

  it("ignores invalid type query param", async () => {
    await request(app).post("/api/generate").send({ prompt: "test" });
    const res = await request(app).get("/api/history?type=invalid");
    expect(res.status).toBe(200);
    // Invalid type is ignored, returns all entries
    expect(res.body.entries).toHaveLength(1);
  });

  it("caps limit to 1000", async () => {
    const res = await request(app).get("/api/history?limit=999999");
    expect(res.status).toBe(200);
    // Should not crash or allocate excessive memory
    expect(res.body.count).toBeDefined();
  });

  it("ignores negative limit", async () => {
    const res = await request(app).get("/api/history?limit=-5");
    expect(res.status).toBe(200);
  });

  it("filters by valid type", async () => {
    await request(app).post("/api/generate").send({ prompt: "test" });
    const res = await request(app).get("/api/history?type=generate");
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
  });
});

describe("Scan route", () => {
  it("rejects path outside root", async () => {
    const deps = createTestDeps();
    deps.rootDir = "/tmp/test-project";
    const app = createApp(deps);

    const res = await request(app).post("/api/scan").send({ target: "/etc/passwd" });
    expect(res.status).toBe(400);
  });

  it("rejects scan target exceeding max length", async () => {
    const app = createApp(createTestDeps());
    const longPath = "/tmp/" + "a".repeat(3000);
    const res = await request(app).post("/api/scan").send({ target: longPath });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });
});

describe("Generate error handling", () => {
  it("records failed generation in history", async () => {
    const deps = createTestDeps();
    const provider = deps.provider as { generate: ReturnType<typeof vi.fn> };
    provider.generate.mockRejectedValueOnce(new Error("Provider error"));
    const app = createApp(deps);

    const res = await request(app).post("/api/generate").send({ prompt: "fail test" });
    expect(res.status).toBe(500);

    const historyRes = await request(app).get("/api/history");
    expect(historyRes.body.entries).toHaveLength(1);
    expect(historyRes.body.entries[0].success).toBe(false);
    expect(historyRes.body.entries[0].error).toBe("Provider error");
  });
});
