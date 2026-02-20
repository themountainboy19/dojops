import { LLMProvider } from "@oda/core";
import * as yaml from "js-yaml";
import { AnsiblePlaybook, AnsiblePlaybookSchema, AnsibleInput } from "./schemas";

export async function generateAnsiblePlaybook(
  input: AnsibleInput,
  llm: LLMProvider,
): Promise<AnsiblePlaybook> {
  const response = await llm.generate({
    system: `You are an Ansible expert. Generate Ansible playbook tasks as structured JSON.
Target OS: ${input.targetOS}. Include proper module names, arguments, handlers, and variables.
Respond with valid JSON only.`,
    prompt: `Generate an Ansible playbook for:
Name: ${input.playbookName}
Target: ${input.targetOS}
Hosts: ${input.hosts}
Tasks: ${input.tasks}`,
    schema: AnsiblePlaybookSchema,
  });

  return response.parsed as AnsiblePlaybook;
}

export function playbookToYaml(playbook: AnsiblePlaybook, input: AnsibleInput): string {
  const play: Record<string, unknown> = {
    name: input.playbookName,
    hosts: input.hosts,
    become: input.becomeRoot,
  };

  if (Object.keys(playbook.variables).length > 0) {
    play.vars = playbook.variables;
  }

  play.tasks = playbook.tasks.map((task) => {
    const entry: Record<string, unknown> = {
      name: task.name,
      [task.module]: task.args,
    };
    if (task.when) entry.when = task.when;
    if (task.notify) entry.notify = task.notify;
    if (task.register) entry.register = task.register;
    return entry;
  });

  if (playbook.handlers.length > 0) {
    play.handlers = playbook.handlers.map((handler) => ({
      name: handler.name,
      [handler.module]: handler.args,
    }));
  }

  return yaml.dump([play], { lineWidth: 120, noRefs: true });
}
