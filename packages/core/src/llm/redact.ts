/**
 * Redacts API keys and sensitive tokens from error messages.
 * Applied to all provider error extraction to prevent key leakage.
 */
export function redactSecrets(msg: string): string {
  return msg
    .replace(/sk-[A-Za-z0-9]{20,}/g, "sk-***REDACTED***")
    .replace(/sk-proj-[A-Za-z0-9_-]{20,}/g, "sk-proj-***REDACTED***")
    .replace(/claude-[A-Za-z0-9_-]{20,}/g, "claude-***REDACTED***")
    .replace(/AIza[A-Za-z0-9_-]{30,}/g, "AIza***REDACTED***")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer ***REDACTED***")
    .replace(/Authorization:\s*[^\s]+/gi, "Authorization: ***REDACTED***")
    .replace(/x-api-key:\s*[^\s]+/gi, "x-api-key: ***REDACTED***");
}
