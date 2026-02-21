# ODA — Open DevOps Agent

AI-powered DevOps automation. Generate, validate, and execute infrastructure and CI/CD configurations safely through a rich terminal UI, REST API, or web dashboard.

## Features

- **Multi-agent routing** — 5 specialist agents (planner, terraform, kubernetes, CI/CD, security) with keyword-based confidence scoring
- **5 DevOps tools** — GitHub Actions, Terraform, Kubernetes, Helm, Ansible — each with schema validation, generation, and optional execution
- **Task planner** — LLM-powered goal decomposition into dependency-aware task graphs with topological execution
- **Sandboxed execution** — Policy engine controlling write paths, env vars, timeouts, and file size limits
- **Approval workflows** — Auto-approve, auto-deny, or callback-based approval before destructive operations
- **CI debugging** — Paste CI logs, get structured diagnosis with error type, root cause, and suggested fixes
- **Infra diff analysis** — Risk level, cost impact, security implications, and rollback complexity for infrastructure changes
- **Rich terminal UI** — Interactive arrow-key prompts, spinners for async ops, styled note panels, semantic log levels (success/error/warn/info), session framing — powered by `@clack/prompts`
- **REST API** — 9 endpoints exposing all capabilities over HTTP
- **Web dashboard** — Dark-themed single-page app for visual interaction with all features
- **Structured output** — Zod schema enforcement on all LLM responses with JSON validation
- **3 LLM providers** — OpenAI, Anthropic, Ollama (local models)

## Architecture

```
@odaops/cli          CLI entry point + rich TUI (@clack/prompts)
@odaops/api          REST API (Express) + web dashboard
@odaops/planner      TaskGraph decomposition + topological executor
@odaops/executor     SafeExecutor: sandbox + policy engine + approval + audit log
@odaops/tools        GitHub Actions, Terraform, Kubernetes, Helm, Ansible
@odaops/core         LLM abstraction + multi-agent system + CI debugger + infra diff
@odaops/sdk          BaseTool<T> abstract class with Zod validation
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

### From npm

```bash
npm i -g @odaops/cli
```

### From source

```bash
git clone <repo-url> oda
cd oda
pnpm install
cp .env.example .env    # then edit with your API keys
pnpm build

# Register `oda` as a global command (pick one):
sudo npm link                       # system-wide (requires root)
# or
ln -s $PWD/packages/cli/dist/index.js ~/bin/oda   # user-local
export PATH="$HOME/bin:$PATH"       # add to ~/.bashrc or ~/.zshrc
```

## Configuration

### 1. Set your LLM provider

ODA supports three providers. Set the `ODA_PROVIDER` environment variable (or add it to `.env`):

| Provider      | `ODA_PROVIDER` | Required env var      | Default model                |
| ------------- | -------------- | --------------------- | ---------------------------- |
| **OpenAI**    | `openai`       | `OPENAI_API_KEY`      | `gpt-4o-mini`                |
| **Anthropic** | `anthropic`    | `ANTHROPIC_API_KEY`   | `claude-sonnet-4-5-20250929` |
| **Ollama**    | `ollama`       | _(none — runs local)_ | `llama3`                     |

### 2. Configure your API key

**Option A — `.env` file** (recommended for development):

```bash
cp .env.example .env
```

Then edit `.env`:

```bash
ODA_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-api03-...
```

**Option B — Shell exports** (useful for CI or one-off usage):

```bash
export ODA_PROVIDER=anthropic
export ANTHROPIC_API_KEY=sk-ant-api03-...
oda "Create a Terraform config for S3"
```

### 3. Select a model (optional)

Override the default model per-provider using `ODA_MODEL` env var or the `--model` CLI flag:

```bash
# Via environment variable
export ODA_MODEL=gpt-4o
oda "Create a Kubernetes deployment for nginx"

# Via CLI flag (takes precedence)
oda --model=claude-haiku-4-5-20251001 "Create a Terraform config for S3"
```

**Supported models (examples):**

| Provider  | Models                                                              |
| --------- | ------------------------------------------------------------------- |
| OpenAI    | `gpt-4o`, `gpt-4o-mini` (default), `gpt-4-turbo`, `o1-mini`         |
| Anthropic | `claude-sonnet-4-5-20250929` (default), `claude-haiku-4-5-20251001` |
| Ollama    | `llama3` (default), `mistral`, `codellama`, `deepseek-coder`        |

Any model string accepted by the provider's API can be used.

### 4. Other settings

```bash
ODA_API_PORT=3000    # API server port (default: 3000)
```

## Usage

### CLI

All CLI commands feature a rich terminal UI with interactive prompts, spinners, styled panels, and semantic log levels.

```bash
# After `npm link` (global install):
oda "Create a Terraform config for S3 with versioning"
oda --plan "Set up CI/CD for a Node.js app"
oda --execute --yes "Create CI for Node app"
oda --debug-ci "ERROR: tsc failed with exit code 1..."
oda --diff "terraform plan output..."

# Interactive configuration (arrow-key provider select, password input, model picker):
oda config

# Direct configuration:
oda config --provider anthropic --token <KEY> --model <MODEL>
oda config --show

# In-repo development (no global link needed):
pnpm oda -- "Create a Terraform config for S3 with versioning"
pnpm oda -- --plan "Set up CI/CD for a Node.js app"
pnpm oda -- --execute --yes "Create CI for Node app"
pnpm oda -- --debug-ci "ERROR: tsc failed..."
pnpm oda -- --diff "terraform plan output..."
```

### API Server + Web Dashboard

```bash
# Start the API server + web dashboard
oda serve
oda serve --port=8080

# In-repo development:
pnpm oda -- serve
pnpm oda -- serve --port=8080
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
pnpm test               # Run all 241 tests
pnpm lint               # ESLint across all packages
pnpm format             # Prettier write
pnpm format:check       # Prettier check

# Per-package commands
pnpm --filter @odaops/core test
pnpm --filter @odaops/api build
pnpm --filter @odaops/tools lint
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

All 6 planned phases are complete:

1. **Core Intelligence** — Structured output, Zod validation, planner engine
2. **DevOps Tools** — GitHub Actions, Terraform, Kubernetes, Helm, Ansible
3. **Execution** — Sandboxed executor, policy engine, approval workflows
4. **Intelligence** — Multi-agent routing, CI debugging, infra diff analysis
5. **Platform** — REST API, web dashboard
6. **CLI TUI Overhaul** — Rich terminal UI with `@clack/prompts` (interactive prompts, spinners, styled panels, semantic log levels)

## Publishing

All packages are published under the `@odaops` scope. To publish:

```bash
# Login to npm (requires @odaops org membership)
npm login

# Build and publish all packages
pnpm publish-packages
```

Packages are published in dependency order: `sdk` -> `core` -> `executor` -> `planner` -> `tools` -> `api` -> `cli`.

## Contributing

Contributions welcome. See the architecture docs for patterns and conventions.

## License

MIT
