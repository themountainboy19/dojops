import { z } from "zod";

export const GitLabCIInputSchema = z.object({
  projectPath: z.string().describe("Root directory of the project to generate GitLab CI for"),
  defaultBranch: z.string().default("main"),
  nodeVersion: z.string().default("20"),
  environment: z.string().optional(),
  existingContent: z
    .string()
    .optional()
    .describe(
      "Existing config file content to update/enhance. If omitted, tool auto-detects existing files.",
    ),
});

export type GitLabCIInput = z.infer<typeof GitLabCIInputSchema>;

export const GitLabJobSchema = z.object({
  stage: z.string(),
  image: z.string().optional(),
  script: z.array(z.string()).min(1),
  artifacts: z
    .object({
      paths: z.array(z.string()).optional(),
      reports: z.record(z.string()).optional(),
      expire_in: z.string().optional(),
    })
    .optional(),
  cache: z
    .object({
      key: z.string().optional(),
      paths: z.array(z.string()),
    })
    .optional(),
  only: z.array(z.string()).optional(),
  allow_failure: z.boolean().optional(),
});

export const GitLabCIConfigSchema = z.object({
  stages: z.array(z.string()).min(1),
  variables: z.record(z.string()).default({}),
  jobs: z.record(GitLabJobSchema),
});

export type GitLabCIConfig = z.infer<typeof GitLabCIConfigSchema>;
export type GitLabJob = z.infer<typeof GitLabJobSchema>;
