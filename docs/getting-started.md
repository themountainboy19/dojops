# Getting Started

This guide walks you through installing ODA, configuring an LLM provider, and generating your first DevOps configuration.

---

## Prerequisites

- **Node.js** >= 18
- **pnpm** >= 8 (for development only)
- An API key from at least one supported LLM provider (or a local Ollama instance)

---

## Installation

```bash
npm i -g @odaops/cli
```

Verify the installation:

```bash
oda --help
oda doctor
```

---

## Provider Setup

ODA requires an LLM provider to generate configurations. You can configure one interactively or via environment variables.

### Interactive Setup

```bash
oda config
```

The interactive wizard will:

1. Ask you to select a provider (OpenAI, Anthropic, Ollama, DeepSeek, Gemini)
2. Prompt for your API key
3. Fetch available models from the provider's API
4. Let you pick a model with an interactive selector

### Environment Variables

Alternatively, set environment variables directly:

```bash
export ODA_PROVIDER=openai          # openai | anthropic | ollama | deepseek | gemini
export OPENAI_API_KEY=sk-...        # your API key
```

See [Configuration](configuration.md) for the full list of providers, env vars, and precedence rules.

---

## First Generation

Generate a DevOps configuration with a natural language prompt:

```bash
oda "Create a Kubernetes deployment for nginx with 3 replicas"
```

ODA will:

1. Route your prompt to the most relevant specialist agent (in this case, `kubernetes-specialist`)
2. Generate a structured JSON response via the LLM
3. Validate the output against Zod schemas
4. Display the generated Kubernetes YAML

### More Examples

```bash
oda "Create a Terraform config for an S3 bucket with versioning"
oda "Write a Dockerfile for a Node.js Express app"
oda "Set up GitHub Actions CI for a TypeScript project"
oda "Create a Prometheus monitoring config with alerting rules"
```

---

## Project Initialization

For enterprise features (planning, execution, audit trails, metrics), initialize a project:

```bash
oda init
```

This creates a `.oda/` directory in your project root with:

- `context.json` — Project context (detected tools, languages, frameworks)
- `plans/` — Saved task graph plans
- `execution-logs/` — Execution history
- `scan-history/` — Security scan reports
- `history/audit.jsonl` — Hash-chained audit log

---

## Planning and Execution

Decompose a complex goal into a dependency-aware task graph:

```bash
oda plan "Set up CI/CD pipeline for a Node.js app with Docker and Kubernetes"
```

Execute the plan with an approval workflow:

```bash
oda apply                 # Execute with interactive approval prompts
oda apply --dry-run       # Preview changes without writing files
oda apply --verify        # Run external validation (terraform validate, hadolint, etc.)
oda apply --yes           # Auto-approve all operations
```

---

## Security Scanning

Scan your project for vulnerabilities, dependency issues, and IaC misconfigurations:

```bash
oda scan                  # Run all applicable scanners
oda scan --security       # Security scanners only (trivy, gitleaks)
oda scan --deps           # Dependency audit only (npm, pip)
oda scan --fix            # Generate and apply LLM-powered remediation
```

See [Security Scanning](security-scanning.md) for details on all 6 scanners.

---

## Interactive Chat

Start a multi-turn AI DevOps conversation:

```bash
oda chat                              # New interactive session
oda chat --session=myproject          # Resume or create a named session
oda chat --agent=terraform            # Pin to a specialist agent
```

Chat supports slash commands: `/exit`, `/agent <name>`, `/plan <goal>`, `/apply`, `/scan`, `/history`, `/clear`, `/save`.

---

## Web Dashboard

Start the API server and web dashboard:

```bash
oda serve                             # Start at http://localhost:3000
oda serve --port=8080                 # Custom port
```

The dashboard provides 5 tabs for monitoring and operations:

- **Overview** — Plan/execution/scan aggregates with activity timeline
- **Security** — Scan findings, severity trends, category breakdown
- **Audit** — Hash chain integrity, command distribution, timeline
- **Agents** — Browse and search all 16 specialist agents
- **History** — Execution history with type filtering

See [Web Dashboard](dashboard.md) for the full guide.

---

## Next Steps

- **[CLI Reference](cli-reference.md)** — Full command documentation
- **[API Reference](api-reference.md)** — REST API for programmatic access
- **[Architecture](architecture.md)** — System design overview
- **[Configuration](configuration.md)** — Advanced provider and profile setup
