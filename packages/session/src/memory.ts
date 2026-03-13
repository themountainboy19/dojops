import { ChatMessage } from "./types";
import { ChatMessage as CoreChatMessage } from "@dojops/core";

export class MemoryManager {
  constructor(private readonly maxMessages: number = 20) {}

  getContextMessages(
    allMessages: ChatMessage[],
    summary?: string,
    projectContext?: string,
  ): CoreChatMessage[] {
    const result: CoreChatMessage[] = [];

    // Inject project context so LLM knows about the actual project structure
    if (projectContext) {
      result.push({
        role: "system",
        content: `Current project information:\n${projectContext}`,
      });
    }

    if (summary) {
      result.push({
        role: "system",
        content: `Previous conversation summary:\n${summary}`,
      });
    }

    const window = allMessages.slice(-this.maxMessages);
    for (const msg of window) {
      result.push({ role: msg.role, content: msg.content });
    }

    return result;
  }

  needsSummarization(messageCount: number): boolean {
    return messageCount > Math.floor(this.maxMessages * 1.5);
  }

  estimateTokens(messages: ChatMessage[]): number {
    let totalChars = 0;
    for (const msg of messages) {
      totalChars += msg.content.length;
    }
    return Math.ceil(totalChars / 4);
  }
}
