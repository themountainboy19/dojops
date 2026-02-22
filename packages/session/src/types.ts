export type SessionMode = "INTERACTIVE" | "DETERMINISTIC";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface ChatSessionState {
  id: string;
  name?: string;
  createdAt: string;
  updatedAt: string;
  mode: SessionMode;
  messages: ChatMessage[];
  summary?: string;
  pinnedAgent?: string;
  metadata: {
    totalTokensEstimate: number;
    messageCount: number;
    lastAgentUsed?: string;
  };
}
