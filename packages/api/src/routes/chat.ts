import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { LLMProvider, AgentRouter } from "@dojops/core";
import { ChatSession } from "@dojops/session";
import type { ChatSessionState } from "@dojops/session";
import { HistoryStore } from "../store";
import { ChatRequestSchema, ChatSessionRequestSchema } from "../schemas";
import { validateBody } from "../middleware";

// ── Disk persistence helpers ──────────────────────────────────────

function sessionsDir(rootDir: string): string {
  return path.join(rootDir, ".dojops", "sessions");
}

function persistSession(rootDir: string | undefined, session: ChatSession): void {
  if (!rootDir) return;
  try {
    const dir = sessionsDir(rootDir);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${session.id}.json`);
    const state = session.getState();
    fs.writeFileSync(file, JSON.stringify(state, null, 2) + "\n");
  } catch {
    // Disk persistence is best-effort — never fail the request
  }
}

function loadSessionFromDisk(rootDir: string, sessionId: string): ChatSessionState | null {
  try {
    const file = path.join(sessionsDir(rootDir), `${sessionId}.json`);
    return JSON.parse(fs.readFileSync(file, "utf-8")) as ChatSessionState;
  } catch {
    return null;
  }
}

function deleteSessionFromDisk(rootDir: string | undefined, sessionId: string): void {
  if (!rootDir) return;
  try {
    const file = path.join(sessionsDir(rootDir), `${sessionId}.json`);
    fs.unlinkSync(file);
  } catch {
    // Best-effort
  }
}

function loadAllSessionsFromDisk(
  rootDir: string,
  provider: LLMProvider,
  agentRouter: AgentRouter,
  cache: Map<string, ChatSession>,
  maxSessions: number,
): void {
  try {
    const dir = sessionsDir(rootDir);
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8")) as ChatSessionState;
        if (cache.has(data.id)) continue;
        if (cache.size >= maxSessions) break;
        const session = new ChatSession({
          provider,
          router: agentRouter,
          state: data,
          mode: data.mode ?? "INTERACTIVE",
        });
        cache.set(data.id, session);
      } catch {
        // Skip corrupt files
      }
    }
  } catch {
    // Best-effort
  }
}

export function createChatRouter(
  provider: LLMProvider,
  agentRouter: AgentRouter,
  store: HistoryStore,
  rootDir?: string,
): Router {
  const router = Router();

  // In-memory session store for API sessions (capped to prevent memory exhaustion)
  const MAX_SESSIONS = 500;
  const sessions = new Map<string, ChatSession>();

  // Hydrate cache from disk on startup
  if (rootDir) {
    loadAllSessionsFromDisk(rootDir, provider, agentRouter, sessions, MAX_SESSIONS);
  }

  function getOrCreateSession(
    sessionId?: string,
    agent?: string,
    mode?: "INTERACTIVE" | "DETERMINISTIC",
  ): ChatSession {
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      if (agent) session.pinAgent(agent);
      return session;
    }

    // Cache miss — try loading from disk
    if (sessionId && rootDir) {
      const diskState = loadSessionFromDisk(rootDir, sessionId);
      if (diskState) {
        const session = new ChatSession({
          provider,
          router: agentRouter,
          state: diskState,
          mode: diskState.mode ?? "INTERACTIVE",
        });
        if (agent) session.pinAgent(agent);
        sessions.set(session.id, session);
        return session;
      }
    }

    // Evict oldest session if at capacity
    if (sessions.size >= MAX_SESSIONS) {
      const oldestKey = sessions.keys().next().value;
      if (oldestKey) sessions.delete(oldestKey);
    }

    const session = new ChatSession({
      provider,
      router: agentRouter,
      mode: mode ?? "INTERACTIVE",
    });
    if (agent) session.pinAgent(agent);
    sessions.set(session.id, session);
    persistSession(rootDir, session);
    return session;
  }

  // POST / — Send a message
  router.post("/", validateBody(ChatRequestSchema), async (req, res, next) => {
    const start = Date.now();
    try {
      const { sessionId, message, agent } = req.body;
      const session = getOrCreateSession(sessionId, agent);

      const result = await session.send(message);
      persistSession(rootDir, session);

      const response = {
        content: result.content,
        agent: result.agent,
        sessionId: session.id,
      };

      store.add({
        type: "chat",
        request: { sessionId: session.id, message },
        response,
        durationMs: Date.now() - start,
        success: true,
      });

      res.json(response);
    } catch (err) {
      store.add({
        type: "chat",
        request: req.body,
        response: null,
        durationMs: Date.now() - start,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
      next(err);
    }
  });

  // POST /sessions — Create a new session
  router.post("/sessions", validateBody(ChatSessionRequestSchema), (req, res) => {
    // Evict oldest session if at capacity
    if (sessions.size >= MAX_SESSIONS) {
      const oldestKey = sessions.keys().next().value;
      if (oldestKey) sessions.delete(oldestKey);
    }

    const { name, mode } = req.body;
    const session = new ChatSession({
      provider,
      router: agentRouter,
      mode: mode ?? "INTERACTIVE",
    });
    if (name) session.setName(name);
    sessions.set(session.id, session);
    persistSession(rootDir, session);
    res.status(201).json(session.getState());
  });

  // GET /sessions — List all sessions
  router.get("/sessions", (_req, res) => {
    const list: ChatSessionState[] = [];
    for (const session of sessions.values()) {
      list.push(session.getState());
    }
    list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    res.json(list);
  });

  // GET /sessions/:id — Get session state
  router.get("/sessions/:id", (req, res) => {
    let session = sessions.get(req.params.id);
    if (!session && rootDir) {
      const diskState = loadSessionFromDisk(rootDir, req.params.id);
      if (diskState) {
        session = new ChatSession({
          provider,
          router: agentRouter,
          state: diskState,
          mode: diskState.mode ?? "INTERACTIVE",
        });
        sessions.set(session.id, session);
      }
    }
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json(session.getState());
  });

  // DELETE /sessions/:id — Delete session
  router.delete("/sessions/:id", (req, res) => {
    const deleted = sessions.delete(req.params.id);
    deleteSessionFromDisk(rootDir, req.params.id);
    if (!deleted) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json({ deleted: true });
  });

  return router;
}
