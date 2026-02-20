import { z } from "zod";

export const TaskNodeSchema = z.object({
  id: z.string(),
  tool: z.string(),
  description: z.string(),
  dependsOn: z.array(z.string()).default([]),
  input: z.record(z.unknown()).default({}),
});

export const TaskGraphSchema = z.object({
  goal: z.string(),
  tasks: z.array(TaskNodeSchema).min(1),
});

export type TaskNode = z.infer<typeof TaskNodeSchema>;
export type TaskGraph = z.infer<typeof TaskGraphSchema>;

export type TaskStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export interface TaskResult {
  taskId: string;
  status: TaskStatus;
  output?: unknown;
  error?: string;
}

export interface PlannerResult {
  goal: string;
  results: TaskResult[];
  success: boolean;
}
