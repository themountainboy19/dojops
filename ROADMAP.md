# DojOps – Roadmap

This document tracks DojOps's development from initial scaffold to production-grade DevOps agent.

---

# v1.0.0 — Shipped

All eight phases are complete. DojOps v1.0.0 ships with 12 built-in DevOps tools, a plugin system for custom tools, 16 specialist agents, sandboxed execution, approval workflows, hash-chained audit trails, a REST API with web dashboard, observability metrics, and a rich terminal UI.

---

## Phase 1 — Core Intelligence Layer (DONE)

- **Structured output enforcement** — LLM responses constrained to JSON via provider-native modes (OpenAI `response_format`, Anthropic prefill, Ollama `format`, DeepSeek `response_format`, Gemini `responseMimeType`)
- **5 LLM providers** — OpenAI, Anthropic, Ollama, DeepSeek (OpenAI-compatible), Google Gemini (`@google/genai`)
- **Dynamic model selection** — `dojops config` fetches available models from provider APIs via `listModels()` for interactive selection
- **Zod schema validation** — Every tool input and LLM output validated with Zod schemas via `parseAndValidate()`
- **Planner engine** — `TaskGraph` decomposition via LLM, `PlannerExecutor` with Kahn's topological sort, `$ref:<taskId>` input wiring, failure cascading, `completedTaskIds` for resume

---

## Phase 2 — DevOps Tools (DONE)

12 tools covering CI/CD, infrastructure-as-code, containers, monitoring, and system services:

| Tool           | Detector | Serialization                |
| -------------- | -------- | ---------------------------- |
| GitHub Actions | Yes      | js-yaml                      |
| Terraform      | Yes      | Custom HCL builder           |
| Kubernetes     | No       | js-yaml                      |
| Helm           | No       | js-yaml                      |
| Ansible        | No       | js-yaml                      |
| Docker Compose | Yes      | js-yaml                      |
| Dockerfile     | Yes      | Custom string builder        |
| Nginx          | No       | Custom string builder        |
| Makefile       | Yes      | Custom string builder (tabs) |
| GitLab CI      | Yes      | js-yaml                      |
| Prometheus     | No       | js-yaml                      |
| Systemd        | No       | Custom string builder (INI)  |

All tools follow the `BaseTool<T>` pattern: `schemas.ts` → `detector.ts` (optional) → `generator.ts` → `*-tool.ts` → tests.

### Update Existing Config Capability

All 12 tools support updating existing configurations:

- **Auto-detection** — Tools read existing config files from known paths before generation
- **LLM prompt switching** — Generators switch between "generate new" and "update existing, preserve current config" system prompts
- **`existingContent` input field** — Callers can explicitly pass existing content; auto-detection is the fallback
- **Backup before overwrite** — `execute()` creates `.bak` files before updating existing configs
- **`isUpdate` output flag** — CLI shows "Would update:" (yellow) vs "Would write:" (green) in plan output
- **Shared utilities** — `readExistingConfig()` and `backupFile()` in `@dojops/sdk` (50KB size limit, best-effort backup)

---

## Phase 3 — Secure Execution Layer (DONE)

- **SafeExecutor** — generate → approval → execute pipeline with policy checks, timeout, and audit logging
- **ExecutionPolicy** — write permissions, allowed/denied paths, env vars, timeout, file size limits
- **ApprovalHandler** — auto-approve, auto-deny, or interactive callback with diff preview
- **SandboxedFs** — path-restricted file operations with per-file audit logging
- **Resume & recovery** — `dojops apply --resume` skips completed tasks, retries failed ones
- **Hash-chained audit trail** — SHA-256 hash-chained JSONL with tamper detection via `dojops history verify`
- **Execution locking** — PID-based lock files prevent concurrent mutations

---

## Phase 4 — Intelligence Expansion (DONE)

- **16 specialist agents** — ops-cortex, terraform, kubernetes, cicd, security-auditor, observability, docker, cloud-architect, network, database, gitops, compliance-auditor, ci-debugger, appsec, shell, python
- **AgentRouter** — keyword-based routing with confidence scoring and fallback
- **CI Debugger** — paste CI logs, get structured diagnosis (error type, root cause, fixes, confidence)
- **InfraDiffAnalyzer** — risk level, cost impact, security implications, rollback complexity, recommendations

---

## Phase 5 — Platform Layer (DONE)

- **REST API** — 9 Express endpoints exposing all capabilities over HTTP with Zod request validation
- **Web dashboard** — dark-themed SPA with 6 tabs (Generate, Plan, Debug CI, Infra Diff, Agents, History)
- **In-memory HistoryStore** — operation history with add/getAll/getById/clear

---

## Phase 6 — CLI TUI Overhaul (DONE)

- **@clack/prompts** — interactive arrow-key prompts, spinners, styled note panels, semantic log levels
- **Full command set** — init, plan, validate, apply, destroy, rollback, explain, debug ci, analyze diff, inspect, agents, history, status/doctor, config, auth, serve, chat, check, scan, tools
- **Session framing** — intro/outro wrapping, approval flow with confirm/cancel

---

## Phase 7 — Observability & Metrics Dashboard (DONE)

- **MetricsAggregator** — reads `.dojops/` data on-demand: plans, execution logs, scan reports, audit JSONL
- **4 metrics API endpoints** — `GET /api/metrics` (full), `/overview`, `/security`, `/audit`
- **Overview tab** — total plans, success rate, avg execution time, critical issues, recent activity, most used commands, failure reasons
- **Security tab** — severity breakdown bar, findings trend chart (CSS-only bars), top issues table, scan history
- **Audit tab** — hash-chain integrity badge (valid/invalid), status breakdown, command distribution, timeline
- **Auto-refresh** — observability tabs poll every 30 seconds with visual indicator
- **Doctor enhancement** — `dojops doctor` shows plans count, success rate, scan count, audit chain integrity
- **Health endpoint** — includes `metricsEnabled: boolean` flag
- **25 new tests** — aggregator unit tests (17) + route integration tests (8)

---

## Phase 8 — Plugin System & Tool Registry (DONE)

- **`@dojops/tool-registry` package** — Unified registry combining built-in + plugin tools with `getAll()` / `get(name)` interface
- **Plugin discovery** — Automatic scanning of `~/.dojops/plugins/` (global) and `.dojops/plugins/` (project); project overrides global
- **Declarative plugin manifests** — `plugin.yaml` + `input.schema.json` — no TypeScript code needed to create custom tools
- **JSON Schema to Zod conversion** — Plugin input schemas converted to Zod at runtime for full compatibility with Planner and Executor
- **PluginTool adapter** — Converts manifests into `DevOpsTool`-compatible objects with generate (LLM), execute (file write), verify (external command)
- **Plugin policy engine** — `.dojops/policy.yaml` with `allowedPlugins` / `blockedPlugins` lists; blocked takes precedence
- **Serializers** — YAML, JSON, raw (with HCL/INI/TOML placeholders)
- **Audit enrichment** — `toolType`, `pluginSource`, `pluginVersion`, `pluginHash` fields on audit entries
- **CLI plugin commands** — `dojops tools plugins list/validate/init` for plugin management
- **Bug fix** — `createTools()` now returns all 12 built-in tools (was 5)
- **91 new tests** — manifest validation, JSON-to-Zod, serializers, plugin loader, plugin tool, registry, policy

---

# v2.0.0 — Planned

## Phase 9 — Enterprise Readiness

### RBAC & Multi-Tenancy

- Role-based access control for plan/apply/destroy operations
- Multi-tenant project isolation
- API key scoping per tenant

### Persistent Storage

- Pluggable storage backends (filesystem → SQLite → PostgreSQL)
- Migrate in-memory HistoryStore to persistent backend
- Plan and audit log archival with retention policies

### Observability

- OpenTelemetry instrumentation for LLM calls, tool execution, and plan lifecycle
- Prometheus metrics endpoint (`/metrics`)
- Structured logging with correlation IDs

### Enterprise Integrations

- SSO (OIDC/SAML) for API authentication
- Webhook notifications for plan lifecycle events
- Slack/Teams integration for approval workflows
- Git provider integration (auto-PR for applied plans)

### Advanced Execution

- Docker-based isolated execution environments
- Cost estimation engine for infrastructure changes
- Drift detection for applied configurations
- Cloud provider SDK integrations (AWS, GCP, Azure)

---

# Engineering Principles

1. Safety over speed
2. Deterministic execution
3. Schema validation everywhere
4. Modular plugin architecture
5. Clear separation of orchestration vs execution
