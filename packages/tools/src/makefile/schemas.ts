import { z } from "zod";

export const MakefileInputSchema = z.object({
  projectPath: z.string().describe("Root directory of the project to generate a Makefile for"),
  targets: z.string().optional().describe("Description of make targets to include"),
  existingContent: z
    .string()
    .optional()
    .describe(
      "Existing config file content to update/enhance. If omitted, tool auto-detects existing files.",
    ),
});

export type MakefileInput = z.infer<typeof MakefileInputSchema>;

export const MakeTargetSchema = z.object({
  name: z.string(),
  deps: z.array(z.string()).default([]),
  commands: z.array(z.string()).min(1),
  phony: z.boolean().default(true),
  description: z.string().optional(),
});

export const MakefileConfigSchema = z.object({
  variables: z.record(z.string()).default({}),
  defaultTarget: z.string(),
  targets: z.array(MakeTargetSchema).min(1),
});

export type MakefileConfig = z.infer<typeof MakefileConfigSchema>;
export type MakeTarget = z.infer<typeof MakeTargetSchema>;
