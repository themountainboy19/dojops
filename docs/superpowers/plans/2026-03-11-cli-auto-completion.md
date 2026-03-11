# CLI Auto-Completion Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add shell auto-completion for the dojops CLI (Bash, Zsh, Fish) with hybrid static/dynamic completions.

**Architecture:** Hand-written shell scripts exported as strings from TypeScript files. A `completion` command outputs the scripts, with an `install` subcommand for auto-installation. A hidden `--get-completions` flag provides dynamic value lookups (providers, agents, modules) at tab-completion time.

**Tech Stack:** TypeScript (Vitest tests), Bash/Zsh/Fish shell scripting

**Spec:** `docs/superpowers/specs/2026-03-11-cli-auto-completion-design.md`

---

## File Structure

| File                                                 | Responsibility                                               |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| `packages/cli/src/completions/bash.ts`               | Exports bash completion script as string constant            |
| `packages/cli/src/completions/zsh.ts`                | Exports zsh completion script as string constant             |
| `packages/cli/src/completions/fish.ts`               | Exports fish completion script as string constant            |
| `packages/cli/src/completions/index.ts`              | Re-exports all three scripts                                 |
| `packages/cli/src/commands/completion.ts`            | `completion` command handler: output scripts + install logic |
| `packages/cli/src/completions/get-completions.ts`    | `--get-completions` handler: dynamic value lookups           |
| `packages/cli/src/__tests__/completion.test.ts`      | Tests for completion command + scripts                       |
| `packages/cli/src/__tests__/get-completions.test.ts` | Tests for `--get-completions` handler                        |

Modified files:

| File                         | Change                                                               |
| ---------------------------- | -------------------------------------------------------------------- |
| `packages/cli/src/parser.ts` | Add `"completion"` to `KNOWN_COMMANDS`                               |
| `packages/cli/src/index.ts`  | Register completion subcommands, wire `--get-completions` early exit |
| `packages/cli/src/help.ts`   | Add `completion` to help output                                      |

---

## Chunk 1: Core Infrastructure

### Task 1: `--get-completions` handler

**Files:**

- Create: `packages/cli/src/completions/get-completions.ts`
- Create: `packages/cli/src/__tests__/get-completions.test.ts`

Note: The `--get-completions` wiring into `index.ts` is done in Task 7 alongside the other index.ts changes.

- [ ] **Step 1: Write the failing tests**

Create `packages/cli/src/__tests__/get-completions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleGetCompletions } from "../completions/get-completions";

describe("handleGetCompletions", () => {
  let output: string[];
  let exitCode: number | undefined;

  beforeEach(() => {
    output = [];
    exitCode = undefined;
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      output.push(chunk.toString());
      return true;
    });
    vi.spyOn(process, "exit").mockImplementation((code?: number) => {
      exitCode = code ?? 0;
      throw new Error("process.exit");
    });
  });

  it("returns provider names for 'providers'", () => {
    try {
      handleGetCompletions("providers");
    } catch {
      /* exit mock */
    }
    const result = output.join("");
    expect(result).toContain("openai");
    expect(result).toContain("anthropic");
    expect(result).toContain("ollama");
    expect(result).toContain("deepseek");
    expect(result).toContain("gemini");
    expect(result).toContain("github-copilot");
    expect(exitCode).toBe(0);
  });

  it("returns module names for 'modules'", () => {
    try {
      handleGetCompletions("modules");
    } catch {
      /* exit mock */
    }
    const result = output.join("");
    expect(result).toContain("github-actions");
    expect(result).toContain("terraform");
    expect(result).toContain("k8s");
    expect(exitCode).toBe(0);
  });

  it("returns nothing for unknown type", () => {
    try {
      handleGetCompletions("unknown");
    } catch {
      /* exit mock */
    }
    expect(output.join("")).toBe("");
    expect(exitCode).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @dojops/cli test -- --run src/__tests__/get-completions.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

Create `packages/cli/src/completions/get-completions.ts`:

```typescript
import { readdirSync } from "fs";
import { join, basename, extname } from "path";

const PROVIDERS = ["openai", "anthropic", "ollama", "deepseek", "gemini", "github-copilot"];

/** List built-in .dops module names from the runtime modules/ directory. */
function getBuiltInModuleNames(): string[] {
  try {
    const modulesDir = join(require.resolve("@dojops/runtime/package.json"), "..", "modules");
    return readdirSync(modulesDir)
      .filter((f) => f.endsWith(".dops"))
      .map((f) => basename(f, ".dops"));
  } catch {
    return [];
  }
}

/** List user-installed module names from .dojops/modules/ in cwd. */
function getUserModuleNames(): string[] {
  try {
    const userDir = join(process.cwd(), ".dojops", "modules");
    return readdirSync(userDir)
      .filter((f) => f.endsWith(".dops"))
      .map((f) => basename(f, ".dops"));
  } catch {
    return [];
  }
}

/** List built-in specialist agent names. */
function getAgentNames(): string[] {
  try {
    const { ALL_SPECIALIST_CONFIGS } = require("@dojops/core");
    const names: string[] = ALL_SPECIALIST_CONFIGS.map((c: { name: string }) => c.name);
    // Also check for custom agents in .dojops/agents/
    try {
      const agentsDir = join(process.cwd(), ".dojops", "agents");
      const custom = readdirSync(agentsDir)
        .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
        .map((f) => basename(f, extname(f)));
      names.push(...custom);
    } catch {
      // no custom agents dir
    }
    return [...new Set(names)];
  } catch {
    return [];
  }
}

/**
 * Handle --get-completions <type>.
 * Prints newline-separated values to stdout and exits with code 0.
 */
export function handleGetCompletions(type: string): never {
  let values: string[] = [];

  switch (type) {
    case "providers":
      values = PROVIDERS;
      break;
    case "modules":
      values = [...getBuiltInModuleNames(), ...getUserModuleNames()];
      break;
    case "agents":
      values = getAgentNames();
      break;
    // Unknown type: print nothing, exit 0
  }

  if (values.length > 0) {
    process.stdout.write(values.join("\n") + "\n");
  }
  process.exit(0);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @dojops/cli test -- --run src/__tests__/get-completions.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/completions/get-completions.ts packages/cli/src/__tests__/get-completions.test.ts
git commit -m "feat(cli): add --get-completions handler for dynamic shell completions"
```

---

### Task 2: Bash completion script

**Files:**

- Create: `packages/cli/src/completions/bash.ts`

- [ ] **Step 1: Create the bash completion script**

Create `packages/cli/src/completions/bash.ts`:

```typescript
/**
 * Bash completion script for the dojops CLI.
 * Exported as a string constant — printed by `dojops completion bash`.
 */
export const BASH_COMPLETION_SCRIPT = `#!/usr/bin/env bash
# dojops bash completion — generated by dojops completion bash

_dojops_get_dynamic() {
  local type="$1"
  local result
  result=$(timeout 2 dojops --get-completions "$type" 2>/dev/null) || return
  echo "$result"
}

_dojops() {
  local cur prev words cword
  _init_completion || return

  # Top-level commands
  local commands="plan generate apply validate explain debug analyze review auto inspect agents history modules tools toolchain scan chat check verify provider config auth serve status doctor init clean destroy rollback cron upgrade help completion"

  # Subcommand maps
  local sub_debug="ci"
  local sub_analyze="diff"
  local sub_agents="list info create remove"
  local sub_history="list show verify audit repair"
  local sub_modules="list init validate publish install search dev"
  local sub_tools="list init validate publish install search dev"
  local sub_toolchain="list load install remove clean"
  local sub_config="show get set delete validate reset profile"
  local sub_config_profile="create use delete list"
  local sub_auth="login status logout"
  local sub_serve="credentials"
  local sub_chat="export"
  local sub_inspect="config session"
  local sub_provider="list default add remove switch"
  local sub_cron="add list remove"
  local sub_completion="bash zsh fish install"

  # Global flags
  local global_flags="--verbose --debug --quiet --no-color --raw --non-interactive --dry-run --provider --model --fallback-provider --agent --module --tool --file --profile --temperature --timeout --output --help --version"

  # Command-specific flags
  local flags_plan="--execute --yes --skip-verify"
  local flags_apply="--resume --yes --skip-verify --force --allow-all-paths --install-packages --replay --task --timeout --repair-attempts"
  local flags_scan="--security --deps --iac --sbom --license --fix --compare --target --fail-on"
  local flags_serve="--port --no-auth --tls-cert --tls-key"
  local flags_chat="--session --resume --agent --message"
  local flags_auto="--skip-verify --force --allow-all-paths --repair-attempts --commit"

  # Determine command context
  local cmd="" subcmd="" pos=1
  while [[ $pos -lt $cword ]]; do
    local word="\${words[$pos]}"
    if [[ "$word" != -* ]]; then
      if [[ -z "$cmd" ]]; then
        cmd="$word"
      elif [[ -z "$subcmd" ]]; then
        subcmd="$word"
      fi
    fi
    ((pos++))
  done

  # After --, stop completing flags
  local saw_dashdash=0
  for ((i=1; i < cword; i++)); do
    if [[ "\${words[$i]}" == "--" ]]; then
      saw_dashdash=1
      break
    fi
  done

  # Dynamic value completions for specific flags
  if [[ $saw_dashdash -eq 0 ]]; then
    case "$prev" in
      --provider)
        COMPREPLY=($(compgen -W "$(_dojops_get_dynamic providers)" -- "$cur"))
        return ;;
      --agent)
        COMPREPLY=($(compgen -W "$(_dojops_get_dynamic agents)" -- "$cur"))
        return ;;
      --module|--tool)
        COMPREPLY=($(compgen -W "$(_dojops_get_dynamic modules)" -- "$cur"))
        return ;;
      --output)
        COMPREPLY=($(compgen -W "table json yaml" -- "$cur"))
        return ;;
      --fail-on)
        COMPREPLY=($(compgen -W "CRITICAL HIGH MEDIUM LOW" -- "$cur"))
        return ;;
      --file|-f)
        _filedir
        return ;;
    esac
  fi

  # No command yet — complete commands
  if [[ -z "$cmd" ]]; then
    if [[ "$cur" == -* && $saw_dashdash -eq 0 ]]; then
      COMPREPLY=($(compgen -W "$global_flags" -- "$cur"))
    else
      COMPREPLY=($(compgen -W "$commands" -- "$cur"))
    fi
    return
  fi

  # Have command, no subcommand — complete subcommands or flags
  if [[ -z "$subcmd" ]]; then
    local sub_var="sub_$cmd"
    local subs="\${!sub_var}"
    if [[ -n "$subs" && "$cur" != -* ]]; then
      COMPREPLY=($(compgen -W "$subs" -- "$cur"))
      return
    fi
  fi

  # 3-level: config profile <TAB>
  if [[ "$cmd" == "config" && "$subcmd" == "profile" && "$cur" != -* ]]; then
    COMPREPLY=($(compgen -W "$sub_config_profile" -- "$cur"))
    return
  fi

  # Flag completions
  if [[ "$cur" == -* && $saw_dashdash -eq 0 ]]; then
    local cmd_flags_var="flags_$cmd"
    local cmd_flags="\${!cmd_flags_var}"
    COMPREPLY=($(compgen -W "$cmd_flags $global_flags" -- "$cur"))
  fi
}

complete -F _dojops dojops
`;
```

- [ ] **Step 2: Commit**

```bash
git add packages/cli/src/completions/bash.ts
git commit -m "feat(cli): add bash completion script"
```

---

### Task 3: Zsh completion script

**Files:**

- Create: `packages/cli/src/completions/zsh.ts`

- [ ] **Step 1: Create the zsh completion script**

Create `packages/cli/src/completions/zsh.ts`:

```typescript
/**
 * Zsh completion script for the dojops CLI.
 * Exported as a string constant — printed by `dojops completion zsh`.
 */
export const ZSH_COMPLETION_SCRIPT = `#compdef dojops
# dojops zsh completion — generated by dojops completion zsh

_dojops_get_dynamic() {
  local type="$1"
  local result
  result=$(timeout 2 dojops --get-completions "$type" 2>/dev/null) || return
  echo "$result"
}

_dojops() {
  local -a commands global_flags

  commands=(
    'plan:Decompose goal into task graph'
    'generate:Generate DevOps config'
    'apply:Execute a saved plan'
    'validate:Validate plan against schemas'
    'explain:LLM explains a plan'
    'debug:Debug tools (ci)'
    'analyze:Analysis tools (diff)'
    'review:DevSecOps review with tool validation'
    'auto:Autonomous mode with self-repair'
    'inspect:Inspect config and session state'
    'agents:Manage specialist agents'
    'history:View execution history'
    'modules:Manage DevOps modules'
    'toolchain:Manage system toolchain'
    'scan:Security scan'
    'chat:Interactive AI DevOps session'
    'check:LLM-powered config quality check'
    'verify:Verify a configuration file'
    'provider:Manage LLM providers'
    'config:Configure provider, model, tokens'
    'auth:Authenticate with LLM provider'
    'serve:Start API server + dashboard'
    'status:System health diagnostics'
    'init:Initialize .dojops/ + scan repo context'
    'clean:Remove generated artifacts'
    'rollback:Reverse an applied plan'
    'cron:Manage scheduled jobs'
    'upgrade:Check for and install CLI updates'
    'help:Show help message'
    'completion:Generate shell completion scripts'
    'tools:Manage modules (deprecated alias)'
    'doctor:System diagnostics (alias for status)'
    'destroy:Remove artifacts (deprecated alias for clean)'
  )

  global_flags=(
    '--verbose[Verbose output]'
    '--debug[Debug-level output]'
    '--quiet[Suppress non-essential output]'
    '--no-color[Disable color output]'
    '--raw[Raw output without formatting]'
    '--non-interactive[Disable interactive prompts]'
    '--dry-run[Preview changes without writing files]'
    '--provider=[LLM provider]:provider:->providers'
    '--model=[LLM model override]:model:'
    '--fallback-provider=[Fallback provider chain]:provider:'
    '--agent=[Force specialist agent]:agent:->agents'
    '--module=[Force module]:module:->modules'
    '--tool=[Force module (alias)]:module:->modules'
    '--file=[Read prompt from file]:file:_files'
    '--profile=[Config profile]:profile:'
    '--temperature=[LLM temperature (0-2)]:temperature:'
    '--timeout=[Timeout in milliseconds]:timeout:'
    '--output=[Output format]:format:(table json yaml)'
    '--help[Show help message]'
    '--version[Show version]'
  )

  # Subcommand definitions
  local -a sub_debug sub_analyze sub_agents sub_history sub_modules sub_toolchain
  local -a sub_config sub_config_profile sub_auth sub_serve sub_chat sub_inspect
  local -a sub_provider sub_cron sub_completion

  sub_debug=('ci:Diagnose CI/CD log failures')
  sub_analyze=('diff:Analyze infrastructure diff for risk')
  sub_agents=('list:List agents' 'info:Show agent details' 'create:Create custom agent' 'remove:Remove custom agent')
  sub_history=('list:List execution history' 'show:Show execution detail' 'verify:Verify audit chain' 'audit:View audit entries' 'repair:Repair audit chain')
  sub_modules=('list:List modules' 'init:Scaffold a module' 'validate:Validate module' 'publish:Publish to Hub' 'install:Install from Hub' 'search:Search Hub' 'dev:Live validation')
  sub_toolchain=('list:List toolchain binaries' 'load:Load tool versions' 'install:Install tool' 'remove:Remove tool' 'clean:Clean toolchain cache')
  sub_config=('show:Show config' 'get:Get config value' 'set:Set config value' 'delete:Delete config value' 'validate:Validate config' 'reset:Reset config' 'profile:Manage profiles')
  sub_config_profile=('create:Create profile' 'use:Switch profile' 'delete:Delete profile' 'list:List profiles')
  sub_auth=('login:Authenticate' 'status:Show auth status' 'logout:Remove credentials')
  sub_serve=('credentials:Generate API key')
  sub_chat=('export:Export chat sessions')
  sub_inspect=('config:Inspect configuration' 'session:Inspect session state')
  sub_provider=('list:List providers' 'default:Set default' 'add:Add provider' 'remove:Remove provider' 'switch:Switch provider')
  sub_cron=('add:Add scheduled job' 'list:List jobs' 'remove:Remove job')
  sub_completion=('bash:Generate bash completions' 'zsh:Generate zsh completions' 'fish:Generate fish completions' 'install:Install completions')

  local curcontext="$curcontext" state line
  typeset -A opt_args

  _arguments -C \\
    $global_flags \\
    '1:command:->command' \\
    '2:subcommand:->subcommand' \\
    '3:sub-subcommand:->subsubcommand' \\
    '*::arg:->args'

  case $state in
    command)
      _describe -t commands 'dojops command' commands
      ;;
    subcommand)
      case $line[1] in
        debug) _describe -t sub 'subcommand' sub_debug ;;
        analyze) _describe -t sub 'subcommand' sub_analyze ;;
        agents) _describe -t sub 'subcommand' sub_agents ;;
        history) _describe -t sub 'subcommand' sub_history ;;
        modules|tools) _describe -t sub 'subcommand' sub_modules ;;
        toolchain) _describe -t sub 'subcommand' sub_toolchain ;;
        config) _describe -t sub 'subcommand' sub_config ;;
        auth) _describe -t sub 'subcommand' sub_auth ;;
        serve) _describe -t sub 'subcommand' sub_serve ;;
        chat) _describe -t sub 'subcommand' sub_chat ;;
        inspect) _describe -t sub 'subcommand' sub_inspect ;;
        provider) _describe -t sub 'subcommand' sub_provider ;;
        cron) _describe -t sub 'subcommand' sub_cron ;;
        completion) _describe -t sub 'subcommand' sub_completion ;;
      esac
      ;;
    subsubcommand)
      if [[ "$line[1]" == "config" && "$line[2]" == "profile" ]]; then
        _describe -t sub 'profile subcommand' sub_config_profile
      fi
      ;;
    providers)
      local -a provs
      provs=(\${(f)"$(_dojops_get_dynamic providers)"})
      _describe -t providers 'provider' provs
      ;;
    agents)
      local -a ags
      ags=(\${(f)"$(_dojops_get_dynamic agents)"})
      _describe -t agents 'agent' ags
      ;;
    modules)
      local -a mods
      mods=(\${(f)"$(_dojops_get_dynamic modules)"})
      _describe -t modules 'module' mods
      ;;
  esac
}

compdef _dojops dojops
`;
```

- [ ] **Step 2: Commit**

```bash
git add packages/cli/src/completions/zsh.ts
git commit -m "feat(cli): add zsh completion script"
```

---

### Task 4: Fish completion script

**Files:**

- Create: `packages/cli/src/completions/fish.ts`

- [ ] **Step 1: Create the fish completion script**

Create `packages/cli/src/completions/fish.ts`. The script uses `complete -c dojops` declarations with condition functions for context-aware completions. See the full script in the spec — it covers:

- All 31 top-level commands with descriptions
- All subcommands for every parent command (debug, analyze, agents, history, modules, toolchain, config, auth, serve, chat, inspect, provider, cron, completion)
- 3-level nesting for `config profile` subcommands
- All global flags with descriptions and dynamic completions for `--provider`, `--agent`, `--module`/`--tool`
- Command-specific flags for plan, apply, scan, serve, chat, auto
- Helper functions: `__dojops_no_subcommand`, `__dojops_using_command`, `__dojops_using_subcommand`
- Dynamic completion functions calling `dojops --get-completions`
- File completion for `--file`/`-f`, `--target`, `--tls-cert`, `--tls-key`

```typescript
export const FISH_COMPLETION_SCRIPT = `# dojops fish completion — generated by dojops completion fish

# Helper to check if a subcommand has been given
function __dojops_no_subcommand
    set -l cmd (commandline -opc)
    for word in $cmd[2..-1]
        if not string match -q -- '-*' $word
            return 1
        end
    end
    return 0
end

# Helper to check if a specific command was given
function __dojops_using_command
    set -l cmd (commandline -opc)
    set -l target $argv[1]
    for word in $cmd[2..-1]
        if not string match -q -- '-*' $word
            if test "$word" = "$target"
                return 0
            end
            return 1
        end
    end
    return 1
end

# Helper to check for command + subcommand
function __dojops_using_subcommand
    set -l cmd (commandline -opc)
    set -l target_cmd $argv[1]
    set -l target_sub $argv[2]
    set -l found_cmd 0
    for word in $cmd[2..-1]
        if not string match -q -- '-*' $word
            if test $found_cmd -eq 0
                if test "$word" = "$target_cmd"
                    set found_cmd 1
                else
                    return 1
                end
            else
                if test "$word" = "$target_sub"
                    return 0
                end
                return 1
            end
        end
    end
    return 1
end

# Dynamic completions
function __dojops_complete_providers
    dojops --get-completions providers 2>/dev/null; or true
end
function __dojops_complete_agents
    dojops --get-completions agents 2>/dev/null; or true
end
function __dojops_complete_modules
    dojops --get-completions modules 2>/dev/null; or true
end

# Disable file completions by default
complete -c dojops -f

# Top-level commands
complete -c dojops -n '__dojops_no_subcommand' -a plan -d 'Decompose goal into task graph'
complete -c dojops -n '__dojops_no_subcommand' -a generate -d 'Generate DevOps config'
complete -c dojops -n '__dojops_no_subcommand' -a apply -d 'Execute a saved plan'
complete -c dojops -n '__dojops_no_subcommand' -a validate -d 'Validate plan against schemas'
complete -c dojops -n '__dojops_no_subcommand' -a explain -d 'LLM explains a plan'
complete -c dojops -n '__dojops_no_subcommand' -a debug -d 'Debug tools'
complete -c dojops -n '__dojops_no_subcommand' -a analyze -d 'Analysis tools'
complete -c dojops -n '__dojops_no_subcommand' -a review -d 'DevSecOps review'
complete -c dojops -n '__dojops_no_subcommand' -a auto -d 'Autonomous mode with self-repair'
complete -c dojops -n '__dojops_no_subcommand' -a inspect -d 'Inspect config and session'
complete -c dojops -n '__dojops_no_subcommand' -a agents -d 'Manage specialist agents'
complete -c dojops -n '__dojops_no_subcommand' -a history -d 'View execution history'
complete -c dojops -n '__dojops_no_subcommand' -a modules -d 'Manage DevOps modules'
complete -c dojops -n '__dojops_no_subcommand' -a toolchain -d 'Manage system toolchain'
complete -c dojops -n '__dojops_no_subcommand' -a scan -d 'Security scan'
complete -c dojops -n '__dojops_no_subcommand' -a chat -d 'Interactive AI session'
complete -c dojops -n '__dojops_no_subcommand' -a check -d 'Config quality check'
complete -c dojops -n '__dojops_no_subcommand' -a verify -d 'Verify config file'
complete -c dojops -n '__dojops_no_subcommand' -a provider -d 'Manage LLM providers'
complete -c dojops -n '__dojops_no_subcommand' -a config -d 'Configure settings'
complete -c dojops -n '__dojops_no_subcommand' -a auth -d 'Authenticate'
complete -c dojops -n '__dojops_no_subcommand' -a serve -d 'Start API server'
complete -c dojops -n '__dojops_no_subcommand' -a status -d 'System health diagnostics'
complete -c dojops -n '__dojops_no_subcommand' -a init -d 'Initialize .dojops/'
complete -c dojops -n '__dojops_no_subcommand' -a clean -d 'Remove generated artifacts'
complete -c dojops -n '__dojops_no_subcommand' -a rollback -d 'Reverse an applied plan'
complete -c dojops -n '__dojops_no_subcommand' -a cron -d 'Manage scheduled jobs'
complete -c dojops -n '__dojops_no_subcommand' -a upgrade -d 'Check for CLI updates'
complete -c dojops -n '__dojops_no_subcommand' -a help -d 'Show help'
complete -c dojops -n '__dojops_no_subcommand' -a completion -d 'Generate shell completions'
complete -c dojops -n '__dojops_no_subcommand' -a tools -d 'Manage modules (deprecated)'
complete -c dojops -n '__dojops_no_subcommand' -a doctor -d 'System diagnostics (alias)'
complete -c dojops -n '__dojops_no_subcommand' -a destroy -d 'Remove artifacts (deprecated)'

# Subcommands: debug
complete -c dojops -n '__dojops_using_command debug' -a ci -d 'Diagnose CI/CD failures'
# Subcommands: analyze
complete -c dojops -n '__dojops_using_command analyze' -a diff -d 'Analyze infrastructure diff'
# Subcommands: agents
complete -c dojops -n '__dojops_using_command agents' -a list -d 'List agents'
complete -c dojops -n '__dojops_using_command agents' -a info -d 'Show agent details'
complete -c dojops -n '__dojops_using_command agents' -a create -d 'Create custom agent'
complete -c dojops -n '__dojops_using_command agents' -a remove -d 'Remove custom agent'
# Subcommands: history
complete -c dojops -n '__dojops_using_command history' -a list -d 'List history'
complete -c dojops -n '__dojops_using_command history' -a show -d 'Show detail'
complete -c dojops -n '__dojops_using_command history' -a verify -d 'Verify audit chain'
complete -c dojops -n '__dojops_using_command history' -a audit -d 'View audit entries'
complete -c dojops -n '__dojops_using_command history' -a repair -d 'Repair audit chain'
# Subcommands: modules
complete -c dojops -n '__dojops_using_command modules' -a list -d 'List modules'
complete -c dojops -n '__dojops_using_command modules' -a init -d 'Scaffold module'
complete -c dojops -n '__dojops_using_command modules' -a validate -d 'Validate module'
complete -c dojops -n '__dojops_using_command modules' -a publish -d 'Publish to Hub'
complete -c dojops -n '__dojops_using_command modules' -a install -d 'Install from Hub'
complete -c dojops -n '__dojops_using_command modules' -a search -d 'Search Hub'
complete -c dojops -n '__dojops_using_command modules' -a dev -d 'Live validation'
# Subcommands: tools (deprecated alias for modules)
complete -c dojops -n '__dojops_using_command tools' -a list -d 'List modules'
complete -c dojops -n '__dojops_using_command tools' -a init -d 'Scaffold module'
complete -c dojops -n '__dojops_using_command tools' -a validate -d 'Validate module'
complete -c dojops -n '__dojops_using_command tools' -a publish -d 'Publish to Hub'
complete -c dojops -n '__dojops_using_command tools' -a install -d 'Install from Hub'
complete -c dojops -n '__dojops_using_command tools' -a search -d 'Search Hub'
complete -c dojops -n '__dojops_using_command tools' -a dev -d 'Live validation'
# Subcommands: toolchain
complete -c dojops -n '__dojops_using_command toolchain' -a list -d 'List binaries'
complete -c dojops -n '__dojops_using_command toolchain' -a load -d 'Load versions'
complete -c dojops -n '__dojops_using_command toolchain' -a install -d 'Install tool'
complete -c dojops -n '__dojops_using_command toolchain' -a remove -d 'Remove tool'
complete -c dojops -n '__dojops_using_command toolchain' -a clean -d 'Clean cache'
# Subcommands: config
complete -c dojops -n '__dojops_using_command config' -a show -d 'Show config'
complete -c dojops -n '__dojops_using_command config' -a get -d 'Get value'
complete -c dojops -n '__dojops_using_command config' -a set -d 'Set value'
complete -c dojops -n '__dojops_using_command config' -a delete -d 'Delete value'
complete -c dojops -n '__dojops_using_command config' -a validate -d 'Validate'
complete -c dojops -n '__dojops_using_command config' -a reset -d 'Reset config'
complete -c dojops -n '__dojops_using_command config' -a profile -d 'Manage profiles'
# Subcommands: config profile (3-level)
complete -c dojops -n '__dojops_using_subcommand config profile' -a create -d 'Create profile'
complete -c dojops -n '__dojops_using_subcommand config profile' -a use -d 'Switch profile'
complete -c dojops -n '__dojops_using_subcommand config profile' -a delete -d 'Delete profile'
complete -c dojops -n '__dojops_using_subcommand config profile' -a list -d 'List profiles'
# Subcommands: auth
complete -c dojops -n '__dojops_using_command auth' -a login -d 'Authenticate'
complete -c dojops -n '__dojops_using_command auth' -a status -d 'Auth status'
complete -c dojops -n '__dojops_using_command auth' -a logout -d 'Remove credentials'
# Subcommands: serve
complete -c dojops -n '__dojops_using_command serve' -a credentials -d 'Generate API key'
# Subcommands: chat
complete -c dojops -n '__dojops_using_command chat' -a export -d 'Export sessions'
# Subcommands: inspect
complete -c dojops -n '__dojops_using_command inspect' -a config -d 'Inspect config'
complete -c dojops -n '__dojops_using_command inspect' -a session -d 'Inspect session'
# Subcommands: provider
complete -c dojops -n '__dojops_using_command provider' -a list -d 'List providers'
complete -c dojops -n '__dojops_using_command provider' -a default -d 'Set default'
complete -c dojops -n '__dojops_using_command provider' -a add -d 'Add provider'
complete -c dojops -n '__dojops_using_command provider' -a remove -d 'Remove provider'
complete -c dojops -n '__dojops_using_command provider' -a switch -d 'Switch provider'
# Subcommands: cron
complete -c dojops -n '__dojops_using_command cron' -a add -d 'Add job'
complete -c dojops -n '__dojops_using_command cron' -a list -d 'List jobs'
complete -c dojops -n '__dojops_using_command cron' -a remove -d 'Remove job'
# Subcommands: completion
complete -c dojops -n '__dojops_using_command completion' -a bash -d 'Bash completions'
complete -c dojops -n '__dojops_using_command completion' -a zsh -d 'Zsh completions'
complete -c dojops -n '__dojops_using_command completion' -a fish -d 'Fish completions'
complete -c dojops -n '__dojops_using_command completion' -a install -d 'Install completions'

# Global flags
complete -c dojops -l verbose -d 'Verbose output'
complete -c dojops -l debug -d 'Debug-level output'
complete -c dojops -l quiet -d 'Suppress non-essential output'
complete -c dojops -l no-color -d 'Disable color output'
complete -c dojops -l raw -d 'Raw output'
complete -c dojops -l non-interactive -d 'Disable interactive prompts'
complete -c dojops -l dry-run -d 'Preview changes'
complete -c dojops -l provider -d 'LLM provider' -x -a '(__dojops_complete_providers)'
complete -c dojops -l model -d 'LLM model' -x
complete -c dojops -l fallback-provider -d 'Fallback provider chain' -x
complete -c dojops -l agent -d 'Force specialist agent' -x -a '(__dojops_complete_agents)'
complete -c dojops -l module -d 'Force module' -x -a '(__dojops_complete_modules)'
complete -c dojops -l tool -d 'Force module (alias)' -x -a '(__dojops_complete_modules)'
complete -c dojops -l file -s f -d 'Read prompt from file' -r -F
complete -c dojops -l profile -d 'Config profile' -x
complete -c dojops -l temperature -d 'LLM temperature (0-2)' -x
complete -c dojops -l timeout -d 'Timeout in ms' -x
complete -c dojops -l output -d 'Output format' -x -a 'table json yaml'
complete -c dojops -s h -l help -d 'Show help'
complete -c dojops -s V -l version -d 'Show version'

# Command-specific flags: plan
complete -c dojops -n '__dojops_using_command plan' -l execute -d 'Execute with approval'
complete -c dojops -n '__dojops_using_command plan' -l yes -d 'Auto-approve'
complete -c dojops -n '__dojops_using_command plan' -l skip-verify -d 'Skip validation'
# Command-specific flags: apply
complete -c dojops -n '__dojops_using_command apply' -l resume -d 'Resume partial plan'
complete -c dojops -n '__dojops_using_command apply' -l yes -d 'Auto-approve'
complete -c dojops -n '__dojops_using_command apply' -l skip-verify -d 'Skip validation'
complete -c dojops -n '__dojops_using_command apply' -l force -d 'Skip git dirty check'
complete -c dojops -n '__dojops_using_command apply' -l allow-all-paths -d 'Bypass write allowlist'
complete -c dojops -n '__dojops_using_command apply' -l install-packages -d 'Run pkg install after'
complete -c dojops -n '__dojops_using_command apply' -l replay -d 'Deterministic mode'
complete -c dojops -n '__dojops_using_command apply' -l task -d 'Execute single task' -x
complete -c dojops -n '__dojops_using_command apply' -l timeout -d 'Per-task timeout (sec)' -x
complete -c dojops -n '__dojops_using_command apply' -l repair-attempts -d 'Max self-repair attempts' -x
# Command-specific flags: scan
complete -c dojops -n '__dojops_using_command scan' -l security -d 'Security scans only'
complete -c dojops -n '__dojops_using_command scan' -l deps -d 'Dependency scans only'
complete -c dojops -n '__dojops_using_command scan' -l iac -d 'IaC scans only'
complete -c dojops -n '__dojops_using_command scan' -l sbom -d 'Software Bill of Materials'
complete -c dojops -n '__dojops_using_command scan' -l license -d 'License compliance'
complete -c dojops -n '__dojops_using_command scan' -l fix -d 'Auto-remediate findings'
complete -c dojops -n '__dojops_using_command scan' -l compare -d 'Compare with previous'
complete -c dojops -n '__dojops_using_command scan' -l target -d 'Scan target dir' -r -F
complete -c dojops -n '__dojops_using_command scan' -l fail-on -d 'Exit code threshold' -x -a 'CRITICAL HIGH MEDIUM LOW'
# Command-specific flags: serve
complete -c dojops -n '__dojops_using_command serve' -l port -d 'Server port' -x
complete -c dojops -n '__dojops_using_command serve' -l no-auth -d 'Disable API key auth'
complete -c dojops -n '__dojops_using_command serve' -l tls-cert -d 'TLS certificate' -r -F
complete -c dojops -n '__dojops_using_command serve' -l tls-key -d 'TLS key' -r -F
# Command-specific flags: chat
complete -c dojops -n '__dojops_using_command chat' -l session -d 'Named session' -x
complete -c dojops -n '__dojops_using_command chat' -l resume -d 'Resume recent session'
complete -c dojops -n '__dojops_using_command chat' -l agent -d 'Pin to agent' -x -a '(__dojops_complete_agents)'
complete -c dojops -n '__dojops_using_command chat' -s m -l message -d 'Single message' -x
# Command-specific flags: auto
complete -c dojops -n '__dojops_using_command auto' -l skip-verify -d 'Skip validation'
complete -c dojops -n '__dojops_using_command auto' -l force -d 'Skip git dirty check'
complete -c dojops -n '__dojops_using_command auto' -l allow-all-paths -d 'Bypass write allowlist'
complete -c dojops -n '__dojops_using_command auto' -l repair-attempts -d 'Max repair attempts' -x
complete -c dojops -n '__dojops_using_command auto' -l commit -d 'Auto-commit changes'
`;
```

- [ ] **Step 2: Commit**

```bash
git add packages/cli/src/completions/fish.ts
git commit -m "feat(cli): add fish completion script"
```

---

### Task 5: Completions index barrel

**Files:**

- Create: `packages/cli/src/completions/index.ts`

- [ ] **Step 1: Create the barrel export**

Create `packages/cli/src/completions/index.ts`:

```typescript
export { BASH_COMPLETION_SCRIPT } from "./bash";
export { ZSH_COMPLETION_SCRIPT } from "./zsh";
export { FISH_COMPLETION_SCRIPT } from "./fish";
export { handleGetCompletions } from "./get-completions";
```

- [ ] **Step 2: Commit**

```bash
git add packages/cli/src/completions/index.ts
git commit -m "feat(cli): add completions barrel export"
```

---

## Chunk 2: Command + Integration

### Task 6: `completion` command handler

**Files:**

- Create: `packages/cli/src/commands/completion.ts`
- Create: `packages/cli/src/__tests__/commands/completion.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/cli/src/__tests__/commands/completion.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  completionBashCommand,
  completionZshCommand,
  completionFishCommand,
  completionUsageCommand,
} from "../../commands/completion";
import { CLIContext, DEFAULT_GLOBAL_OPTIONS } from "../../types";

function makeMockCtx(): CLIContext {
  return {
    globalOpts: { ...DEFAULT_GLOBAL_OPTIONS },
    config: {} as CLIContext["config"],
    cwd: "/tmp/test",
    getProvider: () => {
      throw new Error("no provider");
    },
  };
}

describe("completion command", () => {
  let consoleOutput: string[];

  beforeEach(() => {
    consoleOutput = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(" "));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("bash outputs script with _dojops function", async () => {
    await completionBashCommand([], makeMockCtx());
    const output = consoleOutput.join("\n");
    expect(output).toContain("_dojops");
    expect(output).toContain("complete -F _dojops dojops");
  });

  it("zsh outputs script with compdef", async () => {
    await completionZshCommand([], makeMockCtx());
    const output = consoleOutput.join("\n");
    expect(output).toContain("compdef _dojops dojops");
  });

  it("fish outputs script with complete -c dojops", async () => {
    await completionFishCommand([], makeMockCtx());
    const output = consoleOutput.join("\n");
    expect(output).toContain("complete -c dojops");
  });

  it("usage command prints usage to stderr and exits 2", async () => {
    const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: number) => {
      throw new Error(`exit:${code}`);
    });

    await expect(completionUsageCommand([], makeMockCtx())).rejects.toThrow("exit:2");
    expect(stderrSpy).toHaveBeenCalled();
    const errOutput = stderrSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(errOutput).toContain("completion");

    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it("install command writes bash completion to correct path", async () => {
    const { mkdirSync, writeFileSync, existsSync } = await import("fs");
    vi.mock("fs", async (importOriginal) => {
      const actual = await importOriginal<typeof import("fs")>();
      return {
        ...actual,
        mkdirSync: vi.fn(),
        writeFileSync: vi.fn(),
        existsSync: vi.fn().mockReturnValue(false),
      };
    });

    const { completionInstallCommand: installCmd } = await import("../../commands/completion");
    await installCmd(["bash"], makeMockCtx());

    const output = consoleOutput.join("\n");
    expect(output).toContain("Installed");
    expect(output).toContain("bash");
  });

  it("install command exits non-zero for unknown shell", async () => {
    const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: number) => {
      throw new Error(`exit:${code}`);
    });

    const { completionInstallCommand: installCmd } = await import("../../commands/completion");
    await expect(installCmd(["powershell"], makeMockCtx())).rejects.toThrow("exit:2");
    expect(stderrSpy).toHaveBeenCalled();

    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @dojops/cli test -- --run src/__tests__/commands/completion.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the completion command handler**

Create `packages/cli/src/commands/completion.ts`:

```typescript
import { CommandHandler } from "../types";
import {
  BASH_COMPLETION_SCRIPT,
  ZSH_COMPLETION_SCRIPT,
  FISH_COMPLETION_SCRIPT,
} from "../completions";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";
import { homedir } from "os";
import pc from "picocolors";

export const completionBashCommand: CommandHandler = async () => {
  console.log(BASH_COMPLETION_SCRIPT);
};

export const completionZshCommand: CommandHandler = async () => {
  console.log(ZSH_COMPLETION_SCRIPT);
};

export const completionFishCommand: CommandHandler = async () => {
  console.log(FISH_COMPLETION_SCRIPT);
};

export const completionUsageCommand: CommandHandler = async () => {
  console.error("Usage: dojops completion <bash|zsh|fish>");
  console.error("       dojops completion install [bash|zsh|fish]");
  console.error("");
  console.error("Generate shell completion scripts for dojops.");
  process.exit(2);
};

/** Detect the user's default shell from $SHELL. */
function detectShell(): string | null {
  const shell = process.env.SHELL;
  if (!shell) return null;
  const base = shell.split("/").pop() ?? "";
  if (["bash", "zsh", "fish"].includes(base)) return base;
  return null;
}

/** Get brew prefix on macOS, or null. */
function getBrewPrefix(): string | null {
  try {
    return execFileSync("brew", ["--prefix"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function installBash(): string {
  const brewPrefix = getBrewPrefix();
  let target: string;
  if (brewPrefix && process.platform === "darwin") {
    target = join(brewPrefix, "etc", "bash_completion.d", "dojops");
  } else {
    target = join(homedir(), ".bash_completion.d", "dojops");
  }
  const dir = join(target, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(target, BASH_COMPLETION_SCRIPT, "utf8");
  return target;
}

function installZsh(): { target: string; needsFpath: boolean } {
  const dir = join(homedir(), ".zsh", "completions");
  const target = join(dir, "_dojops");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(target, ZSH_COMPLETION_SCRIPT, "utf8");
  const fpath = process.env.FPATH ?? "";
  const needsFpath = !fpath.split(":").includes(dir);
  return { target, needsFpath };
}

function installFish(): string {
  const dir = join(homedir(), ".config", "fish", "completions");
  const target = join(dir, "dojops.fish");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(target, FISH_COMPLETION_SCRIPT, "utf8");
  return target;
}

export const completionInstallCommand: CommandHandler = async (args) => {
  const shell = args[0] ?? detectShell();
  if (!shell) {
    console.error("Could not detect shell. Specify one: dojops completion install <bash|zsh|fish>");
    process.exit(2);
  }

  const verb = (target: string) => (existsSync(target) ? "Updated" : "Installed");

  switch (shell) {
    case "bash": {
      const target = installBash();
      console.log(pc.green(`✔ ${verb(target)} dojops completions for bash`));
      console.log("  → " + target);
      console.log(pc.dim("  Restart your shell or run: source ~/.bashrc"));
      break;
    }
    case "zsh": {
      const dir = join(homedir(), ".zsh", "completions");
      const target = join(dir, "_dojops");
      const action = verb(target);
      const { target: writtenTarget, needsFpath } = installZsh();
      console.log(pc.green(`✔ ${action} dojops completions for zsh`));
      console.log("  → " + writtenTarget);
      if (needsFpath) {
        console.log(
          pc.yellow(
            "  Add to ~/.zshrc: fpath=(~/.zsh/completions $fpath); autoload -Uz compinit && compinit",
          ),
        );
      } else {
        console.log(pc.dim("  Restart your shell or run: exec zsh"));
      }
      break;
    }
    case "fish": {
      const dir = join(homedir(), ".config", "fish", "completions");
      const target = join(dir, "dojops.fish");
      const action = verb(target);
      const writtenTarget = installFish();
      console.log(pc.green(`✔ ${action} dojops completions for fish`));
      console.log("  → " + writtenTarget);
      console.log(pc.dim("  Completions will be available in new shell sessions."));
      break;
    }
    default:
      console.error('Unknown shell: "' + shell + '". Supported: bash, zsh, fish');
      process.exit(2);
  }
};
```

Note: Uses `execFileSync` (not `execSync`) for the `brew --prefix` call — safe against command injection.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @dojops/cli test -- --run src/__tests__/commands/completion.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/completion.ts packages/cli/src/__tests__/commands/completion.test.ts
git commit -m "feat(cli): add completion command with install support"
```

---

### Task 7: Register completion command + wire --get-completions

**Files:**

- Modify: `packages/cli/src/parser.ts:160` (add `"completion"` to KNOWN_COMMANDS)
- Modify: `packages/cli/src/index.ts` (register subcommands, wire early exit)
- Modify: `packages/cli/src/help.ts` (add completion to help output)

- [ ] **Step 1: Add `completion` to KNOWN_COMMANDS in parser.ts**

In `packages/cli/src/parser.ts`, add `"completion"` to the `KNOWN_COMMANDS` set (after `"auto"` at line 193):

```typescript
    "completion",
```

Also add `"bash"`, `"zsh"`, `"fish"` to `KNOWN_SUBCOMMANDS` set if not already present.

- [ ] **Step 2: Register completion subcommands in index.ts**

In `packages/cli/src/index.ts`, add imports after the existing command imports (around line 66):

```typescript
import {
  completionBashCommand,
  completionZshCommand,
  completionFishCommand,
  completionInstallCommand,
  completionUsageCommand,
} from "./commands/completion";
```

After the toolchain subcommand registrations (around line 139), add:

```typescript
// Nested: completion <sub> (shell completion scripts)
registerCommand("completion", completionUsageCommand);
registerSubcommand("completion", "bash", completionBashCommand);
registerSubcommand("completion", "zsh", completionZshCommand);
registerSubcommand("completion", "fish", completionFishCommand);
registerSubcommand("completion", "install", completionInstallCommand);
```

Add `"completion"` to the `QUIET_COMMANDS` set (around line 240).

- [ ] **Step 3: Wire --get-completions early exit in index.ts**

In `packages/cli/src/index.ts`, in the `handleEarlyExits` function (line 155-166), add before `return false`:

```typescript
// --get-completions <type> — hidden flag for shell completion scripts
const gcIdx = rawArgs.indexOf("--get-completions");
if (gcIdx !== -1 && gcIdx + 1 < rawArgs.length) {
  const { handleGetCompletions } = require("./completions/get-completions");
  handleGetCompletions(rawArgs[gcIdx + 1]);
}
```

- [ ] **Step 4: Add completion to help.ts**

In `packages/cli/src/help.ts`, in the `printHelp()` function, add after the `upgrade` line (around line 50):

```typescript
console.log(`  ${pc.cyan("completion")}         Generate shell completion scripts`);
```

- [ ] **Step 5: Build and verify**

Run: `pnpm --filter @dojops/cli build`
Expected: BUILD successful

- [ ] **Step 6: Run all CLI tests**

Run: `pnpm --filter @dojops/cli test`
Expected: ALL tests pass (existing + new)

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/parser.ts packages/cli/src/index.ts packages/cli/src/help.ts
git commit -m "feat(cli): register completion command, wire --get-completions"
```

---

### Task 8: Documentation updates

**Files:**

- Modify: `docs/cli-reference.md`
- Modify: `README.md`
- Modify: `dojops-doc/content/getting-started/installation.mdx` (in `/app/dojops-org/dojops-doc/`)

- [ ] **Step 1: Add completion section to cli-reference.md**

In `docs/cli-reference.md`, add a new section for the `completion` command:

```markdown
### `dojops completion`

Generate shell completion scripts.

\`\`\`bash

# Print completion script to stdout

dojops completion bash
dojops completion zsh
dojops completion fish

# Auto-install completions

dojops completion install # auto-detect shell
dojops completion install bash # specific shell
dojops completion install zsh
dojops completion install fish
\`\`\`

**Quick setup:**

\`\`\`bash

# Bash

dojops completion install bash

# or manually: dojops completion bash > ~/.bash_completion.d/dojops

# Zsh

dojops completion install zsh

# or manually: dojops completion zsh > ~/.zsh/completions/\_dojops

# Fish

dojops completion install fish

# or manually: dojops completion fish > ~/.config/fish/completions/dojops.fish

\`\`\`
```

- [ ] **Step 2: Add shell completion note to README.md**

In the Quick Start or Installation section of `README.md`, add after the install commands:

```markdown
### Shell Completion

\`\`\`bash
dojops completion install # auto-detects your shell
\`\`\`

Or generate manually: `dojops completion bash|zsh|fish`
```

- [ ] **Step 3: Add shell completion section to dojops-doc installation page**

In `/app/dojops-org/dojops-doc/content/getting-started/installation.mdx`, add a "Shell Completion" section after the installation methods:

```markdown
## Shell Completion

Enable tab completion for dojops commands, flags, and values:

\`\`\`bash

# Auto-detect and install

dojops completion install

# Or for a specific shell

dojops completion install bash
dojops completion install zsh
dojops completion install fish
\`\`\`

You can also pipe the script manually:

\`\`\`bash

# Bash

dojops completion bash > ~/.bash_completion.d/dojops

# Zsh

dojops completion zsh > ~/.zsh/completions/\_dojops

# Fish

dojops completion fish > ~/.config/fish/completions/dojops.fish
\`\`\`
```

- [ ] **Step 4: Commit**

```bash
git add docs/cli-reference.md README.md
cd /app/dojops-org/dojops-doc && git add content/getting-started/installation.mdx && git commit -m "docs: add shell completion setup instructions"
cd /app/dojops-org/dojops && git commit -m "docs: add shell completion setup instructions"
```

---

### Task 9: Full verification

- [ ] **Step 1: Build all packages**

Run: `pnpm build`
Expected: All 11 packages build successfully

- [ ] **Step 2: Run all tests**

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: No errors

- [ ] **Step 4: Manual smoke test**

Run: `pnpm dojops -- completion bash | head -5`
Expected: First lines of bash completion script

Run: `pnpm dojops -- --get-completions providers`
Expected: `openai\nanthropic\nollama\ndeepseek\ngemini\ngithub-copilot`

Run: `pnpm dojops -- --get-completions modules`
Expected: Module names (github-actions, terraform, k8s, etc.)

Run: `pnpm dojops -- completion`
Expected: Usage message, exit code 2
