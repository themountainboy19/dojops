# v1 Removal + tools-to-modules Migration Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `.dops v1` format, remove `tool.yaml` manifests, rename all "tool" terminology to "module" across the monorepo and Hub.

**Architecture:** Seven sequential phases — package rename, v1 runtime deletion, tool.yaml deletion, type renames, user-facing surface, Hub, verification. Each phase is one commit. Build verification after each phase.

**Tech Stack:** TypeScript, pnpm workspaces, Turbo, Vitest, Zod, Next.js (Hub)

**Spec:** `docs/superpowers/specs/2026-03-11-v1-removal-tools-to-modules-design.md`

---

## File Structure Overview

### Files to DELETE (12 files)

```
packages/runtime/src/runtime.ts                                    # v1 DopsRuntime class
packages/runtime/src/prompt-compiler.ts                            # v1 prompt compilation
packages/runtime/src/structural-validator.ts                       # v1 structural validation
packages/runtime/src/__tests__/runtime.test.ts                     # v1 runtime tests
packages/runtime/src/__tests__/deep-integration.test.ts            # v1 integration tests
packages/tool-registry/src/custom-tool.ts                          # tool.yaml CustomTool adapter
packages/tool-registry/src/tool-loader.ts                          # tool.yaml discovery
packages/tool-registry/src/manifest-schema.ts                      # tool.yaml Zod schemas
packages/tool-registry/src/__tests__/tool-loader.test.ts           # tool.yaml discovery tests
packages/tool-registry/src/__tests__/external-tool-integration.test.ts  # CustomTool tests
packages/tool-registry/src/__tests__/tool-upgrade.test.ts          # manifest upgrade tests
docs/TOOL_SPEC_v1.md                                               # frozen v1 spec doc
```

### Files to RENAME (directory + key files)

```
packages/tool-registry/           -> packages/module-registry/
packages/sdk/src/tool.ts          -> packages/sdk/src/module.ts
docs/tools.md                     -> docs/modules.md
```

### Files to MODIFY (heavy changes)

```
# Root config
tsconfig.json                          # path alias rename
pnpm-workspace.yaml                    # (auto, glob pattern)

# Runtime package — strip v1
packages/runtime/src/spec.ts           # remove v1 schemas, DopsModuleV2 -> DopsModule
packages/runtime/src/parser.ts         # remove v1 parsers, simplify to v2-only
packages/runtime/src/index.ts          # remove v1 exports
packages/runtime/src/__tests__/parser.test.ts  # remove v1 test cases

# Module-registry (ex tool-registry) — strip tool.yaml + rename types
packages/module-registry/package.json  # rename package
packages/module-registry/src/index.ts  # remove v1 imports, rename exports
packages/module-registry/src/registry.ts  # ToolRegistry -> ModuleRegistry
packages/module-registry/src/types.ts  # ToolEntry -> ModuleEntry, delete Plugin* aliases
packages/module-registry/src/policy.ts # ToolPolicy -> ModulePolicy, delete Plugin* aliases
packages/module-registry/CLAUDE.md     # update terminology

# SDK — BaseTool -> BaseModule
packages/sdk/src/module.ts             # (renamed from tool.ts) BaseTool -> BaseModule
packages/sdk/src/index.ts              # update barrel export
packages/sdk/CLAUDE.md                 # update terminology

# Consumer packages — update imports
packages/api/package.json              # dependency rename
packages/api/src/factory.ts            # import path + type rename
packages/api/src/routes/plan.ts        # DevOpsTool -> DevOpsModule
packages/api/src/app.ts                # DevOpsTool -> DevOpsModule
packages/cli/package.json              # dependency rename
packages/cli/src/commands/agents.ts    # import path rename
packages/cli/src/commands/apply.ts     # import path rename
packages/cli/src/commands/generate.ts  # import path rename
packages/cli/src/commands/plan.ts      # import path rename
packages/cli/src/commands/replay-validator.ts  # import path + type rename
packages/cli/src/commands/serve.ts     # import path rename
packages/cli/src/commands/tools.ts     # import path + type rename + user strings
packages/cli/src/commands/validate.ts  # import path rename
packages/cli/src/help.ts              # user-facing strings
packages/cli/src/index.ts             # deprecation warning on `tools` alias

# Test files — update imports
packages/sdk/src/__tests__/tool.test.ts         # rename + BaseTool -> BaseModule
packages/executor/src/__tests__/safe-executor.test.ts  # DevOpsTool -> DevOpsModule
packages/planner/src/__tests__/decomposer.test.ts      # DevOpsTool -> DevOpsModule
packages/planner/src/__tests__/executor.test.ts        # DevOpsTool -> DevOpsModule
packages/cli/src/__tests__/commands/replay-validator.test.ts  # import path

# Planner + Executor — type rename only
packages/planner/src/decomposer.ts     # DevOpsTool -> DevOpsModule
packages/planner/src/executor.ts       # DevOpsTool -> DevOpsModule
packages/executor/src/safe-executor.ts # DevOpsTool -> DevOpsModule

# Documentation
README.md
CHANGELOG.md
docs/modules.md                        # (renamed from tools.md) full rewrite
docs/cli-reference.md

# Hub (separate repo)
/app/dojops-org/dojops-hub/src/lib/dops-schema.ts
/app/dojops-org/dojops-hub/src/lib/dops-parser.ts
/app/dojops-org/dojops-hub/src/app/api/packages/route.ts
```

---

## Chunk 1: Package Rename + v1 Deletion

### Task 1: Rename packages/tool-registry/ to packages/module-registry/

**Files:**

- Rename: `packages/tool-registry/` -> `packages/module-registry/`
- Modify: `packages/module-registry/package.json`
- Modify: `tsconfig.json`
- Modify: `packages/api/package.json`
- Modify: `packages/cli/package.json`

- [ ] **Step 1: Rename the directory**

```bash
cd /app/dojops-org/dojops
mv packages/tool-registry packages/module-registry
```

- [ ] **Step 2: Update package.json name**

In `packages/module-registry/package.json`, change:

```json
"name": "@dojops/tool-registry"
```

to:

```json
"name": "@dojops/module-registry"
```

- [ ] **Step 3: Update root tsconfig.json path alias**

In `tsconfig.json`, change line 21:

```json
"@dojops/tool-registry/*": ["packages/tool-registry/src/*"]
```

to:

```json
"@dojops/module-registry/*": ["packages/module-registry/src/*"]
```

- [ ] **Step 4: Update consumer package.json dependencies**

In `packages/api/package.json` line 54, change:

```json
"@dojops/tool-registry": "workspace:*"
```

to:

```json
"@dojops/module-registry": "workspace:*"
```

In `packages/cli/package.json` line 60, change:

```json
"@dojops/tool-registry": "workspace:*"
```

to:

```json
"@dojops/module-registry": "workspace:*"
```

- [ ] **Step 5: Update ALL import paths across the monorepo**

Replace `@dojops/tool-registry` with `@dojops/module-registry` in every import statement. Files to update (11 files):

```
packages/cli/src/commands/agents.ts:12
packages/cli/src/commands/apply.ts:10
packages/cli/src/commands/generate.ts:8
packages/cli/src/commands/plan.ts:4
packages/cli/src/commands/replay-validator.ts:1
packages/cli/src/commands/serve.ts:9
packages/cli/src/commands/tools.ts:8
packages/cli/src/commands/validate.ts:3
packages/cli/src/__tests__/commands/replay-validator.test.ts:4
packages/api/src/factory.ts:19-20
```

- [ ] **Step 6: Update module-registry CLAUDE.md**

Replace all references to `@dojops/tool-registry` with `@dojops/module-registry`.

- [ ] **Step 7: Run pnpm install to update lockfile**

```bash
pnpm install
```

- [ ] **Step 8: Verify build**

```bash
pnpm build
```

Expected: All 11 packages compile successfully.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: rename @dojops/tool-registry to @dojops/module-registry"
```

---

### Task 2: Delete v1 runtime files

**Files:**

- Delete: `packages/runtime/src/runtime.ts`
- Delete: `packages/runtime/src/prompt-compiler.ts`
- Delete: `packages/runtime/src/structural-validator.ts`
- Delete: `packages/runtime/src/__tests__/runtime.test.ts`
- Delete: `packages/runtime/src/__tests__/deep-integration.test.ts`
- Modify: `packages/runtime/src/index.ts`

- [ ] **Step 1: Delete v1 runtime class**

```bash
rm packages/runtime/src/runtime.ts
```

- [ ] **Step 2: Delete v1 prompt compiler**

```bash
rm packages/runtime/src/prompt-compiler.ts
```

- [ ] **Step 3: Delete v1 structural validator**

```bash
rm packages/runtime/src/structural-validator.ts
```

- [ ] **Step 4: Delete v1 test files**

```bash
rm packages/runtime/src/__tests__/runtime.test.ts
rm packages/runtime/src/__tests__/deep-integration.test.ts
```

- [ ] **Step 5: Remove v1 exports from runtime/src/index.ts**

Remove all lines that export from deleted files:

- `DopsRuntime`, `DopsRuntimeOptions`, `ToolMetadata` exports (line ~107)
- `compilePrompt`, `compileSystemPrompt` exports
- `structuralValidate`, `StructuralRule` exports
- Remove v1 schema type exports (lines 1-31): `DopsModule`, `DopsFrontmatter`, `InputFieldDef`, `FileSpec`, `DetectionConfig`, `Permissions`, `Scope`, `Risk`, `Execution`, `MarkdownSections`

Keep all v2 exports: `DopsRuntimeV2`, `DopsRuntimeV2Options`, `DocProvider`, `stripCodeFences`, `parseRawContent`, `parseMultiFileOutput`, `DopsModuleV2`, `ContextBlock`, `Context7LibraryRef`, `isV2Module`.

Also keep shared utilities: `parseDopsFileAny`, `parseDopsStringAny`, `compileSchema`, `serialize*`, `writeFiles`, `verifyWithBinary`, `KNOWN_VERIFICATION_PARSERS`, `runReviewTools`, `discoverDevOpsFiles`, `REVIEW_TOOL_MAP`.

- [ ] **Step 6: Remove v1 imports in module-registry/src/index.ts**

Remove `DopsRuntime` import from `@dojops/runtime`. In `loadBuiltInDopsModules()` and `loadUserDopsModules()`, remove the v1 branch:

```typescript
// REMOVE this branch:
if (!isV2Module(module)) {
  tools.push(new DopsRuntime(module, provider, ...));
}
```

Only the v2 path remains: `new DopsRuntimeV2(module, ...)`.

- [ ] **Step 7: Verify build**

```bash
pnpm build
```

- [ ] **Step 8: Run tests**

```bash
pnpm test
```

Expected: Tests pass (minus deleted v1 tests). Some tests may fail if they imported v1 types — fix in next steps.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor(runtime): remove dops v1 runtime, prompt compiler, and structural validator"
```

---

### Task 3: Strip v1 schemas from spec.ts and simplify parser.ts

**Files:**

- Modify: `packages/runtime/src/spec.ts`
- Modify: `packages/runtime/src/parser.ts`
- Modify: `packages/runtime/src/__tests__/parser.test.ts`

- [ ] **Step 1: Strip v1 schemas from spec.ts**

Remove from `packages/runtime/src/spec.ts`:

- `InputFieldDef` schema (lines ~5-20)
- `FileSpecSchema` v1 variant (lines ~142-162)
- `DetectionConfigSchema` (lines ~166-171)
- `PermissionsSchema` (lines ~175-181)
- `ScopeSchema` (lines ~207-211)
- `RiskSchema` (lines ~215-220)
- `ExecutionSchema` (lines ~224-230)
- `DopsFrontmatterSchema` v1 (lines ~255-276)
- `DopsModule` interface (lines ~290-294)

Rename `DopsModuleV2` to `DopsModule` (this becomes the only module type).
Rename `DopsFrontmatterV2` to `DopsFrontmatter`.
Remove `DopsModuleAny` union type (no longer needed — there's only one type).
Remove `isV2Module()` function (lines ~370-372).

Keep all v2 schemas: `ContextBlockSchema`, `Context7LibraryRefSchema`, `DopsFrontmatterV2Schema` (rename to `DopsFrontmatterSchema`), `OutputGuidanceSchema`, `BestPracticesSchema`.

- [ ] **Step 2: Simplify parser.ts to v2-only**

Remove from `packages/runtime/src/parser.ts`:

- `parseDopsFile()` v1-only function (lines ~19-22)
- `parseDopsString()` v1-only function (lines ~27-37)
- `validateDopsModule()` v1-only validation (lines ~91-118)
- v1 branch inside `parseDopsStringAny()` (the `else` branch that defaults to v1)

Simplify `parseDopsStringAny()`: remove version detection — always parse as v2. If `dops` field is not `"v2"`, throw a clear error: `"Unsupported .dops version. Only v2 is supported. Set 'dops: v2' in frontmatter."`.

Rename `parseDopsFileAny()` to `parseDopsFile()` (it's the only parser now).
Rename `parseDopsStringAny()` to `parseDopsString()`.

- [ ] **Step 3: Update parser.test.ts**

Remove all v1 test cases. Keep v2 test cases. Update function names: `parseDopsStringAny` -> `parseDopsString`, `parseDopsFileAny` -> `parseDopsFile`.

Add a test case:

```typescript
it("rejects v1 .dops files with clear error", () => {
  const v1Content = `---\ndops: v1\nname: test\n---\n# Prompt\nGenerate something`;
  expect(() => parseDopsString(v1Content)).toThrow(/only v2 is supported/i);
});
```

- [ ] **Step 4: Update all callers of renamed parser functions**

Search for `parseDopsFileAny` and `parseDopsStringAny` across the monorepo and rename to `parseDopsFile` / `parseDopsString`:

- `packages/module-registry/src/index.ts` — `loadBuiltInDopsModules()`, `loadUserDopsModules()`
- Any other callers

- [ ] **Step 5: Update runtime/src/index.ts exports**

Replace exports:

- `parseDopsFileAny` -> `parseDopsFile`
- `parseDopsStringAny` -> `parseDopsString`
- `DopsModuleV2` -> `DopsModule`
- `DopsFrontmatterV2` -> `DopsFrontmatter`
- Remove `DopsModuleAny`, `isV2Module`

- [ ] **Step 6: Verify build + tests**

```bash
pnpm build && pnpm test
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(runtime): strip v1 schemas, simplify parsers to v2-only"
```

---

### Task 4: Delete tool.yaml code from module-registry

**Files:**

- Delete: `packages/module-registry/src/custom-tool.ts`
- Delete: `packages/module-registry/src/tool-loader.ts`
- Delete: `packages/module-registry/src/manifest-schema.ts`
- Delete: `packages/module-registry/src/__tests__/tool-loader.test.ts`
- Delete: `packages/module-registry/src/__tests__/external-tool-integration.test.ts`
- Delete: `packages/module-registry/src/__tests__/tool-upgrade.test.ts`
- Delete: `docs/TOOL_SPEC_v1.md`
- Modify: `packages/module-registry/src/index.ts`

- [ ] **Step 1: Delete tool.yaml files**

```bash
rm packages/module-registry/src/custom-tool.ts
rm packages/module-registry/src/tool-loader.ts
rm packages/module-registry/src/manifest-schema.ts
rm packages/module-registry/src/__tests__/tool-loader.test.ts
rm packages/module-registry/src/__tests__/external-tool-integration.test.ts
rm packages/module-registry/src/__tests__/tool-upgrade.test.ts
rm docs/TOOL_SPEC_v1.md
```

- [ ] **Step 2: Remove tool.yaml exports from index.ts**

In `packages/module-registry/src/index.ts`, remove:

```typescript
export * from "./custom-tool";
export * from "./tool-loader";
export * from "./manifest-schema";
```

- [ ] **Step 3: Remove tool.yaml code from createToolRegistry()**

In `packages/module-registry/src/index.ts`, remove the `discoverTools()` call and `CustomTool` instantiation block from `createToolRegistry()` (lines ~153-172). The function should only load built-in `.dops` modules and user `.dops` modules — no tool.yaml discovery.

- [ ] **Step 4: Remove tool.yaml references from CLI commands/tools.ts**

In `packages/cli/src/commands/tools.ts`:

- Remove any code that calls `discoverTools()` or references `CustomTool`
- Remove `tool.yaml` init/validate/load subcommands if they exist
- Keep `dojops modules list` (only shows `.dops v2` modules)
- Keep `dojops modules install/publish/search` (Hub integration)

- [ ] **Step 5: Remove tool.yaml references from replay-validator.ts**

In `packages/cli/src/commands/replay-validator.ts`:

- Remove `checkToolIntegrity()` / `checkPluginIntegrity()` if they validate tool.yaml manifests
- Keep any v2 .dops integrity checks

- [ ] **Step 6: Verify build + tests**

```bash
pnpm build && pnpm test
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(module-registry): remove tool.yaml manifest support"
```

---

## Chunk 2: Type Renames + User-Facing Surface

### Task 5: Rename BaseTool -> BaseModule in SDK

**Files:**

- Rename: `packages/sdk/src/tool.ts` -> `packages/sdk/src/module.ts`
- Modify: `packages/sdk/src/index.ts`
- Modify: `packages/sdk/src/__tests__/tool.test.ts`
- Modify: `packages/sdk/CLAUDE.md`

- [ ] **Step 1: Rename file**

```bash
mv packages/sdk/src/tool.ts packages/sdk/src/module.ts
```

- [ ] **Step 2: Rename types inside module.ts**

In `packages/sdk/src/module.ts`:

- `DevOpsTool` -> `DevOpsModule`
- `BaseTool<TInput>` -> `BaseModule<TInput>`
- `ToolOutput` -> `ModuleOutput`
- `VerificationIssue` and `VerificationResult` — keep as-is (generic names, not tool-specific)

- [ ] **Step 3: Update barrel export**

In `packages/sdk/src/index.ts`, change:

```typescript
export * from "./tool";
```

to:

```typescript
export * from "./module";
```

- [ ] **Step 4: Update SDK tests**

Rename `packages/sdk/src/__tests__/tool.test.ts` to `module.test.ts`.
Update all `BaseTool` -> `BaseModule`, `DevOpsTool` -> `DevOpsModule` references inside.

- [ ] **Step 5: Update SDK CLAUDE.md**

Replace `BaseTool` with `BaseModule`, `DevOpsTool` with `DevOpsModule`.

- [ ] **Step 6: Verify build**

```bash
pnpm --filter @dojops/sdk build
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(sdk): rename BaseTool to BaseModule, DevOpsTool to DevOpsModule"
```

---

### Task 6: Rename types in module-registry

**Files:**

- Modify: `packages/module-registry/src/types.ts`
- Modify: `packages/module-registry/src/registry.ts`
- Modify: `packages/module-registry/src/policy.ts`
- Modify: `packages/module-registry/src/index.ts`

- [ ] **Step 1: Rename types in types.ts**

In `packages/module-registry/src/types.ts`:

- `ToolEntry` -> `ModuleEntry`
- `ToolSource` -> `ModuleSource`
- `ToolMatch` -> `ModuleMatch` (if exists)
- Delete ALL `Plugin*` deprecated aliases (`PluginManifest`, `PluginSource`, `PluginEntry`)
- Delete `ToolManifest` type (was for tool.yaml — already deleted)

- [ ] **Step 2: Rename ToolRegistry -> ModuleRegistry in registry.ts**

In `packages/module-registry/src/registry.ts`:

- `class ToolRegistry` -> `class ModuleRegistry`
- `DevOpsTool` -> `DevOpsModule` in all type annotations
- Delete `getPlugins()` deprecated method
- Rename `getCustomTools()` -> `getCustomModules()` (if it exists)

- [ ] **Step 3: Rename in policy.ts**

In `packages/module-registry/src/policy.ts`:

- `ToolPolicy` -> `ModulePolicy`
- `loadToolPolicy()` -> `loadModulePolicy()`
- `isToolAllowed()` -> `isModuleAllowed()`
- Delete all `Plugin*` deprecated aliases

- [ ] **Step 4: Rename facade functions in index.ts**

In `packages/module-registry/src/index.ts`:

- `createToolRegistry()` -> `createModuleRegistry()`
- `loadBuiltInDopsModules()` -> `loadBuiltInModules()`
- `loadUserDopsModules()` -> `loadUserModules()`
- `discoverUserDopsFiles()` -> `discoverUserModules()` (if exists)
- `CreateToolRegistryOptions` -> `CreateModuleRegistryOptions`
- Update return types to `ModuleRegistry`

- [ ] **Step 5: Verify module-registry build**

```bash
pnpm --filter @dojops/module-registry build
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(module-registry): rename Tool* types to Module*"
```

---

### Task 7: Update all consumers of renamed types

**Files:**

- Modify: `packages/runtime/src/runtime-v2.ts` (DevOpsTool -> DevOpsModule)
- Modify: `packages/api/src/factory.ts`
- Modify: `packages/api/src/routes/plan.ts`
- Modify: `packages/api/src/app.ts`
- Modify: `packages/cli/src/commands/agents.ts`
- Modify: `packages/cli/src/commands/apply.ts`
- Modify: `packages/cli/src/commands/generate.ts`
- Modify: `packages/cli/src/commands/plan.ts`
- Modify: `packages/cli/src/commands/replay-validator.ts`
- Modify: `packages/cli/src/commands/serve.ts`
- Modify: `packages/cli/src/commands/tools.ts`
- Modify: `packages/cli/src/commands/validate.ts`
- Modify: `packages/planner/src/decomposer.ts`
- Modify: `packages/planner/src/executor.ts`
- Modify: `packages/executor/src/safe-executor.ts`
- Modify: All test files that reference renamed types

- [ ] **Step 1: Update runtime-v2.ts**

`DopsRuntimeV2` implements `DevOpsTool` — change to `DevOpsModule`. This class stays as `DopsRuntimeV2` (it's the concrete implementation name, not a "tool" name).

- [ ] **Step 2: Update API package**

In `packages/api/src/factory.ts`:

- `createToolRegistry` -> `createModuleRegistry`
- `ToolRegistry` -> `ModuleRegistry`
- `DevOpsTool` -> `DevOpsModule`

In `packages/api/src/routes/plan.ts` and `app.ts`:

- `DevOpsTool` -> `DevOpsModule`

- [ ] **Step 3: Update CLI commands**

In all CLI command files, update imported types:

- `createToolRegistry` -> `createModuleRegistry`
- `ToolRegistry` -> `ModuleRegistry`
- `ToolEntry` -> `ModuleEntry`
- `DevOpsTool` -> `DevOpsModule`

- [ ] **Step 4: Update planner + executor**

In `packages/planner/src/decomposer.ts` and `executor.ts`:

- `DevOpsTool` -> `DevOpsModule`

In `packages/executor/src/safe-executor.ts`:

- `DevOpsTool` -> `DevOpsModule`

- [ ] **Step 5: Update all test files**

```
packages/executor/src/__tests__/safe-executor.test.ts  # DevOpsTool -> DevOpsModule
packages/planner/src/__tests__/decomposer.test.ts      # DevOpsTool -> DevOpsModule
packages/planner/src/__tests__/executor.test.ts         # DevOpsTool -> DevOpsModule
packages/cli/src/__tests__/commands/replay-validator.test.ts  # import path
```

- [ ] **Step 6: Full build + test**

```bash
pnpm build && pnpm test
```

Expected: All packages compile, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: update all consumers to use Module types"
```

---

### Task 8: User-facing strings + CLI deprecation warning

**Files:**

- Modify: `packages/cli/src/commands/tools.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/help.ts`

- [ ] **Step 1: Add deprecation warning to `dojops tools` alias**

In `packages/cli/src/index.ts`, where the `tools` command alias is defined (~line 121-129), add a deprecation notice that prints when `dojops tools` is invoked:

```typescript
console.warn('Warning: "dojops tools" is deprecated. Use "dojops modules" instead.');
```

- [ ] **Step 2: Update CLI help text**

In `packages/cli/src/help.ts`, ensure all references to "tools" (for DevOps generators) say "modules". Keep "toolchain" references as-is.

- [ ] **Step 3: Update user-facing strings in tools.ts**

In `packages/cli/src/commands/tools.ts`:

- Update output messages: "custom tools" -> "custom modules"
- Update list output headers
- Update error messages

- [ ] **Step 4: Update dojops status output**

If `dojops status` says "tools" for DevOps generators, change to "modules". Keep "System tools" (toolchain binaries) as "tools".

- [ ] **Step 5: Verify CLI commands**

```bash
pnpm --filter @dojops/cli build
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(cli): update user-facing strings from tools to modules"
```

---

## Chunk 3: Documentation + Hub + Verification

### Task 9: Update documentation

**Files:**

- Rename: `docs/tools.md` -> `docs/modules.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/cli-reference.md`
- Modify: `/app/dojops-org/CLAUDE.md` (org root)
- Modify: `/app/dojops-org/dojops-doc/content/` (relevant pages)

- [ ] **Step 1: Rename docs/tools.md to docs/modules.md**

```bash
mv docs/tools.md docs/modules.md
```

Rewrite the file: "DevOps Tools" -> "DevOps Modules" throughout. Remove v1 tool pattern section. Remove tool.yaml references. Add note that v1 is no longer supported.

- [ ] **Step 2: Update README.md**

- "13 built-in DevOps tools" -> "13 built-in DevOps modules"
- "custom tool system" -> "custom module system"
- Update package table: `@dojops/tool-registry` -> `@dojops/module-registry`
- Update dependency flow diagram

- [ ] **Step 3: Update CHANGELOG.md**

Add `[2.0.0]` section at top with breaking changes:

```markdown
## [2.0.0] - 2026-03-11

### Breaking Changes

- **Removed `.dops v1` format support** — all modules must use `dops: v2`
- **Removed `tool.yaml` custom tool manifests** — create custom modules as `.dops v2` files
- **Renamed `@dojops/tool-registry` to `@dojops/module-registry`**
- **Renamed types** — `BaseTool` -> `BaseModule`, `ToolRegistry` -> `ModuleRegistry`, `DevOpsTool` -> `DevOpsModule`
- **Hub rejects v1 uploads** — republish existing v1 packages as v2

### Removed

- `DopsRuntime` v1 class and v1 prompt compiler
- `CustomTool` class and `tool.yaml` manifest discovery
- `TOOL_SPEC_v1.md` specification document
- All deprecated `Plugin*` type aliases
- `parseDopsFile()` and `parseDopsString()` v1-only parsers
```

- [ ] **Step 4: Update org-level CLAUDE.md**

In `/app/dojops-org/CLAUDE.md`:

- Update package table: `@dojops/tool-registry` -> `@dojops/module-registry` with updated description
- Update dependency flow
- Update "13 built-in DevOps tools" -> "13 built-in DevOps modules"
- Update "custom tool system" -> "custom module system"
- Update architecture section

- [ ] **Step 5: Update docs/cli-reference.md**

- Note `dojops tools` is deprecated, use `dojops modules`
- Update command descriptions

- [ ] **Step 6: Update dojops-doc content**

Update relevant MDX files in `/app/dojops-org/dojops-doc/content/` that reference "tools" (meaning DevOps generators) to say "modules".

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "docs: update documentation for v2.0.0 tools-to-modules migration"
```

---

### Task 10: Hub — strip v1 support

**Files:**

- Modify: `/app/dojops-org/dojops-hub/src/lib/dops-schema.ts`
- Modify: `/app/dojops-org/dojops-hub/src/lib/dops-parser.ts`
- Modify: `/app/dojops-org/dojops-hub/src/app/api/packages/route.ts`

- [ ] **Step 1: Read current Hub schema and parser**

Read the full contents of:

- `/app/dojops-org/dojops-hub/src/lib/dops-schema.ts`
- `/app/dojops-org/dojops-hub/src/lib/dops-parser.ts`

Identify all v1-specific schemas, parsing branches, and types.

- [ ] **Step 2: Strip v1 schemas from dops-schema.ts**

Remove all v1 Zod schemas. Keep only v2 schemas. Rename `DopsFrontmatterV2Schema` to `DopsFrontmatterSchema`, `DopsModuleV2` to `DopsModule` (mirror the runtime changes).

- [ ] **Step 3: Simplify dops-parser.ts to v2-only**

Remove the v1 parsing branch. If a `.dops` file has `dops: v1` frontmatter, throw an error: `"v1 .dops format is no longer supported. Please migrate to v2."`.

- [ ] **Step 4: Add v1 rejection on upload endpoint**

In the POST `/api/packages` route, add early validation:

```typescript
if (parsed.frontmatter.dops !== "v2") {
  return NextResponse.json(
    { error: "v1 .dops format is no longer supported. Please migrate to v2." },
    { status: 400 },
  );
}
```

- [ ] **Step 5: Update Hub tests if any reference v1**

Check `/app/dojops-org/dojops-hub/src/__tests__/` or `**/*.test.ts` for v1 references and update.

- [ ] **Step 6: Verify Hub build**

```bash
cd /app/dojops-org/dojops-hub && npm run build
```

- [ ] **Step 7: Commit**

```bash
cd /app/dojops-org/dojops-hub
git add -A
git commit -m "feat: strip v1 .dops support, reject v1 uploads"
```

---

### Task 11: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Full monorepo build**

```bash
cd /app/dojops-org/dojops && pnpm build
```

Expected: All 11 packages compile with zero errors.

- [ ] **Step 2: Full test suite**

```bash
cd /app/dojops-org/dojops && pnpm test
```

Expected: All tests pass (count will be lower than 2649 due to deleted v1 tests).

- [ ] **Step 3: Lint check**

```bash
cd /app/dojops-org/dojops && pnpm lint
```

Expected: No new warnings.

- [ ] **Step 4: Hub build**

```bash
cd /app/dojops-org/dojops-hub && npm run build
```

Expected: Clean build.

- [ ] **Step 5: Verify no stale references**

```bash
cd /app/dojops-org/dojops
# Should return NO results (except CHANGELOG, migration docs, git history)
grep -r "tool-registry" --include="*.ts" --include="*.json" packages/
grep -r "BaseTool" --include="*.ts" packages/
grep -r "DopsRuntime[^V]" --include="*.ts" packages/
grep -r "tool\.yaml" --include="*.ts" packages/
grep -r "PluginManifest\|PluginSource\|PluginEntry\|PluginTool" --include="*.ts" packages/
```

Expected: Zero matches for each grep.

- [ ] **Step 6: Verify CLI works**

```bash
pnpm dojops -- --version
pnpm dojops -- --help
pnpm dojops -- modules list
pnpm dojops -- status
```

Expected: All commands work. `dojops modules list` shows no errors. No references to "tool" (except toolchain).
