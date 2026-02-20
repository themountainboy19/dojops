# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ODA (Open DevOps Agent) is an agentic DevOps system that automates infrastructure and CI/CD tasks using LLM providers. Early-stage project — most packages are scaffolded but not yet implemented.

## Commands

```bash
pnpm build              # Build all packages via Turbo
pnpm dev                # Dev mode (no caching)
pnpm lint               # ESLint across all packages
pnpm test               # Vitest across all packages
pnpm format             # Prettier write
pnpm format:check       # Prettier check (CI)

# Per-package
pnpm --filter @oda/core build
pnpm --filter @oda/cli dev
pnpm --filter @oda/sdk build
pnpm --filter @oda/core test

# Run CLI
ODA_PROVIDER=ollama pnpm --filter @oda/cli dev <prompt>
```

## Architecture

**Monorepo**: pnpm workspaces + Turbo. TypeScript (ES2022, CommonJS). Packages use `@oda/*` scope.

**Package dependency flow** (top → bottom):

```
@oda/cli          → Entry point, selects LLM provider via ODA_PROVIDER env var
@oda/core         → LLM abstraction: DevOpsAgent + providers (OpenAI, Anthropic, Ollama)
@oda/sdk          → DevOpsTool interface (validate → generate → execute pattern)
@oda/planner      → (planned) Task graph engine
@oda/executor     → (planned) Sandboxed execution
@oda/tools        → (planned) DevOps tool implementations
@oda/api          → (planned) REST API layer
```

**Key abstractions:**

- `LLMProvider` interface (`packages/core/src/llm/provider.ts`) — all providers implement `generate(LLMRequest): Promise<LLMResponse>`
- `DevOpsAgent` (`packages/core/src/agent.ts`) — wraps an LLMProvider
- `DevOpsTool` interface (`packages/sdk/src/tool.ts`) — tools must validate input before generation/execution

**Design principles** (from ARCHITECTURE.md): No blind execution. Structured JSON outputs. Schema validation before tool execution. Idempotent operations.

## Environment

Set in `.env` (see `.env.example`):

- `ODA_PROVIDER`: `openai` (default) | `anthropic` | `ollama`
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` as needed
- Ollama requires local server at `localhost:11434`

## Path Aliases

Defined in root `tsconfig.json`:

- `@oda/core/*` → `packages/core/src/*`
- `@oda/sdk/*` → `packages/sdk/src/*`
