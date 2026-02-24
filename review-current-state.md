# DojOps Review: Current State

## Applied: Plugin Version Pinning & Execution Metadata

The following gaps identified in the original review have been **resolved**:

### ✅ RESOLVED: Plugin Versioning Strategy

**Problem:** Plans didn’t store plugin versions. If a plugin was upgraded between plan creation and resume, the new version silently ran.

**Solution implemented:**

- `TaskNode` (`packages/planner/src/types.ts`) extended with optional `toolType`, `pluginVersion`, `pluginHash`, `pluginSource` fields
- `PlanState` (`packages/cli/src/state.ts`) tasks now persist these fields to `.dojops/plans/*.json`
- `plan` command (`packages/cli/src/commands/plan.ts`) enriches tasks with plugin metadata from `ToolRegistry.getToolMetadata()` after decomposition
- `apply --resume` (`packages/cli/src/commands/apply.ts`) validates plugin integrity by comparing stored hashes with current ones, warns on mismatches, and prompts for confirmation

### ✅ RESOLVED: Plugin Metadata in Audit Logs

**Problem:** `SafeExecutor.executeTask()` supported a `metadata` parameter but CLI never passed it.

**Solution implemented:**

- Both `plan --execute` and `apply` now build metadata from plan task fields (`toolType`, `pluginVersion`, `pluginHash`, `pluginSource`) and pass it to `safeExecutor.executeTask()`
- Audit entries are enriched with plugin provenance for every execution

### ✅ RESOLVED: Hash Mismatch Detection on Resume

**Problem:** A tampered or upgraded plugin executed without warning on `apply --resume`.

**Solution implemented:**

- `apply --resume` iterates all plugin tasks, compares stored `pluginHash` with current `PluginTool.source.pluginHash`
- Missing plugins and hash mismatches produce warnings
- Interactive mode prompts user to confirm or abort; `--yes` mode logs warnings and proceeds

### ✅ RESOLVED: Execution Context Storage

**Problem:** Provider and model were not recorded in plans, breaking reproducibility.

**Solution implemented:**

- `PlanState` now includes `executionContext: { provider: string; model?: string }`
- `plan` command stores `provider.name` and `ctx.globalOpts.model` when saving plans

### ✅ RESOLVED: ToolRegistry Metadata Helper

- New `ToolRegistry.getToolMetadata(name)` method returns `{ toolType, pluginVersion?, pluginHash?, pluginSource? }` for any tool
- 4 new tests covering: built-in tools, plugin tools with full metadata, nonexistent tools, and plugin-overrides-built-in

---

## Files Changed

| Package                 | File                         | What Changed                                                                                 |
| ----------------------- | ---------------------------- | -------------------------------------------------------------------------------------------- |
| `@dojops/planner`       | `types.ts`                   | `TaskNode` extended with optional plugin metadata; `TaskGraph` updated to use extended type  |
| `@dojops/cli`           | `state.ts`                   | `PlanState` tasks include plugin fields + new `executionContext` field                       |
| `@dojops/cli`           | `commands/plan.ts`           | Enriches tasks post-decomposition, stores execution context, passes metadata to SafeExecutor |
| `@dojops/cli`           | `commands/apply.ts`          | Plugin integrity validation on resume, metadata passed to SafeExecutor                       |
| `@dojops/tool-registry` | `registry.ts`                | New `getToolMetadata()` method                                                               |
| `@dojops/tool-registry` | `__tests__/registry.test.ts` | 4 new tests for `getToolMetadata()`                                                          |

**Test count:** 810 (was 806). All passing.

---

## Remaining from Original Review (Not Yet Addressed)

### Plugin Isolation Model

- Plugins remain declarative-only (no arbitrary JS). This is by design and should stay enforced.

### Full Deterministic Reproducibility

- Plans now store provider + model. Still missing: temperature, system prompt hash. These are lower priority — provider/model covers the most impactful variance.

### Architectural Evolution Path

- Enterprise features (RBAC, persistent storage, OpenTelemetry) remain in Phase 9 roadmap.
- Plugin spec v1 documentation and freeze still recommended before marketplace.
- Integration tests for plugin upgrade scenarios recommended (the hash mismatch detection provides the foundation).
