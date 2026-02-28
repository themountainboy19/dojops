# Troubleshooting

Common issues, debugging tips, and solutions for DojOps.

---

## Common Issues

### API Key Errors

**Symptom:** `Error: Authentication failed` or `401 Unauthorized`

**Solution:**

1. Verify your API key is set:
   ```bash
   dojops auth status
   ```
2. Check the correct environment variable is set for your provider:
   ```bash
   echo $OPENAI_API_KEY       # For OpenAI
   echo $ANTHROPIC_API_KEY    # For Anthropic
   echo $DEEPSEEK_API_KEY     # For DeepSeek
   echo $GEMINI_API_KEY       # For Gemini
   ```
3. Re-configure:
   ```bash
   dojops config
   ```

### Provider Connection Failed

**Symptom:** `Error: Connection refused` or `ECONNREFUSED`

**Solution:**

- **Ollama:** Ensure the Ollama server is running (default `localhost:11434`, or your configured `OLLAMA_HOST`):
  ```bash
  ollama serve
  ```
- **Other providers:** Check your internet connection and that the provider's API is accessible
- **Proxy:** If behind a corporate proxy, ensure `HTTPS_PROXY` is set

### Ollama Setup Issues

**Symptom:** `Error: connect ECONNREFUSED 127.0.0.1:11434`

**Solution:**

1. Install Ollama:
   ```bash
   curl -fsSL https://ollama.com/install.sh | sh
   ```
2. Start the server:
   ```bash
   ollama serve
   ```
3. Pull a model:
   ```bash
   ollama pull llama3
   ```
4. Verify:
   ```bash
   curl http://localhost:11434/api/tags
   ```

**Using a remote Ollama server:**

If your Ollama instance is not at `localhost:11434`, configure the host URL:

```bash
# Via interactive config
dojops config

# Via environment variable
export OLLAMA_HOST=https://ollama.corp.internal:8443

# For self-signed TLS certificates
export OLLAMA_TLS_REJECT_UNAUTHORIZED=false
```

Run `dojops status` to verify connectivity — it will show the resolved Ollama URL.

### GitHub Copilot Authentication Issues

**Symptom:** `Error: Not authenticated with GitHub Copilot` or `Error: GitHub token is invalid or expired`

**Solution:**

1. Re-authenticate:
   ```bash
   dojops auth login --provider github-copilot
   ```
2. The Device Flow will open your browser for authorization

**Symptom:** `Error: Access denied. Make sure your GitHub account has an active Copilot subscription.`

**Solution:**

- Verify you have an active Copilot subscription (Pro, Pro+, Business, or Enterprise) at https://github.com/settings/copilot
- If using a GitHub organization, ensure Copilot is enabled for your account

**Symptom:** Token expires frequently / requests fail after ~30 minutes

**Solution:**

- This is expected — Copilot JWTs are short-lived (~30 min). DojOps auto-refreshes them before each API call using your long-lived GitHub OAuth token
- If auto-refresh fails, your GitHub OAuth token may have been revoked. Re-authenticate:
  ```bash
  dojops auth logout --provider github-copilot
  dojops auth login --provider github-copilot
  ```

**CI/CD Usage:**

```bash
# Set a GitHub OAuth token to skip the interactive Device Flow
export GITHUB_COPILOT_TOKEN=ghu_xxx
export DOJOPS_PROVIDER=github-copilot
```

---

## Dashboard Issues

### Dashboard Not Loading

**Symptom:** Browser shows blank page or connection refused

**Solutions:**

1. Verify the server is running:
   ```bash
   dojops serve
   ```
2. Check the port isn't in use:
   ```bash
   lsof -i :3000
   ```
3. Try a different port:
   ```bash
   dojops serve --port=8080
   ```

### Metrics Tabs Show Empty Data

**Symptom:** Overview, Security, or Audit tabs show no data

**Solutions:**

1. Initialize the project (creates `.dojops/` directory):
   ```bash
   dojops init
   ```
2. Run some operations to generate data:
   ```bash
   dojops "Create a Terraform config"
   dojops scan
   ```
3. Check that the server detected the project root (look for "Metrics: enabled" in the startup output)

---

## Scanner Issues

### Scanner Tool Not Found

**Symptom:** `Scanner skipped: trivy not found` or similar

**Solution:** Install the required external tools:

```bash
# trivy
brew install aquasecurity/trivy/trivy    # macOS
sudo apt-get install trivy                # Ubuntu/Debian

# gitleaks
brew install gitleaks                      # macOS
go install github.com/gitleaks/gitleaks/v8@latest  # Go

# checkov
pip install checkov

# hadolint
brew install hadolint                      # macOS
wget -O hadolint https://github.com/hadolint/hadolint/releases/latest/download/hadolint-Linux-x86_64  # Linux

# pip-audit
pip install pip-audit
```

DojOps gracefully skips unavailable scanners — they're not required for basic functionality.

### Scanner Timeout

**Symptom:** Scan takes very long or times out

**Solution:**

- Use targeted scans instead of full scans:
  ```bash
  dojops scan --security    # Faster than --all
  dojops scan --deps        # Only dependency audit
  ```
- Large monorepos may take longer due to sub-project discovery

---

## Execution Issues

### Lock File Conflict

**Symptom:** `Error: Operation locked by PID <number>` (exit code 4)

**Solutions:**

1. Wait for the other operation to complete
2. If the process is dead (stale lock), DojOps should auto-clean it
3. Manually remove the lock (only if you're sure no operation is running):
   ```bash
   rm .dojops/lock.json
   ```

### Audit Chain Integrity Failure

**Symptom:** `dojops history verify` reports integrity failure

**Causes:**

- Audit log file was manually edited
- Disk corruption
- File was truncated

**Solution:**

1. Check the specific entry that failed verification
2. If the file was accidentally modified, restore from backup
3. If corruption occurred, the audit log may need to be reset (data loss)

### Resume Not Working

**Symptom:** `dojops apply --resume` re-executes completed tasks

**Solution:**

1. Verify the plan exists:
   ```bash
   dojops history list
   ```
2. Check that execution logs were saved:
   ```bash
   ls .dojops/execution-logs/
   ```
3. Ensure you're resuming the correct plan:
   ```bash
   dojops apply --resume <plan-id>
   ```

---

## CLI Issues

### No `.dojops/` Project

**Symptom:** `Error: No .dojops/ project found` (exit code 5)

**Solution:**

```bash
dojops init
```

This creates the project directory structure. Required for planning, execution, history, and metrics features.

### Command Not Found

**Symptom:** `dojops: command not found`

**Solution:**

1. Install globally:
   ```bash
   npm i -g @dojops/cli
   ```
2. Or use the in-repo alternative:
   ```bash
   pnpm dojops -- "your prompt"
   ```

---

## Debug Mode

Enable verbose output for troubleshooting:

```bash
# Verbose output
dojops --verbose "Create a Terraform config"

# Debug-level output with stack traces
dojops --debug "Create a Kubernetes deployment"
```

Debug mode shows:

- Provider configuration details
- Agent routing scores
- LLM request/response payloads
- Schema validation details
- Execution pipeline steps

---

## Exit Code Reference

| Code | Meaning               | Common Cause                                                |
| ---- | --------------------- | ----------------------------------------------------------- |
| 0    | Success               | Operation completed normally                                |
| 1    | General error         | LLM error, network issue, unexpected failure                |
| 2    | Validation error      | Schema validation failed (invalid input or LLM output)      |
| 3    | Approval required     | Operation needs user approval (use `--yes` to auto-approve) |
| 4    | Lock conflict         | Another operation is running (PID-based lock)               |
| 5    | No `.dojops/` project | Run `dojops init` to create the project directory           |
| 6    | HIGH findings         | Security scan found HIGH severity issues                    |
| 7    | CRITICAL findings     | Security scan found CRITICAL severity issues                |

---

## Getting Help

```bash
# Show help
dojops --help
dojops <command> --help

# System diagnostics
dojops doctor

# Inspect configuration
dojops config show
dojops inspect config
```

If you encounter a bug, please report it at: https://github.com/dojops/dojops/issues
