# 🎯 Goal

Allow external tools to integrate into DojOps **as if they were native tools**, without breaking:

- BaseTool<T> pattern
- Planner flow
- Executor flow
- Zod validation
- Verification model
- Audit logging
- Update existing config logic
- Policy engine

---

# 🧠 Core Insight

You already have a perfect abstraction:

```
BaseTool<T>
```

So plugins must compile into something that behaves like:

```
class ExternalTool extends BaseTool<T>
```

The plugin system should not bypass the SDK.
It should dynamically generate a BaseTool-compatible adapter.

---

# 🏗 Final Architecture: Native Tool + Plugin Tool Hybrid Model

We extend `@dojops/tools` into two categories:

1. Built-in tools (existing 12)
2. External plugin tools (new system)

Both must implement the same runtime contract.

---

# 🏛 Updated Layered Architecture

Current:

```
cli → api → planner → executor → tools → core → sdk
```

New:

```
cli → api → planner → executor → tool-registry → core → sdk
```

Where:

```
@dojops/tool-registry
```

becomes a new internal layer.

---

# 🧩 New Package

## @dojops/tool-registry

Responsibilities:

- Load built-in tools
- Discover plugin tools
- Validate plugin manifests
- Convert plugin definitions → BaseTool-compatible objects
- Provide unified tool list to:
  - Planner
  - CLI
  - Agents
  - API
  - Executor

---

# 📁 Plugin Location Strategy

Global:

```
~/.dojops/plugins/<tool-name>/
```

Project:

```
./.dojops/plugins/<tool-name>/
```

Priority:

1. Project overrides global
2. Global overrides built-in (if allowed by policy)

---

# 🧱 Plugin Tool Architecture

Plugins must mirror native tool pattern conceptually:

Instead of:

```
schemas.ts
generator.ts
verifier.ts
tool.ts
```

They provide declarative equivalents:

```
plugin.yaml
input.schema.json
output.schema.json
detector.js (optional)
verifier.js (optional)
serializer.js (optional)
```

But we simplify for v1.

---

# ✅ Plugin Spec v1 (Native-Compatible)

plugin.yaml:

```yaml
spec: 1

name: terragrunt
version: 1.0.0
type: tool

description: Generate and validate Terragrunt configurations

inputSchema: input.schema.json
outputSchema: output.schema.json

generator:
  strategy: llm
  systemPrompt: |
    Generate a Terragrunt configuration.

  updateMode: true
  existingDelimiter: |
    --- EXISTING CONFIGURATION ---
    {{existingContent}}
    --- END ---

files:
  - path: terragrunt.hcl
    serializer: hcl

verification:
  command: "terragrunt validate"

detector:
  path: terragrunt.hcl

permissions:
  filesystem: project
  network: inherit
  child_process: required
```

---

# 🧠 How Core Converts Plugin → BaseTool

ToolRegistry loads plugin.yaml and generates at runtime:

```ts
class PluginTool extends BaseTool<any> {
  name = manifest.name
  inputSchema = loadZodFromJSON(manifest.inputSchema)

  async generate(input) {
    const existing = detectExisting()
    const prompt = buildPrompt(manifest, input, existing)
    const response = await provider.generate(...)
    return parseAndValidate(response, outputSchema)
  }

  async verify(data) {
    if (!manifest.verification) return
    runCommand(manifest.verification.command)
  }

  async execute(input) {
    applyBackupLogic()
    writeFiles()
  }
}
```

To the rest of the system, this looks identical to:

```
TerraformTool
DockerfileTool
```

Planner doesn’t care.
Executor doesn’t care.
Agents don’t care.

That’s the key.

---

# 🔁 Planner Integration

Planner currently references tools by name.

Now:

ToolRegistry exposes:

```
getAllTools(): Tool[]
getTool(name): Tool
```

Planner dynamically includes plugin tools in:

- Capability list
- Plan generation
- Dependency graph

Plugins become first-class citizens.

---

# 🤖 Agent Integration

Agents should not hardcode tool names.

Instead:

Each agent declares:

```
supportedToolTags: ["iac", "ci", "container"]
```

Plugins declare:

```
tags:
  - iac
  - terragrunt
```

ToolRegistry resolves mapping.

This makes the system future-proof.

---

# 🛡 Policy Integration

ExecutionPolicy must validate:

- Plugin name
- Publisher
- Trust level
- Permissions
- Binary execution

Policy file:

```
.dojops/policy.yaml
```

Can restrict:

```
allowedPlugins:
  - terraform
  - terragrunt

blockedPlugins:
  - random-unsafe-tool
```

---

# 🔒 Security Model for Plugins

Core enforces:

- Schema validation
- JSON-only LLM output
- Zod parsing
- External binary sandboxing
- Timeout
- Memory limits
- Allowed paths
- Backup before overwrite
- Audit log

Plugin cannot:

- Execute arbitrary JS
- Inject raw shell
- Bypass policy
- Access internal APIs

---

# 📊 Audit Integration

Audit log entry includes:

```
toolType: built-in | plugin
pluginVersion
pluginSource: global | project
pluginHash
```

This preserves enterprise compliance.

---

# 📦 Tool Installation Command

Extend:

```
dojops tools install <name>
```

Now supports:

- Installing official plugin registry packages
- Installing from local directory
- Installing from Git URL

Installation process:

1. Download plugin package
2. Validate manifest
3. Validate schemas
4. Compute hash
5. Store under:

```
~/.dojops/plugins/<tool>/<version>/
```

---

# 🧠 Compatibility Strategy

Plugin spec version:

```
spec: 1
```

Core supports:

```
SUPPORTED_PLUGIN_SPECS = [1]
```

Future spec 2 won’t break spec 1.

---

# 🏛 Final Refined Architecture

```
@dojops/cli
   ↓
@dojops/api
   ↓
@dojops/planner
   ↓
@dojops/executor
   ↓
@dojops/tool-registry  ← NEW
   ↓
@dojops/tools (built-in)
   + plugins (dynamic)
   ↓
@dojops/core
   ↓
@dojops/sdk
```

---

# 🎯 Why This Design Is Correct

It:

- Respects BaseTool pattern
- Keeps Planner unchanged
- Keeps Executor unchanged
- Keeps audit system intact
- Preserves verification model
- Preserves update-mode logic
- Preserves backup-before-overwrite
- Avoids JS requirement for users
- Supports enterprise governance
- Enables marketplace later
- Keeps architecture clean

---

# 🚀 This Is Production-Grade

With this design:

- DojOps becomes extensible without fragmentation
- Enterprise customers can add internal tools
- Community can contribute safely
- Core remains stable
- Built-in tools and plugin tools are indistinguishable

---
