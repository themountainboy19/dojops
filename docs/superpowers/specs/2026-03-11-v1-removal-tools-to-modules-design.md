# Design: v1 Removal + tools-to-modules Full Migration

**Date:** 2026-03-11
**Version target:** v2.0.0 (breaking)

---

## Summary

Remove `.dops v1` format support, remove `tool.yaml` custom tool manifests, and rename all "tool" terminology to "module" across packages, types, and documentation. Hub strips v1 support in parallel.

---

## Scope

### Three pillars

| Pillar                | Removed                                                                                 | Replacement                                                              |
| --------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `.dops v1` format     | `DopsRuntime`, v1 parsers, v1 schemas, v1 prompt compiler                               | Only `DopsRuntimeV2` + v2 parsers remain                                 |
| `tool.yaml` manifests | `CustomTool`, `tool-loader.ts`, manifest schemas, `TOOL_SPEC_v1.md`                     | Users create `.dops v2` files                                            |
| "tool" terminology    | `@dojops/tool-registry`, `BaseTool`, `ToolRegistry`, `ToolEntry`, 42 deprecated aliases | `@dojops/module-registry`, `BaseModule`, `ModuleRegistry`, `ModuleEntry` |

### Preserved as "tool"

- `dojops toolchain` (system binaries: terraform, kubectl, etc.)
- `toolchain-sandbox.ts`, `TOOLCHAIN_DIR` — manage actual tool binaries

---

## Package Rename

```
@dojops/tool-registry  ->  @dojops/module-registry
packages/tool-registry/ -> packages/module-registry/
```

Hard rename. No backward-compat re-export package.

**Dependency chain:** All consumer packages update `package.json` + imports.
**Path aliases:** Root `tsconfig.json` updated.

---

## Type Renames

| Old                        | New                        | Package                   |
| -------------------------- | -------------------------- | ------------------------- |
| `BaseTool<T>`              | `BaseModule<T>`            | `@dojops/sdk`             |
| `ToolRegistry`             | `ModuleRegistry`           | `@dojops/module-registry` |
| `ToolEntry`                | `ModuleEntry`              | `@dojops/module-registry` |
| `ToolSource`               | `ModuleSource`             | `@dojops/module-registry` |
| `ToolMatch`                | `ModuleMatch`              | `@dojops/module-registry` |
| `ToolPolicy`               | `ModulePolicy`             | `@dojops/module-registry` |
| `DevOpsTool`               | `DevOpsModule`             | `@dojops/runtime`         |
| `discoverUserDopsFiles()`  | `discoverUserModules()`    | `@dojops/module-registry` |
| `loadBuiltInDopsModules()` | `loadBuiltInModules()`     | `@dojops/module-registry` |
| `loadUserDopsModules()`    | `loadUserModules()`        | `@dojops/module-registry` |
| `createToolRegistry()`     | `createModuleRegistry()`   | `@dojops/module-registry` |
| `DopsModuleV2`             | `DopsModule`               | `@dojops/runtime`         |
| `isV2Module()`             | deleted (no longer needed) | `@dojops/runtime`         |

**Deleted entirely:**

- `ToolManifest` (was tool.yaml)
- `CustomTool` (was tool.yaml adapter)
- `discoverTools()` (was tool.yaml discovery)
- All 42 `Plugin*` deprecated aliases

---

## Files Deleted

| File                                                                     | Reason                   |
| ------------------------------------------------------------------------ | ------------------------ |
| `packages/runtime/src/runtime.ts`                                        | v1 `DopsRuntime` class   |
| `packages/runtime/src/prompt-compiler.ts`                                | v1 prompt compilation    |
| `packages/runtime/src/structural-validator.ts`                           | v1 structural validation |
| `packages/runtime/src/__tests__/runtime.test.ts`                         | v1 runtime tests         |
| `packages/runtime/src/__tests__/deep-integration.test.ts`                | v1 integration tests     |
| `packages/tool-registry/src/custom-tool.ts`                              | tool.yaml adapter        |
| `packages/tool-registry/src/tool-loader.ts`                              | tool.yaml discovery      |
| `packages/tool-registry/src/manifest-schema.ts`                          | tool.yaml schemas        |
| `packages/tool-registry/src/__tests__/tool-loader.test.ts`               | tool.yaml tests          |
| `packages/tool-registry/src/__tests__/external-tool-integration.test.ts` | CustomTool tests         |
| `packages/tool-registry/src/__tests__/tool-upgrade.test.ts`              | manifest upgrade tests   |
| `docs/TOOL_SPEC_v1.md`                                                   | frozen v1 spec           |

---

## Files Heavily Modified

| File                                            | What changes                                                                                               |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/runtime/src/parser.ts`                | Remove `parseDopsFile()`, `parseDopsString()`, v1 branch in `parseDopsStringAny()`, `validateDopsModule()` |
| `packages/runtime/src/spec.ts`                  | Remove all v1 schemas, `DopsModule` interface. `DopsModuleV2` becomes `DopsModule`.                        |
| `packages/runtime/src/__tests__/parser.test.ts` | Remove v1 test cases                                                                                       |
| `packages/module-registry/src/types.ts`         | `ToolEntry` -> `ModuleEntry`, `ToolSource` -> `ModuleSource`, delete `Plugin*` aliases                     |
| `packages/module-registry/src/index.ts`         | Remove v1 routing, CustomTool imports, tool.yaml discovery                                                 |
| `packages/module-registry/src/registry.ts`      | `ToolRegistry` -> `ModuleRegistry`                                                                         |
| `packages/module-registry/src/policy.ts`        | `ToolPolicy` -> `ModulePolicy`, delete `Plugin*` aliases                                                   |
| `packages/sdk/src/tool.ts`                      | `BaseTool` -> `BaseModule`, rename file to `module.ts`                                                     |

---

## Hub Changes (`dojops-hub/`)

| File                     | Change                                                            |
| ------------------------ | ----------------------------------------------------------------- |
| `src/lib/dops-schema.ts` | Remove v1 Zod schemas, keep v2 only                               |
| `src/lib/dops-parser.ts` | Remove v1 parsing branch, v2 only                                 |
| `POST /api/packages`     | Reject v1 uploads: `400 "v1 .dops format is no longer supported"` |

No migration script for existing v1 Hub packages.

---

## Documentation Updates

| File                      | Change                                               |
| ------------------------- | ---------------------------------------------------- |
| `CHANGELOG.md`            | v2.0.0 breaking changes section                      |
| `docs/tools.md`           | Rename to `docs/modules.md`, rewrite                 |
| `README.md`               | "13 built-in DevOps modules", "custom module system" |
| `CLAUDE.md` (org root)    | Update package table, dependency flow, architecture  |
| `docs/cli-reference.md`   | Update command descriptions                          |
| `dojops-doc/` content     | Update across all relevant pages                     |
| Package `CLAUDE.md` files | Update for renamed types/package                     |

**CLI:** `dojops tools` alias prints deprecation warning, routes to `dojops modules`.

---

## Execution Phases

1. **Package rename** — directory + package.json + workspace config + all imports
2. **Delete v1 code** — runtime.ts, prompt-compiler.ts, structural-validator.ts, v1 tests
3. **Delete tool.yaml code** — custom-tool.ts, tool-loader.ts, manifest-schema.ts, tool.yaml tests
4. **Type renames** — BaseTool->BaseModule, ToolRegistry->ModuleRegistry, etc.
5. **User-facing surface** — CLI strings, deprecation warning on `dojops tools`, docs
6. **Hub** — strip v1 schemas/parser, reject v1 uploads
7. **Verify** — build, test, lint all packages + Hub

Each phase = separate commit. Revertable independently.

---

## Risk Mitigation

- Each phase is a separate commit for clean rollback
- Build + test after each phase to catch breakage early
- v2.0.0 CHANGELOG documents all breaking changes
- Users get clear error messages when attempting v1 usage
