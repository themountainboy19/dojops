import { z } from "zod";

export const DockerfileInputSchema = z.object({
  projectPath: z.string().describe("Root directory of the project to generate a Dockerfile for"),
  baseImage: z.string().optional().describe("Base image override (e.g. 'node:20-alpine')"),
  outputPath: z.string().describe("Directory to write the Dockerfile to"),
  existingContent: z
    .string()
    .optional()
    .describe(
      "Existing config file content to update/enhance. If omitted, tool auto-detects existing files.",
    ),
});

export type DockerfileInput = z.infer<typeof DockerfileInputSchema>;

export const DockerStageSchema = z.object({
  name: z.string(),
  from: z.string(),
  commands: z.array(z.string()).min(1),
});

export const DockerfileConfigSchema = z.object({
  stages: z.array(DockerStageSchema).min(1),
  dockerignorePatterns: z.array(z.string()).default([]),
});

export type DockerfileConfig = z.infer<typeof DockerfileConfigSchema>;
export type DockerStage = z.infer<typeof DockerStageSchema>;
