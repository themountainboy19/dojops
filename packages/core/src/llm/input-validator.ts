import { LLMRequest } from "./provider";

export interface InputValidationResult {
  valid: boolean;
  warning?: string;
}

/**
 * Estimates token count from a character count by dividing by 4.
 * This is a rough heuristic (1 token ~ 4 characters for English text).
 */
function estimateTokens(charCount: number): number {
  return Math.ceil(charCount / 4);
}

/**
 * Validates that an LLM request's input size is within acceptable bounds.
 * Estimates tokens from system prompt + user prompt character counts.
 *
 * @param req - The LLM request to validate
 * @param maxTokens - Maximum estimated token limit (default: 100,000)
 * @returns Validation result with optional warning message
 */
export function validateRequestSize(
  req: LLMRequest,
  maxTokens: number = 100_000,
): InputValidationResult {
  let totalChars = 0;

  if (req.system) {
    totalChars += req.system.length;
  }

  totalChars += req.prompt.length;

  if (req.messages) {
    for (const msg of req.messages) {
      totalChars += msg.content.length;
    }
  }

  const estimatedTokens = estimateTokens(totalChars);

  if (estimatedTokens > maxTokens) {
    return {
      valid: false,
      warning: `Input exceeds estimated token limit (${estimatedTokens.toLocaleString()} estimated vs ${maxTokens.toLocaleString()} max). Consider reducing the input size.`,
    };
  }

  if (estimatedTokens > maxTokens * 0.8) {
    return {
      valid: true,
      warning: `Input approaching token limit (${estimatedTokens.toLocaleString()} estimated, ${maxTokens.toLocaleString()} max). Consider reducing the input size if issues occur.`,
    };
  }

  return { valid: true };
}
