import { z } from "zod";

export const SystemdInputSchema = z.object({
  serviceName: z.string().describe("Name of the systemd service (without .service suffix)"),
  execStart: z.string().describe("Command to start the service"),
  user: z.string().default("root"),
  workingDirectory: z.string().optional(),
  description: z.string().optional(),
  outputPath: z.string().describe("Directory to write the service unit file to"),
  environment: z.string().optional(),
  existingContent: z
    .string()
    .optional()
    .describe(
      "Existing config file content to update/enhance. If omitted, tool auto-detects existing files.",
    ),
});

export type SystemdInput = z.infer<typeof SystemdInputSchema>;

export const SystemdUnitSchema = z.object({
  Description: z.string(),
  After: z.array(z.string()).default(["network.target"]),
  Wants: z.array(z.string()).default([]),
});

export const SystemdServiceSchema = z.object({
  Type: z.enum(["simple", "forking", "oneshot", "notify", "idle"]).default("simple"),
  ExecStart: z.string(),
  Restart: z
    .enum(["no", "on-success", "on-failure", "on-abnormal", "on-abort", "always"])
    .default("on-failure"),
  RestartSec: z.string().default("5"),
  User: z.string(),
  WorkingDirectory: z.string().optional(),
  Environment: z.array(z.string()).default([]),
  StandardOutput: z.string().default("journal"),
  StandardError: z.string().default("journal"),
});

export const SystemdInstallSchema = z.object({
  WantedBy: z.array(z.string()).default(["multi-user.target"]),
});

export const SystemdConfigSchema = z.object({
  unit: SystemdUnitSchema,
  service: SystemdServiceSchema,
  install: SystemdInstallSchema,
});

export type SystemdConfig = z.infer<typeof SystemdConfigSchema>;
