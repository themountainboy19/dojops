import { z } from "zod";

export const NginxInputSchema = z.object({
  serverName: z.string().describe("Server name / domain (e.g. 'example.com')"),
  upstreams: z
    .array(
      z.object({
        name: z.string(),
        servers: z.array(z.string()).min(1),
      }),
    )
    .min(1)
    .describe("Upstream server groups"),
  sslEnabled: z.boolean().default(false),
  outputPath: z.string().describe("Directory to write the nginx config to"),
  fullConfig: z.boolean().optional(),
  environment: z.string().optional(),
  existingContent: z
    .string()
    .optional()
    .describe(
      "Existing config file content to update/enhance. If omitted, tool auto-detects existing files.",
    ),
});

export type NginxInput = z.infer<typeof NginxInputSchema>;

export const NginxUpstreamSchema = z.object({
  name: z.string(),
  servers: z.array(z.string()).min(1),
  loadBalancing: z.enum(["round-robin", "least_conn", "ip_hash"]).default("round-robin"),
});

export const NginxLocationSchema = z.object({
  path: z.string(),
  proxy_pass: z.string().optional(),
  root: z.string().optional(),
  try_files: z.string().optional(),
  extra_directives: z.record(z.string()).default({}),
});

export const NginxServerSchema = z.object({
  listen: z.number(),
  server_name: z.string(),
  locations: z.array(NginxLocationSchema).min(1),
  ssl_certificate: z.string().optional(),
  ssl_certificate_key: z.string().optional(),
});

export const NginxConfigSchema = z.object({
  upstreams: z.array(NginxUpstreamSchema),
  servers: z.array(NginxServerSchema).min(1),
});

export type NginxConfig = z.infer<typeof NginxConfigSchema>;
export type NginxServer = z.infer<typeof NginxServerSchema>;
export type NginxLocation = z.infer<typeof NginxLocationSchema>;
export type NginxUpstream = z.infer<typeof NginxUpstreamSchema>;
