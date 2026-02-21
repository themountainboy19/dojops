import { LLMProvider } from "../llm/provider";
import { SpecialistAgent, SpecialistConfig } from "./specialist";
import { ALL_SPECIALIST_CONFIGS } from "./specialists";

export interface RouteResult {
  agent: SpecialistAgent;
  confidence: number;
  reason: string;
}

export class AgentRouter {
  private agents: SpecialistAgent[];

  constructor(
    private provider: LLMProvider,
    configs: SpecialistConfig[] = ALL_SPECIALIST_CONFIGS,
  ) {
    this.agents = configs.map((c) => new SpecialistAgent(provider, c));
  }

  route(prompt: string): RouteResult {
    const lower = prompt.toLowerCase();
    let bestMatch: RouteResult | null = null;

    for (const agent of this.agents) {
      const matchedKeywords = agent.keywords.filter((kw) => lower.includes(kw));
      if (matchedKeywords.length === 0) continue;

      // Weighted scoring: each keyword match contributes significant confidence,
      // with a coverage bonus for hitting a larger fraction of the agent's keywords.
      // 1 match ≈ 40%, 2 matches ≈ 65%, 3+ matches ≈ 85-100%
      const matchRatio = matchedKeywords.length / agent.keywords.length;
      const confidence = Math.min(matchedKeywords.length * 0.3 + matchRatio * 0.1, 1.0);

      if (!bestMatch || confidence > bestMatch.confidence) {
        bestMatch = {
          agent,
          confidence,
          reason: `Matched keywords: ${matchedKeywords.join(", ")}`,
        };
      }
    }

    if (bestMatch) return bestMatch;

    const fallback = this.agents.find((a) => a.domain === "orchestration") ?? this.agents[0];
    return {
      agent: fallback,
      confidence: 0,
      reason: "No domain match, routing to OpsCortex",
    };
  }

  getAgents(): SpecialistAgent[] {
    return [...this.agents];
  }
}
