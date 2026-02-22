# Architecture

ODA is designed as a modular, layered DevOps agent system — not a simple chatbot that generates bash commands. It is a structured, safe, extensible orchestration framework with 12 DevOps tools, 16 specialist agents, sandboxed execution, approval workflows, and hash-chained audit trails.

---

## High-Level Data Flow

```
User
 |
 v
CLI (@clack/prompts TUI) / REST API (Express)
 |
 v
Agent Router (16 specialist agents, keyword confidence scoring)
 |
 v
Planner Engine (LLM -> TaskGraph -> topological execution)
 |
 v
Tool SDK Layer (12 DevOps tools, Zod validation)
 |
 v
Execution Engine (Sandboxed, policy-enforced, approval-gated, audit-logged)
```

---

## Package Architecture

ODA is a pnpm monorepo with Turbo build orchestration. TypeScript (ES2022, CommonJS). All packages use the `@odaops/*` scope.

### 9 Packages

```
@odaops/cli          CLI entry point + rich TUI (@clack/prompts)
@odaops/api          REST API (Express) + web dashboard + factory functions
@odaops/planner      TaskGraph decomposition + topological executor
@odaops/executor     SafeExecutor: sandbox + policy engine + approval + audit log
@odaops/tools        12 DevOps tools (GitHub Actions, Terraform, K8s, Helm, Ansible,
                     Docker Compose, Dockerfile, Nginx, Makefile, GitLab CI, Prometheus, Systemd)
@odaops/scanner      6 security scanners + remediation engine
@odaops/session      Chat session management + memory + context injection
@odaops/core         LLM abstraction + 5 providers + 16 specialist agents + CI debugger + infra diff + DevOps checker
@odaops/sdk          BaseTool<T> abstract class with Zod validation + optional verify()
```

### Dependency Flow

```
@odaops/cli
  +-- @odaops/api
  |     +-- @odaops/planner
  |     |     +-- @odaops/core
  |     |           +-- @odaops/sdk (zod)
  |     +-- @odaops/executor
  |     |     +-- @odaops/sdk
  |     +-- @odaops/tools
  |     |     +-- @odaops/core
  |     |     +-- @odaops/sdk
  |     +-- @odaops/scanner
  |     +-- @odaops/session
  |           +-- @odaops/core
```

**Simplified linear flow:**

```
cli -> api -> planner -> executor -> tools -> core -> sdk
                                  -> scanner
                                  -> session -> core
```

---

## Layer Descriptions

### 1. LLM Layer (`@odaops/core`)

Abstraction over five LLM providers with structured JSON output:

| Provider  | JSON Mode Mechanism                         | SDK                 |
| --------- | ------------------------------------------- | ------------------- |
| OpenAI    | `response_format: { type: "json_object" }`  | `openai`            |
| Anthropic | JSON prefill technique                      | `@anthropic-ai/sdk` |
| Ollama    | `format: "json"`                            | `ollama`            |
| DeepSeek  | OpenAI-compatible API with custom `baseURL` | `openai`            |
| Gemini    | `responseMimeType: "application/json"`      | `@google/genai`     |

Key interface:

```typescript
interface LLMProvider {
  name: string;
  generate(request: LLMRequest): Promise<LLMResponse>;
  listModels?(): Promise<string[]>;
}
```

All responses pass through `parseAndValidate()` — strips markdown fences, `JSON.parse`, Zod `safeParse` — ensuring every LLM output conforms to the expected schema.

### 2. Multi-Agent System (`@odaops/core`)

16 specialist agents with keyword-based routing and confidence scoring. The `AgentRouter` scores prompts against each agent's keyword list and routes to the highest-confidence match. If no agent exceeds the threshold, it falls back to the general-purpose `DevOpsAgent`.

Additionally, three specialized analyzers (not routed via `AgentRouter`) provide structured analysis:

- **`CIDebugger`** — CI log diagnosis producing `CIDiagnosis` (error type, root cause, fixes)
- **`InfraDiffAnalyzer`** — Infrastructure diff analysis producing `InfraDiffAnalysis` (risk, cost, security)
- **`DevOpsChecker`** — DevOps config quality analysis producing `CheckReport` (score 0-100, findings, missing files)

See [Specialist Agents](agents.md) for the full agent list.

### 3. Task Planner (`@odaops/planner`)

LLM-powered goal decomposition into structured, dependency-aware task graphs. Uses Kahn's algorithm for topological execution ordering, `$ref:<taskId>` for inter-task data wiring, and `completedTaskIds` for resume after partial failures.

See [Task Planner](planner.md) for details.

### 4. Tool SDK (`@odaops/sdk`)

Abstract `BaseTool<T>` class with Zod input schema validation, abstract `generate()` for LLM generation, optional `execute()` for file writes, and optional `verify()` for external tool validation.

See [DevOps Tools](tools.md) for the tool pattern.

### 5. DevOps Tools (`@odaops/tools`)

12 tools covering CI/CD, IaC, containers, monitoring, and system services. Each follows the same file pattern: `schemas.ts` -> `detector.ts` -> `generator.ts` -> `verifier.ts` -> `*-tool.ts`.

See [DevOps Tools](tools.md) for the full tool list.

### 6. Execution Engine (`@odaops/executor`)

Orchestrates generate -> verify -> approve -> execute with policy enforcement, sandboxed file operations, and audit logging.

See [Execution Engine](execution-engine.md) for details.

### 7. Security Scanner (`@odaops/scanner`)

6 scanners (npm-audit, pip-audit, trivy, gitleaks, checkov, hadolint) with LLM-powered remediation.

See [Security Scanning](security-scanning.md) for details.

### 8. Chat Sessions (`@odaops/session`)

Multi-turn conversation management with memory windowing, LLM-generated summaries, project context injection, and session persistence.

### 9. REST API & Dashboard (`@odaops/api`)

Express-based API with dependency injection via `createApp(deps)`. 19 endpoints exposing all capabilities over HTTP. Vanilla web dashboard with 5 tabs (Overview, Security, Audit, Agents, History).

See [API Reference](api-reference.md) and [Web Dashboard](dashboard.md).

### 10. CLI (`@odaops/cli`)

Full-lifecycle CLI with rich TUI powered by `@clack/prompts`. Interactive prompts, spinners, styled panels, semantic log levels. Includes `oda init` (comprehensive repo scanner with 11 CI platforms, IaC, scripts, security detection) and `oda check` (LLM-powered DevOps config quality analysis).

See [CLI Reference](cli-reference.md).

---

## Design Principles

1. **No blind execution** — Every LLM output is validated before use.
2. **Structured JSON outputs** — Provider-native JSON modes + Zod schemas on all LLM responses.
3. **Schema validation everywhere** — Tool inputs, LLM responses, plan structures, API requests.
4. **Idempotent operations** — Generated configs produce the same result on re-execution.
5. **Clear separation of concerns** — Orchestration, generation, validation, execution, and auditing are independent layers.
6. **Extensibility** — New tools follow the `BaseTool<T>` pattern. New agents are registered in the specialist list.

---

## Data Storage

ODA stores project state in the `.oda/` directory:

```
.oda/
  context.json           Project context v2 (languages, 11 CI platforms, IaC, containers,
                         monitoring/web servers, scripts, security configs, devopsFiles[])
  session.json           Current session state
  plans/                 Saved TaskGraph plans (*.json)
  execution-logs/        Per-execution results (*.json)
  scan-history/          Security scan reports (*.json)
  sessions/              Chat session persistence (*.json)
  history/
    audit.jsonl          Hash-chained audit log (append-only)
  lock.json              Execution lock (PID-based)
```
