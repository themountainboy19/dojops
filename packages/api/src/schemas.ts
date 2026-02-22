import { z } from "zod";

export const GenerateRequestSchema = z.object({
  prompt: z.string().min(1, "prompt is required"),
  temperature: z.number().min(0).max(2).optional(),
});

export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;

export const PlanRequestSchema = z.object({
  goal: z.string().min(1, "goal is required"),
  execute: z.boolean().optional().default(false),
  autoApprove: z.boolean().optional().default(false),
});

export type PlanRequest = z.infer<typeof PlanRequestSchema>;

export const DebugCIRequestSchema = z.object({
  log: z.string().min(1, "log is required"),
});

export type DebugCIRequest = z.infer<typeof DebugCIRequestSchema>;

export const DiffRequestSchema = z.object({
  diff: z.string().min(1, "diff is required"),
  before: z.string().optional(),
  after: z.string().optional(),
});

export type DiffRequest = z.infer<typeof DiffRequestSchema>;

export const ScanRequestSchema = z.object({
  target: z.string().optional(),
  scanType: z.enum(["all", "security", "deps", "iac"]).optional().default("all"),
});

export type ScanRequest = z.infer<typeof ScanRequestSchema>;

export const ChatRequestSchema = z.object({
  sessionId: z.string().optional(),
  message: z.string().min(1, "message is required"),
  agent: z.string().optional(),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const ChatSessionRequestSchema = z.object({
  name: z.string().optional(),
  mode: z.enum(["INTERACTIVE", "DETERMINISTIC"]).optional().default("INTERACTIVE"),
});

export type ChatSessionRequest = z.infer<typeof ChatSessionRequestSchema>;
