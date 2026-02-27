import { z } from "zod";

export const DockerComposeInputSchema = z.object({
  projectPath: z.string().describe("Root directory of the project to generate Docker Compose for"),
  services: z
    .string()
    .describe("Description of services to include (e.g. 'web app with postgres and redis')"),
  networkMode: z.enum(["bridge", "host", "none"]).default("bridge"),
  environment: z.string().optional(),
  existingContent: z
    .string()
    .optional()
    .describe(
      "Existing config file content to update/enhance. If omitted, tool auto-detects existing files.",
    ),
});

export type DockerComposeInput = z.infer<typeof DockerComposeInputSchema>;

export const ComposeServiceSchema = z.object({
  image: z.string().optional(),
  build: z
    .union([z.string(), z.object({ context: z.string(), dockerfile: z.string().optional() })])
    .optional(),
  ports: z.array(z.string()).default([]),
  environment: z.record(z.string()).default({}),
  volumes: z.array(z.string()).default([]),
  depends_on: z.array(z.string()).default([]),
  restart: z.enum(["no", "always", "on-failure", "unless-stopped"]).default("unless-stopped"),
  command: z.string().optional(),
  healthcheck: z
    .object({
      test: z.union([z.string(), z.array(z.string())]),
      interval: z.string().optional(),
      timeout: z.string().optional(),
      retries: z.number().optional(),
      start_period: z.string().optional(),
    })
    .optional(),
  deploy: z.record(z.unknown()).optional(),
  labels: z.record(z.string()).optional(),
  networks: z.array(z.string()).optional(),
});

export const ComposeConfigSchema = z.object({
  services: z.record(ComposeServiceSchema),
  networks: z.record(z.object({ driver: z.string().optional() })).default({}),
  volumes: z.record(z.object({ driver: z.string().optional() })).default({}),
});

export type ComposeConfig = z.infer<typeof ComposeConfigSchema>;
export type ComposeService = z.infer<typeof ComposeServiceSchema>;
