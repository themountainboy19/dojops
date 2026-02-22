# Troubleshooting

Common issues, debugging tips, and solutions for ODA.

---

## Common Issues

### API Key Errors

**Symptom:** `Error: Authentication failed` or `401 Unauthorized`

**Solution:**

1. Verify your API key is set:
   ```bash
   oda auth status
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
   oda config
   ```

### Provider Connection Failed

**Symptom:** `Error: Connection refused` or `ECONNREFUSED`

**Solution:**

- **Ollama:** Ensure the Ollama server is running at `localhost:11434`:
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

---

## Dashboard Issues

### Dashboard Not Loading

**Symptom:** Browser shows blank page or connection refused

**Solutions:**

1. Verify the server is running:
   ```bash
   oda serve
   ```
2. Check the port isn't in use:
   ```bash
   lsof -i :3000
   ```
3. Try a different port:
   ```bash
   oda serve --port=8080
   ```

### Metrics Tabs Show Empty Data

**Symptom:** Overview, Security, or Audit tabs show no data

**Solutions:**

1. Initialize the project (creates `.oda/` directory):
   ```bash
   oda init
   ```
2. Run some operations to generate data:
   ```bash
   oda "Create a Terraform config"
   oda scan
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

ODA gracefully skips unavailable scanners — they're not required for basic functionality.

### Scanner Timeout

**Symptom:** Scan takes very long or times out

**Solution:**

- Use targeted scans instead of full scans:
  ```bash
  oda scan --security    # Faster than --all
  oda scan --deps        # Only dependency audit
  ```
- Large monorepos may take longer due to sub-project discovery

---

## Execution Issues

### Lock File Conflict

**Symptom:** `Error: Operation locked by PID <number>` (exit code 4)

**Solutions:**

1. Wait for the other operation to complete
2. If the process is dead (stale lock), ODA should auto-clean it
3. Manually remove the lock (only if you're sure no operation is running):
   ```bash
   rm .oda/lock.json
   ```

### Audit Chain Integrity Failure

**Symptom:** `oda history verify` reports integrity failure

**Causes:**

- Audit log file was manually edited
- Disk corruption
- File was truncated

**Solution:**

1. Check the specific entry that failed verification
2. If the file was accidentally modified, restore from backup
3. If corruption occurred, the audit log may need to be reset (data loss)

### Resume Not Working

**Symptom:** `oda apply --resume` re-executes completed tasks

**Solution:**

1. Verify the plan exists:
   ```bash
   oda history list
   ```
2. Check that execution logs were saved:
   ```bash
   ls .oda/execution-logs/
   ```
3. Ensure you're resuming the correct plan:
   ```bash
   oda apply --resume <plan-id>
   ```

---

## CLI Issues

### No `.oda/` Project

**Symptom:** `Error: No .oda/ project found` (exit code 5)

**Solution:**

```bash
oda init
```

This creates the project directory structure. Required for planning, execution, history, and metrics features.

### Command Not Found

**Symptom:** `oda: command not found`

**Solution:**

1. Install globally:
   ```bash
   npm i -g @odaops/cli
   ```
2. Or use the in-repo alternative:
   ```bash
   pnpm oda -- "your prompt"
   ```

---

## Debug Mode

Enable verbose output for troubleshooting:

```bash
# Verbose output
oda --verbose "Create a Terraform config"

# Debug-level output with stack traces
oda --debug "Create a Kubernetes deployment"
```

Debug mode shows:

- Provider configuration details
- Agent routing scores
- LLM request/response payloads
- Schema validation details
- Execution pipeline steps

---

## Exit Code Reference

| Code | Meaning            | Common Cause                                                |
| ---- | ------------------ | ----------------------------------------------------------- |
| 0    | Success            | Operation completed normally                                |
| 1    | General error      | LLM error, network issue, unexpected failure                |
| 2    | Validation error   | Schema validation failed (invalid input or LLM output)      |
| 3    | Approval required  | Operation needs user approval (use `--yes` to auto-approve) |
| 4    | Lock conflict      | Another operation is running (PID-based lock)               |
| 5    | No `.oda/` project | Run `oda init` to create the project directory              |
| 6    | HIGH findings      | Security scan found HIGH severity issues                    |
| 7    | CRITICAL findings  | Security scan found CRITICAL severity issues                |

---

## Getting Help

```bash
# Show help
oda --help
oda <command> --help

# System diagnostics
oda doctor

# Inspect configuration
oda config show
oda inspect config
```

If you encounter a bug, please report it at: https://github.com/oda-devops/oda/issues
