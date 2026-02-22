# Configuration

ODA supports 5 LLM providers with flexible configuration via CLI flags, environment variables, config files, and named profiles.

---

## Supported Providers

| Provider  | `ODA_PROVIDER` | Required Env Var    | Default Model                | SDK                   |
| --------- | -------------- | ------------------- | ---------------------------- | --------------------- |
| OpenAI    | `openai`       | `OPENAI_API_KEY`    | `gpt-4o-mini`                | `openai`              |
| Anthropic | `anthropic`    | `ANTHROPIC_API_KEY` | `claude-sonnet-4-5-20250929` | `@anthropic-ai/sdk`   |
| Ollama    | `ollama`       | _(none -- local)_   | `llama3`                     | `ollama`              |
| DeepSeek  | `deepseek`     | `DEEPSEEK_API_KEY`  | `deepseek-chat`              | `openai` (compatible) |
| Gemini    | `gemini`       | `GEMINI_API_KEY`    | `gemini-2.5-flash`           | `@google/genai`       |

---

## Configuration Methods

### Interactive Setup

```bash
oda config
```

The interactive wizard:

1. Selects a provider from the list
2. Prompts for the API key
3. Fetches available models from the provider's API via `listModels()`
4. Shows an interactive model picker

### Environment Variables

```bash
export ODA_PROVIDER=openai
export OPENAI_API_KEY=sk-...
export ODA_MODEL=gpt-4o              # Optional model override
export ODA_API_PORT=3000              # API server port (default: 3000)
```

### CLI Flags

```bash
oda --provider=anthropic "Create a Terraform config"
oda --model=gpt-4o "Create a Kubernetes deployment"
```

### Config File

ODA saves configuration to `~/.oda/config.json`:

```json
{
  "provider": "openai",
  "model": "gpt-4o-mini",
  "token": "sk-..."
}
```

---

## Configuration Precedence

Values are resolved in order (first match wins):

```
Provider:  --provider flag  >  $ODA_PROVIDER  >  config file  >  "openai" (default)
Model:     --model flag     >  $ODA_MODEL     >  config file  >  provider default
Token:     $OPENAI_API_KEY (etc.)  >  config file token
```

---

## Model Selection

Each provider ships with a sensible default, but you can choose any model your provider supports:

```bash
# Interactive: fetches models from provider API, shows picker
oda config

# Set directly in config
oda config --model=gpt-4o

# One-off override (doesn't change saved config)
oda --model=deepseek-reasoner "Analyze this Terraform plan"
```

### Dynamic Model Discovery

When running `oda config`, ODA calls the provider's `listModels()` API to fetch available models:

- **OpenAI** — Lists models from the OpenAI API
- **Anthropic** — Lists supported Claude models
- **Ollama** — Lists locally installed models
- **DeepSeek** — Lists available DeepSeek models
- **Gemini** — Lists available Gemini models

---

## Profiles

Named profiles let you switch between different provider/environment configurations:

### Create a Profile

```bash
# Save current config as a named profile
oda config profile create staging
```

### Use a Profile

```bash
# Switch to a profile (updates active config)
oda config profile use staging

# One-off profile override (doesn't change active config)
oda --profile=staging "Create an S3 bucket"
```

### List Profiles

```bash
oda config profile list
```

### Example: Multi-Environment Setup

```bash
# Set up development profile (local Ollama)
export ODA_PROVIDER=ollama
oda config
oda config profile create dev

# Set up production profile (OpenAI)
export ODA_PROVIDER=openai
export OPENAI_API_KEY=sk-prod-...
oda config --model=gpt-4o
oda config profile create prod

# Switch between them
oda config profile use dev    # Uses local Ollama
oda config profile use prod   # Uses OpenAI GPT-4o
```

---

## Environment Variables Reference

| Variable            | Description           | Default          |
| ------------------- | --------------------- | ---------------- |
| `ODA_PROVIDER`      | LLM provider name     | `openai`         |
| `ODA_MODEL`         | Model override        | Provider default |
| `OPENAI_API_KEY`    | OpenAI API key        | --               |
| `ANTHROPIC_API_KEY` | Anthropic API key     | --               |
| `DEEPSEEK_API_KEY`  | DeepSeek API key      | --               |
| `GEMINI_API_KEY`    | Google Gemini API key | --               |
| `ODA_API_PORT`      | API server port       | `3000`           |

### Ollama Setup

Ollama runs locally and doesn't require an API key:

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull a model
ollama pull llama3

# Configure ODA
export ODA_PROVIDER=ollama
oda "Create a Dockerfile for Node.js"
```

Ollama must be running at `localhost:11434`.

---

## Viewing Configuration

```bash
# Show current config
oda config show

# Show system health and config
oda doctor

# Inspect detailed config state
oda inspect config
```

---

## `.env` File

For development, create a `.env` file in the project root:

```bash
# .env
ODA_PROVIDER=openai
OPENAI_API_KEY=sk-...
ODA_MODEL=gpt-4o-mini
ODA_API_PORT=3000
```

See `.env.example` in the repository for a template.
