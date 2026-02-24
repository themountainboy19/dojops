# DojOps Plugin Specification v1

**Status: FROZEN**
**Spec version: `spec: 1`**
**Effective from: v1.x**

This document defines the v1 plugin contract for DojOps. All plugins targeting DojOps v1.x MUST conform to this specification. The spec is **frozen** — no breaking changes will be made under `spec: 1`. See [Compatibility Promise](#12-compatibility-promise) for evolution rules.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Spec Version](#2-spec-version)
3. [Directory Structure](#3-directory-structure)
4. [Discovery Paths](#4-discovery-paths)
5. [Manifest Schema](#5-manifest-schema)
6. [Input Schema](#6-input-schema)
7. [Output Schema](#7-output-schema)
8. [Verification Command Whitelist](#8-verification-command-whitelist)
9. [Plugin Policy](#9-plugin-policy)
10. [Security Constraints](#10-security-constraints)
11. [Plugin Lifecycle](#11-plugin-lifecycle)
12. [Compatibility Promise](#12-compatibility-promise)
13. [Appendix A: Full Manifest Example](#appendix-a-full-manifest-example)
14. [Appendix B: Input Schema Example](#appendix-b-input-schema-example)

---

## 1. Overview

DojOps plugins extend the system with custom DevOps tools beyond the 12 built-in ones. Each plugin is a declarative package consisting of:

- A **manifest** (`plugin.yaml`) defining the tool's identity, LLM generation strategy, file outputs, and optional verification
- An **input schema** (`input.schema.json`) defining the tool's input contract via JSON Schema
- An optional **output schema** for structured LLM output enforcement

Plugins are discovered from disk, validated against this spec, converted to runtime `DevOpsTool`-compatible objects, and registered alongside built-in tools in the `ToolRegistry`.

---

## 2. Spec Version

Every manifest MUST declare `spec: 1`. This integer field gates validation and compatibility:

```yaml
spec: 1
```

The spec version is validated as `z.number().int().min(1).max(1)`. Future versions (`spec: 2`, etc.) will be handled by separate schema branches.

---

## 3. Directory Structure

A plugin directory contains:

```
my-plugin/
  plugin.yaml            # Required: manifest file
  input.schema.json      # Required: JSON Schema for tool inputs
  output.schema.json     # Optional: JSON Schema for structured LLM output
```

The `plugin.yaml` references schema files via relative paths:

```yaml
inputSchema: "input.schema.json"
outputSchema: "output.schema.json" # optional
```

---

## 4. Discovery Paths

Plugins are discovered from two locations:

| Location | Path                               | Priority                  |
| -------- | ---------------------------------- | ------------------------- |
| Global   | `~/.dojops/plugins/<plugin-name>/` | Lower                     |
| Project  | `.dojops/plugins/<plugin-name>/`   | Higher (overrides global) |

**Discovery rules:**

1. Global plugins are loaded first from `~/.dojops/plugins/`
2. Project plugins are loaded from `.dojops/plugins/` relative to the project root
3. If both locations contain a plugin with the same `name`, the **project plugin wins**
4. Each subdirectory is checked for a `plugin.yaml` file
5. Directories without `plugin.yaml` are silently skipped
6. Invalid manifests are silently skipped (no crash)
7. Plugins with missing input schema files are silently skipped

The `HOME` environment variable (or `USERPROFILE` on Windows) determines the global directory.

---

## 5. Manifest Schema

The `plugin.yaml` file MUST conform to the following schema:

### Top-level fields

| Field          | Type     | Required | Constraints                  | Description                              |
| -------------- | -------- | -------- | ---------------------------- | ---------------------------------------- |
| `spec`         | integer  | Yes      | `1` (exactly)                | Spec version                             |
| `name`         | string   | Yes      | 1-64 chars, `/^[a-z0-9-]+$/` | Plugin identifier (lowercase, hyphens)   |
| `version`      | string   | Yes      | min 1 char                   | Semantic version string                  |
| `type`         | string   | Yes      | `"tool"` (literal)           | Plugin type                              |
| `description`  | string   | Yes      | 1-500 chars                  | Human-readable description               |
| `inputSchema`  | string   | Yes      | min 1 char                   | Relative path to JSON Schema file        |
| `outputSchema` | string   | No       | min 1 char                   | Relative path to output JSON Schema file |
| `tags`         | string[] | No       | —                            | Discovery/categorization tags            |
| `generator`    | object   | Yes      | —                            | LLM generation configuration             |
| `files`        | array    | Yes      | min 1 entry                  | Output file definitions                  |
| `verification` | object   | No       | —                            | External verification command            |
| `detector`     | object   | No       | —                            | Existing file detection                  |
| `permissions`  | object   | No       | —                            | Capability declarations                  |

### `generator` object

| Field               | Type    | Required | Description                                |
| ------------------- | ------- | -------- | ------------------------------------------ |
| `strategy`          | string  | Yes      | Must be `"llm"`                            |
| `systemPrompt`      | string  | Yes      | System prompt sent to the LLM (min 1 char) |
| `updateMode`        | boolean | No       | Enable update-existing-config mode         |
| `existingDelimiter` | string  | No       | Delimiter for existing content injection   |

### `files` array entries

| Field        | Type   | Required | Constraints                                 | Description                                     |
| ------------ | ------ | -------- | ------------------------------------------- | ----------------------------------------------- |
| `path`       | string | Yes      | min 1 char, no `..` traversal               | Output file path (supports `{input}` templates) |
| `serializer` | enum   | Yes      | `yaml`, `json`, `hcl`, `ini`, `toml`, `raw` | Serialization format                            |

**Path traversal prevention:** File paths are validated to reject any segment containing `..`. The check splits on both `/` and `\` and rejects if any segment equals `..`.

### `verification` object

| Field     | Type   | Required | Description                                   |
| --------- | ------ | -------- | --------------------------------------------- |
| `command` | string | Yes      | Shell command to validate output (min 1 char) |

### `detector` object

| Field  | Type   | Required | Constraints                   | Description                     |
| ------ | ------ | -------- | ----------------------------- | ------------------------------- |
| `path` | string | Yes      | min 1 char, no `..` traversal | Path to detect existing configs |

### `permissions` object

| Field           | Type | Required | Values                  | Default behavior    |
| --------------- | ---- | -------- | ----------------------- | ------------------- |
| `filesystem`    | enum | No       | `"project"`, `"global"` | No restriction      |
| `network`       | enum | No       | `"none"`, `"inherit"`   | No restriction      |
| `child_process` | enum | No       | `"none"`, `"required"`  | Treated as `"none"` |

---

## 6. Input Schema

The `input.schema.json` file uses standard JSON Schema (draft-07 compatible subset). It is converted to a runtime Zod schema at plugin load time.

### Supported JSON Schema types

| JSON Schema type | Zod equivalent     | Notes                                            |
| ---------------- | ------------------ | ------------------------------------------------ |
| `string`         | `z.string()`       | Supports `description`, `default`                |
| `number`         | `z.number()`       | Supports `description`, `default`                |
| `integer`        | `z.number().int()` | Supports `description`, `default`                |
| `boolean`        | `z.boolean()`      | Supports `description`, `default`                |
| `array`          | `z.array(...)`     | Supports `items`, `description`, `default`       |
| `object`         | `z.object(...)`    | Supports `properties`, `required`, `description` |
| `enum`           | `z.enum(...)`      | Values are cast to strings                       |

### Property handling

- Properties listed in `required` are mandatory; others are optional (unless they have a `default`)
- Objects without `properties` become `z.record(z.unknown())`
- The `description` field is preserved via `.describe()`
- The `default` field is preserved via `.default()`
- Nested objects and arrays are recursively converted

---

## 7. Output Schema

The optional `output.schema.json` follows the same JSON Schema subset as input schemas. When present, it is passed as the `schema` field on the `LLMRequest`, enabling structured JSON output from providers that support it.

If no output schema is provided, the LLM response is parsed as raw JSON or treated as a string.

---

## 8. Verification Command Whitelist

Plugin verification commands are restricted to the following 16 binaries:

```
terraform    kubectl      helm         ansible-lint
docker       hadolint     yamllint     jsonlint
shellcheck   tflint       kubeval      conftest
checkov      trivy        kube-score   polaris
```

**Verification execution rules (3-tier check):**

1. **No command defined** (`verification` absent or `command` empty) → verification passes (no-op)
2. **`child_process` permission not `"required"`** → verification passes (never executes the command)
3. **Command not in whitelist** → verification **fails** with an error listing allowed binaries
4. **Command in whitelist AND `child_process: "required"`** → command is executed with a 30-second timeout

The binary check matches: exact binary name, or binary name followed by a space or tab (to allow arguments).

---

## 9. Plugin Policy

Project owners can control which plugins are allowed via `.dojops/policy.yaml`:

```yaml
# Allow only specific plugins (allowlist mode)
allowedPlugins:
  - my-terraform-plugin
  - my-k8s-plugin

# Block specific plugins (blocklist mode)
blockedPlugins:
  - untrusted-plugin
```

**Policy rules (evaluated in order):**

1. If `blockedPlugins` includes the plugin name → **denied**
2. If `allowedPlugins` is set and non-empty → only listed plugins are **allowed**
3. Otherwise → **allowed** (default-open)

The policy file is loaded from `.dojops/policy.yaml` relative to the project root. Missing or malformed policy files result in default-open behavior.

---

## 10. Security Constraints

### Path traversal prevention

All file paths in the manifest (`files[].path` and `detector.path`) are validated to reject path traversal:

```
Rejected: ../../../etc/passwd
Rejected: foo/../../bar
Allowed:  output/config.yaml
Allowed:  {name}.yaml
```

The check: `!path.split(/[/\\]/).includes("..")`

### Child process isolation

- Verification commands only execute when `permissions.child_process` is explicitly set to `"required"`
- Without this permission, verification silently passes (default-safe)
- Even with permission, only whitelisted binaries are allowed

### Plugin hash integrity

Each plugin has a SHA-256 hash computed from its `plugin.yaml` content. This hash is:

- Stored in `PluginSource.pluginHash` at discovery time
- Pinned into `PlanState` tasks at plan creation time
- Validated on `--resume` and `--replay` to detect plugin modifications
- **Only covers `plugin.yaml`** — changes to `input.schema.json` do not affect the hash

### System prompt hash

Each `PluginTool` exposes a `systemPromptHash` (SHA-256 of `generator.systemPrompt`). This enables:

- Per-task reproducibility tracking in plans
- Replay validation to detect prompt drift between plan creation and execution

---

## 11. Plugin Lifecycle

```
Discovery
    │
    ▼
Manifest Validation (Zod schema)
    │
    ▼
Schema Loading (input.schema.json → Zod, optional output.schema.json → Zod)
    │
    ▼
Hash Computation (SHA-256 of plugin.yaml)
    │
    ▼
Policy Check (.dojops/policy.yaml → allowed/blocked)
    │
    ▼
Registration (PluginTool created → added to ToolRegistry)
    │
    ▼
Execution
    ├── validate(input) → Zod safeParse
    ├── generate(input) → LLM call with systemPrompt + optional existingContent
    ├── verify(data) → 3-tier check → optional whitelisted command
    └── execute(input) → generate + serialize + write files (with .bak backup on update)
```

**Key behaviors during execution:**

- **Update mode**: When `generator.updateMode` is true and `detector.path` exists, existing file content is read and appended to the system prompt
- **Input `existingContent`**: Can also be passed directly via input fields
- **File writing**: Output is serialized using the configured `serializer` format
- **Backup**: On update (existing content detected), a `.bak` copy is created before overwriting
- **Template paths**: File paths support `{key}` placeholders replaced from input values

---

## 12. Compatibility Promise

Under `spec: 1`, the following changes are permitted without a spec version bump:

| Change                                     | Allowed?                    |
| ------------------------------------------ | --------------------------- |
| Add new **optional** manifest fields       | Yes                         |
| Add new serializer formats                 | Yes                         |
| Add new verification binaries to whitelist | Yes                         |
| Add new permission types (optional)        | Yes                         |
| Remove or rename existing fields           | **No** — requires `spec: 2` |
| Change field types or constraints          | **No** — requires `spec: 2` |
| Remove serializer formats                  | **No** — requires `spec: 2` |
| Remove verification binaries               | **No** — requires `spec: 2` |
| Change discovery paths                     | **No** — requires `spec: 2` |
| Change hash algorithm                      | **No** — requires `spec: 2` |

---

## Appendix A: Full Manifest Example

```yaml
spec: 1
name: my-terraform-module
version: "1.2.0"
type: tool
description: "Generates Terraform modules for AWS infrastructure"
inputSchema: "input.schema.json"
outputSchema: "output.schema.json"
tags:
  - terraform
  - aws
  - infrastructure

generator:
  strategy: llm
  systemPrompt: |
    You are a Terraform expert. Generate a complete Terraform module
    for the requested AWS infrastructure. Use best practices:
    - Use variables for all configurable values
    - Include proper resource tagging
    - Follow the standard module structure
    - Include outputs for key resource attributes
  updateMode: true

files:
  - path: "modules/{moduleName}/main.tf"
    serializer: hcl
  - path: "modules/{moduleName}/variables.tf"
    serializer: hcl
  - path: "modules/{moduleName}/outputs.tf"
    serializer: hcl

verification:
  command: "terraform validate"

detector:
  path: "modules/{moduleName}/main.tf"

permissions:
  filesystem: project
  child_process: required
```

---

## Appendix B: Input Schema Example

```json
{
  "type": "object",
  "properties": {
    "moduleName": {
      "type": "string",
      "description": "Name of the Terraform module to generate"
    },
    "provider": {
      "type": "string",
      "enum": ["aws", "gcp", "azure"],
      "description": "Cloud provider"
    },
    "resources": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "List of resource types to include"
    },
    "region": {
      "type": "string",
      "default": "us-east-1",
      "description": "Cloud region"
    },
    "enableMonitoring": {
      "type": "boolean",
      "default": false,
      "description": "Whether to include CloudWatch monitoring"
    }
  },
  "required": ["moduleName", "provider", "resources"]
}
```
