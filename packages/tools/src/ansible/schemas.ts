import { z } from "zod";

export const AnsibleInputSchema = z.object({
  playbookName: z.string(),
  targetOS: z.enum(["ubuntu", "debian", "centos", "rhel", "amazon-linux"]).default("ubuntu"),
  tasks: z.string().describe("Description of tasks the playbook should perform"),
  outputPath: z.string().describe("Directory to write the Ansible playbook to (e.g. './ansible')"),
  hosts: z.string().default("all"),
  becomeRoot: z.boolean().default(true),
  environment: z.string().optional(),
  existingContent: z
    .string()
    .optional()
    .describe(
      "Existing config file content to update/enhance. If omitted, tool auto-detects existing files.",
    ),
});

export type AnsibleInput = z.infer<typeof AnsibleInputSchema>;

export interface AnsibleTask {
  name: string;
  module: string;
  args: Record<string, unknown>;
  when?: string;
  notify?: string;
  register?: string;
  loop?: string | unknown[];
  tags?: string[];
  block?: AnsibleTask[];
  rescue?: AnsibleTask[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const AnsibleTaskSchema: z.ZodType<AnsibleTask, z.ZodTypeDef, any> = z.lazy(() =>
  z.object({
    name: z.string(),
    module: z.string(),
    args: z.record(z.unknown()).default({}),
    when: z.string().optional(),
    notify: z.string().optional(),
    register: z.string().optional(),
    loop: z.union([z.string(), z.array(z.unknown())]).optional(),
    tags: z.array(z.string()).optional(),
    block: z.array(AnsibleTaskSchema).optional(),
    rescue: z.array(AnsibleTaskSchema).optional(),
  }),
);

export const AnsibleHandlerSchema = z.object({
  name: z.string(),
  module: z.string(),
  args: z.record(z.unknown()).default({}),
});

export const AnsiblePlaybookSchema = z.object({
  tasks: z.array(AnsibleTaskSchema).min(1),
  handlers: z.array(AnsibleHandlerSchema).default([]),
  variables: z.record(z.unknown()).default({}),
  roles: z
    .array(
      z.union([z.string(), z.object({ role: z.string(), vars: z.record(z.unknown()).optional() })]),
    )
    .optional(),
});

export type AnsiblePlaybook = z.infer<typeof AnsiblePlaybookSchema>;
