# ODA — Open DevOps Agent

AI-powered DevOps automation. Generate, validate, and execute infrastructure and CI/CD configurations safely through a CLI, REST API, or web dashboard.

## Features

- **Multi-agent routing** — 5 specialist agents (planner, terraform, kubernetes, CI/CD, security) with keyword-based confidence scoring
- **5 DevOps tools** — GitHub Actions, Terraform, Kubernetes, Helm, Ansible — each with schema validation, generation, and optional execution
- **Task planner** — LLM-powered goal decomposition into dependency-aware task graphs with topological execution
- **Sandboxed execution** — Policy engine controlling write paths, env vars, timeouts, and file size limits
- **Approval workflows** — Auto-approve, auto-deny, or callback-based approval before destructive operations
- **CI debugging** — Paste CI logs, get structured diagnosis with error type, root cause, and suggested fixes
- **Infra diff analysis** — Risk level, cost impact, security implications, and rollback complexity for infrastructure changes
- **REST API** — 9 endpoints exposing all capabilities over HTTP
- **Web dashboard** — Dark-themed single-page app for visual interaction with all features
- **Structured output** — Zod schema enforcement on all LLM responses with JSON validation
- **3 LLM providers** — OpenAI, Anthropic, Ollama (local models)

## Architecture

```
@oda/cli          CLI entry point (--plan, --execute, --yes, --debug-ci, --diff)
@oda/api          REST API (Express) + web dashboard
@oda/planner      TaskGraph decomposition + topological executor
@oda/executor     SafeExecutor: sandbox + policy engine + approval + audit log
@oda/tools        GitHub Actions, Terraform, Kubernetes, Helm, Ansible
@oda/core         LLM abstraction + multi-agent system + CI debugger + infra diff
@oda/sdk          BaseTool<T> abstract class with Zod validation
```

Full details in [ARCHITECTURE.md](ARCHITECTURE.md).

## Prerequisites

- **Node.js** >= 18
- **pnpm** >= 8
- An LLM provider:
  - **OpenAI** — requires `OPENAI_API_KEY`
  - **Anthropic** — requires `ANTHROPIC_API_KEY`
  - **Ollama** — requires local server running at `localhost:11434`

## Installation

```bash
git clone <repo-url> oda
cd oda
pnpm install
cp .env.example .env    # then edit with your API keys
pnpm build
```

## Configuration

Edit `.env`:

```bash
ODA_PROVIDER=openai          # openai | anthropic | ollama
OPENAI_API_KEY=sk-...        # required for openai provider
ANTHROPIC_API_KEY=sk-ant-... # required for anthropic provider
ODA_API_PORT=3000            # API server port (default: 3000)
```

## Usage

### CLI

```bash
# Default mode — multi-agent routing picks the best specialist
ODA_PROVIDER=ollama pnpm --filter @oda/cli dev "Create a Terraform config for S3 with versioning"

# Plan mode — decompose a goal into a task graph (generate only)
ODA_PROVIDER=ollama pnpm --filter @oda/cli dev --plan "Set up CI/CD for a Node.js app"

# Execute mode — generate + sandboxed execution with approval prompts
ODA_PROVIDER=ollama pnpm --filter @oda/cli dev --execute "Create CI for Node app"

# Execute with auto-approve — skip approval prompts
ODA_PROVIDER=ollama pnpm --filter @oda/cli dev --execute --yes "Create CI for Node app"

# Debug CI — diagnose a failing CI log
ODA_PROVIDER=ollama pnpm --filter @oda/cli dev --debug-ci "ERROR: tsc failed with exit code 1..."

# Infra diff — analyze risk/cost/security of infrastructure changes
ODA_PROVIDER=ollama pnpm --filter @oda/cli dev --diff "terraform plan output..."
```

### API Server + Web Dashboard

```bash
# Start the API server (serves dashboard at root)
ODA_PROVIDER=ollama pnpm --filter @oda/api dev
```

Open `http://localhost:3000` for the web dashboard.

### API Endpoints

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

# List agents
curl http://localhost:3000/api/agents

# View history
curl http://localhost:3000/api/history
```

## Development

```bash
pnpm build              # Build all packages
pnpm dev                # Dev mode (no caching)
pnpm test               # Run all 139 tests
pnpm lint               # ESLint across all packages
pnpm format             # Prettier write
pnpm format:check       # Prettier check

# Per-package commands
pnpm --filter @oda/core test
pnpm --filter @oda/api build
pnpm --filter @oda/tools lint
```

## Project Structure

```
packages/
  api/            REST API + web dashboard
    src/
      routes/     Express route handlers
      app.ts      Express app factory (dependency injection)
      server.ts   Entry point
      schemas.ts  Zod request validation
      store.ts    In-memory history store
      middleware.ts  Validation + error handling
      factory.ts  Provider/tools/agents factory
    public/       Web dashboard (HTML/CSS/JS)
  cli/            CLI entry point
  core/           LLM providers + agents + CI debugger + infra diff
  executor/       SafeExecutor + policy engine + approval workflows
  planner/        Task graph decomposition + topological executor
  sdk/            BaseTool abstract class + Zod re-export
  tools/          GitHub Actions, Terraform, Kubernetes, Helm, Ansible
```

## Roadmap

See [VISION.md](VISION.md) and [NEXT_STEPS.md](NEXT_STEPS.md) for the full roadmap.

All 5 planned phases are complete:

1. **Core Intelligence** — Structured output, Zod validation, planner engine
2. **DevOps Tools** — GitHub Actions, Terraform, Kubernetes, Helm, Ansible
3. **Execution** — Sandboxed executor, policy engine, approval workflows
4. **Intelligence** — Multi-agent routing, CI debugging, infra diff analysis
5. **Platform** — REST API, web dashboard

## Contributing

Contributions welcome. See the architecture docs for patterns and conventions.

## License

MIT
