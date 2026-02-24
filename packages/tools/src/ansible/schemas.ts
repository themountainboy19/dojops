import { z } from "zod";

export const AnsibleInputSchema = z.object({
  playbookName: z.string(),
  targetOS: z.enum(["ubuntu", "debian", "centos", "rhel", "amazon-linux"]).default("ubuntu"),
  tasks: z.string().describe("Description of tasks the playbook should perform"),
  outputPath: z.string().describe("Directory to write the Ansible playbook to (e.g. './ansible')"),
  hosts: z.string().default("all"),
  becomeRoot: z.boolean().default(true),
  existingContent: z
    .string()
    .optional()
    .describe(
      "Existing config file content to update/enhance. If omitted, tool auto-detects existing files.",
    ),
});

export type AnsibleInput = z.infer<typeof AnsibleInputSchema>;

export const AnsibleTaskSchema = z.object({
  name: z.string(),
  module: z.string(),
  args: z.record(z.unknown()).default({}),
  when: z.string().optional(),
  notify: z.string().optional(),
  register: z.string().optional(),
});

export const AnsibleHandlerSchema = z.object({
  name: z.string(),
  module: z.string(),
  args: z.record(z.unknown()).default({}),
});

export const AnsiblePlaybookSchema = z.object({
  tasks: z.array(AnsibleTaskSchema).min(1),
  handlers: z.array(AnsibleHandlerSchema).default([]),
  variables: z.record(z.unknown()).default({}),
});

export type AnsiblePlaybook = z.infer<typeof AnsiblePlaybookSchema>;
