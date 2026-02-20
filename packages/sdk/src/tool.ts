export interface ToolInput {
  [key: string]: any;
}

export interface ToolOutput {
  success: boolean;
  data?: any;
  error?: string;
}

export interface DevOpsTool {
  name: string;
  validate(input: ToolInput): Promise<boolean>;
  generate(input: ToolInput): Promise<ToolOutput>;
  execute?(input: ToolInput): Promise<ToolOutput>;
}
