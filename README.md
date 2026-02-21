# ODA — Open DevOps Agent

Enterprise-grade AI DevOps automation. Generate, validate, and execute infrastructure and CI/CD configurations safely — with structured output enforcement, sandboxed execution, approval workflows, and hash-chained audit trails.

## The Problem

1. **Manual IaC is slow** — Writing Terraform, Kubernetes, and CI/CD configs from scratch takes hours. Teams spend more time on boilerplate than architecture.
2. **AI-generated configs are unsafe** — LLMs produce plausible but unvalidated output. Without schema enforcement and execution controls, AI-generated infrastructure is a liability.
3. **Teams lack visibility into AI-driven changes** — When AI generates configs, there's no audit trail, no approval gate, and no way to resume partial failures. Compliance teams can't sign off on what they can't verify.

## How ODA Works

### Simple Mode — Stateless CLI

```bash
oda "Create a Terraform config for S3 with versioning"
oda "Create a Dockerfile for a Node.js Express app"
oda debug ci "ERROR: tsc failed with exit code 1..."
oda analyze diff "terraform plan output..."
```

ODA routes to the right specialist agent, enforces structured JSON output via Zod schemas, and returns validated configs.

### Enterprise Mode — Full Lifecycle

```bash
oda init                              # Initialize project state
oda plan "Create CI/CD for Node app"  # Decompose into task graph
oda validate                          # Validate plan against schemas
oda apply                             # Execute with approval workflow
oda apply --resume                    # Resume partially-failed plans
oda history verify                    # Verify audit log integrity
oda history show <plan-id>            # Inspect per-task results
```

Plans are persisted, execution is sandboxed, every action is audit-logged with hash-chained integrity, and partial failures can be resumed without re-executing completed tasks.

## Security & Compliance

ODA implements defense-in-depth for AI-driven infrastructure changes:

- **Structured output enforcement** — All LLM responses are constrained to JSON schemas via provider-native modes (OpenAI `response_format`, Anthropic prefill, Ollama `format`)
- **Zod schema validation** — Every tool input and LLM output is validated against Zod schemas before execution
- **Policy engine** — `ExecutionPolicy` controls write permissions, allowed/denied paths, environment variables, timeouts, and file size limits
- **Approval workflows** — Configurable approval handlers: auto-approve, auto-deny, or interactive callback with diff preview before any write operation
- **Sandboxed execution** — `SandboxedFs` restricts file operations to policy-allowed paths with audit logging
- **Hash-chained audit trail** — Every CLI action is logged to an append-only JSONL file with SHA-256 hash chaining (seq + previousHash + hash). Tamper detection via `oda history verify`
- **Execution locking** — PID-based lock files prevent concurrent mutations with automatic stale-lock cleanup

## Quick Start

```bash
# 1. Install
npm i -g @odaops/cli

# 2. Set your API key
export ODA_PROVIDER=openai
export OPENAI_API_KEY=sk-...

# 3. Generate your first config
oda "Create a Kubernetes deployment for nginx with 3 replicas"
```

## Features

- **Multi-agent routing** — 16 specialist agents (planner, terraform, kubernetes, CI/CD, security, Docker, cloud, networking, database, GitOps, compliance, CI debugger, appsec, shell, Python, observability) with keyword-based confidence scoring
- **12 DevOps tools** — GitHub Actions, Terraform, Kubernetes, Helm, Ansible, Docker Compose, Dockerfile, Nginx, Makefile, GitLab CI, Prometheus, Systemd — each with schema validation, generation, and optional execution
- **Task planner** — LLM-powered goal decomposition into dependency-aware task graphs with topological execution
- **Sandboxed execution** — Policy engine controlling write paths, env vars, timeouts, and file size limits
- **Approval workflows** — Auto-approve, auto-deny, or callback-based approval before destructive operations
- **Resume on failure** — `oda apply --resume` skips completed tasks and retries failed ones, with per-task result tracking
- **CI debugging** — Paste CI logs, get structured diagnosis with error type, root cause, and suggested fixes
- **Infra diff analysis** — Risk level, cost impact, security implications, and rollback complexity for infrastructure changes
- **Rich terminal UI** — Interactive arrow-key prompts, spinners for async ops, styled note panels, semantic log levels — powered by `@clack/prompts`
- **Hash-chained audit logs** — Tamper-evident audit trail with SHA-256 chain integrity verification
- **REST API** — 9 endpoints exposing all capabilities over HTTP
- **Web dashboard** — Dark-themed single-page app for visual interaction with all features
- **Structured output** — Zod schema enforcement on all LLM responses with JSON validation
- **5 LLM providers** — OpenAI, Anthropic, Ollama (local models), DeepSeek, Google Gemini
- **Dynamic model selection** — `oda config` fetches available models from the provider API for interactive selection

## Architecture

```
@odaops/cli          CLI entry point + rich TUI (@clack/prompts)
@odaops/api          REST API (Express) + web dashboard
@odaops/planner      TaskGraph decomposition + topological executor
@odaops/executor     SafeExecutor: sandbox + policy engine + approval + audit log
@odaops/tools        12 DevOps tools (GitHub Actions, Terraform, K8s, Helm, Ansible,
                     Docker Compose, Dockerfile, Nginx, Makefile, GitLab CI, Prometheus, Systemd)
@odaops/core         LLM abstraction + 16 specialist agents + CI debugger + infra diff
@odaops/sdk          BaseTool<T> abstract class with Zod validation
```

Full details in [ARCHITECTURE.md](ARCHITECTURE.md).

## CLI Reference

### Commands

```
plan               Decompose goal into task graph
generate           Generate DevOps config (default)
apply              Execute a saved plan
validate           Validate plan against schemas
explain            LLM explains a plan
debug ci           Diagnose CI/CD log failures
analyze diff       Analyze infrastructure diff for risk
inspect            Inspect config, policy, agents, session
agents             List and inspect specialist agents
history            View execution history
history verify     Verify audit log hash chain integrity
config             Configure provider, model, tokens
auth               Authenticate with LLM provider
serve              Start API server + dashboard
doctor             System health diagnostics
init               Initialize .oda/ in project
destroy            Remove generated artifacts from a plan
rollback           Reverse an applied plan
```

### Apply Options

```
--dry-run          Preview changes without executing
--resume           Resume a partially-applied plan
--yes              Auto-approve all executions
```

### Plan Options

```
--execute          Generate + execute with approval workflow
--yes              Auto-approve all executions
```

### Global Options

```
--provider=NAME    LLM provider: openai, anthropic, ollama, deepseek, gemini
--model=NAME       LLM model override
--profile=NAME     Use named config profile
--output=FORMAT    Output: table (default), json, yaml
--verbose          Verbose output
--debug            Debug-level output
--quiet            Suppress non-essential output
--no-color         Disable color output
--non-interactive  Disable interactive prompts
```

## Tools

| Tool           | Directory         | Detector | Serialization                | Output Files                        |
| -------------- | ----------------- | -------- | ---------------------------- | ----------------------------------- |
| GitHub Actions | `github/`         | Yes      | js-yaml                      | `.github/workflows/ci.yml`          |
| Terraform      | `terraform/`      | Yes      | Custom HCL builder           | `main.tf`, `variables.tf`           |
| Kubernetes     | `kubernetes/`     | No       | js-yaml                      | `K8s manifests`                     |
| Helm           | `helm/`           | No       | js-yaml                      | `Chart.yaml`, `values.yaml`         |
| Ansible        | `ansible/`        | No       | js-yaml                      | `{name}.yml`                        |
| Docker Compose | `docker-compose/` | Yes      | js-yaml                      | `docker-compose.yml`                |
| Dockerfile     | `dockerfile/`     | Yes      | Custom string builder        | `Dockerfile`, `.dockerignore`       |
| Nginx          | `nginx/`          | No       | Custom string builder        | `nginx.conf`                        |
| Makefile       | `makefile/`       | Yes      | Custom string builder (tabs) | `Makefile`                          |
| GitLab CI      | `gitlab-ci/`      | Yes      | js-yaml                      | `.gitlab-ci.yml`                    |
| Prometheus     | `prometheus/`     | No       | js-yaml                      | `prometheus.yml`, `alert-rules.yml` |
| Systemd        | `systemd/`        | No       | Custom string builder (INI)  | `{name}.service`                    |

All tools follow the `BaseTool<T>` pattern: `schemas.ts` → `detector.ts` (optional) → `generator.ts` → `*-tool.ts` → tests.

## Specialist Agents

| Agent                    | Domain                  | Routing Keywords                                      |
| ------------------------ | ----------------------- | ----------------------------------------------------- |
| ops-cortex               | orchestration           | plan, decompose, orchestrate, strategy, roadmap       |
| terraform-specialist     | infrastructure          | terraform, iac, hcl, provision, resource, module      |
| kubernetes-specialist    | container-orchestration | kubernetes, k8s, pod, deployment, helm, ingress       |
| cicd-specialist          | ci-cd                   | ci, cd, pipeline, github actions, jenkins, gitlab ci  |
| security-auditor         | security                | security, audit, vulnerability, secret, firewall, iam |
| observability-specialist | observability           | monitoring, logging, alerting, prometheus, grafana    |
| docker-specialist        | containerization        | docker, dockerfile, container, image, compose         |
| cloud-architect          | cloud-architecture      | aws, gcp, azure, serverless, lambda, migration        |
| network-specialist       | networking              | dns, load balancer, vpc, vpn, cdn, nginx              |
| database-specialist      | data-storage            | database, postgres, mysql, redis, dynamodb            |
| gitops-specialist        | gitops                  | gitops, argocd, flux, reconciliation, drift           |
| compliance-auditor       | compliance              | compliance, soc2, hipaa, policy, opa                  |
| ci-debugger              | ci-debugging            | debug, error, failed, failure, timeout, flaky         |
| appsec-specialist        | application-security    | owasp, xss, injection, pentest, sast, dast            |
| shell-specialist         | shell-scripting         | bash, shell, shellcheck, posix, cron                  |
| python-specialist        | python-scripting        | python, pip, pytest, mypy, poetry                     |

## API Reference

| Method   | Path               | Description                    |
| -------- | ------------------ | ------------------------------ |
| `GET`    | `/api/health`      | Provider info and tool list    |
| `POST`   | `/api/generate`    | Agent-routed LLM generation    |
| `POST`   | `/api/plan`        | Decompose goal into task graph |
| `POST`   | `/api/debug-ci`    | Diagnose CI log failures       |
| `POST`   | `/api/diff`        | Analyze infrastructure diff    |
| `GET`    | `/api/agents`      | List specialist agents         |
| `GET`    | `/api/history`     | Execution history              |
| `GET`    | `/api/history/:id` | Single history entry           |
| `DELETE` | `/api/history`     | Clear history                  |

**Examples:**

```bash
# Generate
curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Create a Kubernetes deployment for nginx with 3 replicas"}'

# Plan
curl -X POST http://localhost:3000/api/plan \
  -H "Content-Type: application/json" \
  -d '{"goal": "Set up CI/CD pipeline for a Node.js app", "execute": false}'

# Debug CI
curl -X POST http://localhost:3000/api/debug-ci \
  -H "Content-Type: application/json" \
  -d '{"log": "ERROR: npm ERR! code ERESOLVE\nnpm ERR! ERESOLVE unable to resolve dependency tree"}'

# Infra diff
curl -X POST http://localhost:3000/api/diff \
  -H "Content-Type: application/json" \
  -d '{"diff": "# aws_s3_bucket.main will be created\n+ resource \"aws_s3_bucket\" \"main\" {\n+   bucket = \"my-bucket\"\n+ }"}'
```

## Configuration

### Providers

| Provider      | `ODA_PROVIDER` | Required env var      | Default model                |
| ------------- | -------------- | --------------------- | ---------------------------- |
| **OpenAI**    | `openai`       | `OPENAI_API_KEY`      | `gpt-4o-mini`                |
| **Anthropic** | `anthropic`    | `ANTHROPIC_API_KEY`   | `claude-sonnet-4-5-20250929` |
| **Ollama**    | `ollama`       | _(none — runs local)_ | `llama3`                     |
| **DeepSeek**  | `deepseek`     | `DEEPSEEK_API_KEY`    | `deepseek-chat`              |
| **Gemini**    | `gemini`       | `GEMINI_API_KEY`      | `gemini-2.5-flash`           |

### Models

Each provider ships with a sensible default model, but you can choose any model your provider supports. Run `oda config` to interactively fetch available models from the provider's API and pick one, or set it directly with `--model`:

```bash
oda config                          # Interactive: fetches models, shows select list
oda config --model=gpt-4o           # Set directly
oda --model=deepseek-reasoner "..." # One-off override
```

| Provider  | Default model                | Other examples                           |
| --------- | ---------------------------- | ---------------------------------------- |
| OpenAI    | `gpt-4o-mini`                | `gpt-4o`, `gpt-4-turbo`, `o1-mini`       |
| Anthropic | `claude-sonnet-4-5-20250929` | `claude-haiku-4-5-20251001`              |
| Ollama    | `llama3`                     | `mistral`, `codellama`, `deepseek-coder` |
| DeepSeek  | `deepseek-chat`              | `deepseek-reasoner`                      |
| Gemini    | `gemini-2.5-flash`           | `gemini-2.5-pro`                         |

Any model string accepted by the provider's API can be used — the table above shows common examples, not an exhaustive list.

### Configuration precedence

```
Provider:  --provider  >  $ODA_PROVIDER  >  config  >  openai
Model:     --model     >  $ODA_MODEL     >  config  >  provider default
Token:     $OPENAI_API_KEY / $ANTHROPIC_API_KEY / $DEEPSEEK_API_KEY / $GEMINI_API_KEY  >  config token
```

## Development

```bash
pnpm build              # Build all packages
pnpm dev                # Dev mode (no caching)
pnpm test               # Run all 442 tests
pnpm lint               # ESLint across all packages
pnpm format             # Prettier write
pnpm format:check       # Prettier check

# Per-package commands
pnpm --filter @odaops/core test
pnpm --filter @odaops/api build
pnpm --filter @odaops/tools lint
```

### Project Structure

```
packages/
  api/            REST API + web dashboard
  cli/            CLI entry point + TUI
  core/           LLM providers + 16 agents + CI debugger + infra diff
  executor/       SafeExecutor + policy engine + approval workflows
  planner/        Task graph decomposition + topological executor
  sdk/            BaseTool abstract class + Zod re-export
  tools/          12 DevOps tools (GitHub Actions, Terraform, K8s, Helm, Ansible,
                  Docker Compose, Dockerfile, Nginx, Makefile, GitLab CI, Prometheus, Systemd)
```

### Test Coverage

| Package            | Tests   |
| ------------------ | ------- |
| `@odaops/cli`      | 140     |
| `@odaops/tools`    | 101     |
| `@odaops/api`      | 70      |
| `@odaops/core`     | 62      |
| `@odaops/executor` | 36      |
| `@odaops/planner`  | 28      |
| `@odaops/sdk`      | 5       |
| **Total**          | **442** |

## Roadmap

See [NEXT_STEPS.md](NEXT_STEPS.md) for the full roadmap.

**v1.0.0 (current):**

1. **Core Intelligence** — Structured output, Zod validation, planner engine
2. **DevOps Tools** — 12 tools covering CI/CD, IaC, containers, monitoring, and system services
3. **Execution** — Sandboxed executor, policy engine, approval workflows
4. **Intelligence** — 16 specialist agents, CI debugging, infra diff analysis
5. **Platform** — REST API with 9 endpoints, web dashboard
6. **CLI TUI** — Rich terminal UI with `@clack/prompts`
7. **Enterprise Foundations** — Resume/recovery, hash-chained audit logs, execution locking

**v2.0.0 (planned):**

- RBAC & multi-tenancy
- Persistent storage backends (SQLite, PostgreSQL)
- OpenTelemetry observability
- SSO, webhooks, Slack/Teams integrations
- Git provider integration (auto-PR)

## Publishing

All packages are published under the `@odaops` scope:

```bash
npm login
pnpm publish-packages
```

Packages are published in dependency order: `sdk` -> `core` -> `executor` -> `planner` -> `tools` -> `api` -> `cli`.

## Contributing

Contributions welcome. See the architecture docs for patterns and conventions.

## License

MIT
