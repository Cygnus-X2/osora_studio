import "server-only";

import { detectClaims } from "@/domain/safety/claims";
import { countWords } from "@/domain/timeline/planner";
import type {
  Intervention,
  ProfessionalSkillKey,
  RankedIntervention,
  SectionTimeline,
} from "@/domain/types";
import { envValue } from "@/lib/env";
import { buildSystemPrompt, buildUserPrompt } from "./prompt";
import type {
  ClaimValidationResult,
  CompositionRequest,
  ContraindicationCheck,
  FlowOpinion,
  LlmModel,
  LlmProvider,
  LlmResponse,
  OutlineResult,
  ScriptResult,
  SourceSuggestion,
} from "./types";

/**
 * Hosted LLM adapters.
 *
 * All three speak the same `LlmProvider` contract and share prompt
 * construction, so switching provider changes nothing about what the model is
 * allowed to decide. API keys are read from the server environment and never
 * leave this module — nothing here is importable from a client component.
 */

export type HostedVendor = "anthropic" | "openai" | "gemini";

interface VendorConfig {
  label: string;
  envKey: string;
  models: LlmModel[];
}

const VENDORS: Record<HostedVendor, VendorConfig> = {
  anthropic: {
    label: "Anthropic",
    envKey: "ANTHROPIC_API_KEY",
    models: [
      {
        id: "claude-opus-5",
        label: "Claude Opus 5",
        contextWindow: 200_000,
        supportsJson: true,
        inputCostPerMTokens: 5,
        outputCostPerMTokens: 25,
      },
      {
        id: "claude-sonnet-5",
        label: "Claude Sonnet 5",
        contextWindow: 200_000,
        supportsJson: true,
        inputCostPerMTokens: 3,
        outputCostPerMTokens: 15,
      },
      {
        id: "claude-haiku-4-5-20251001",
        label: "Claude Haiku 4.5",
        contextWindow: 200_000,
        supportsJson: true,
        inputCostPerMTokens: 1,
        outputCostPerMTokens: 5,
      },
    ],
  },
  openai: {
    label: "OpenAI",
    envKey: "OPENAI_API_KEY",
    models: [
      {
        id: "gpt-4.1",
        label: "GPT-4.1",
        contextWindow: 128_000,
        supportsJson: true,
        inputCostPerMTokens: 2,
        outputCostPerMTokens: 8,
      },
      {
        id: "gpt-4.1-mini",
        label: "GPT-4.1 mini",
        contextWindow: 128_000,
        supportsJson: true,
        inputCostPerMTokens: 0.4,
        outputCostPerMTokens: 1.6,
      },
    ],
  },
  gemini: {
    label: "Google Gemini",
    envKey: "GOOGLE_API_KEY",
    models: [
      {
        id: "gemini-2.5-pro",
        label: "Gemini 2.5 Pro",
        contextWindow: 1_000_000,
        supportsJson: true,
        inputCostPerMTokens: 1.25,
        outputCostPerMTokens: 10,
      },
      {
        id: "gemini-2.5-flash",
        label: "Gemini 2.5 Flash",
        contextWindow: 1_000_000,
        supportsJson: true,
        inputCostPerMTokens: 0.3,
        outputCostPerMTokens: 2.5,
      },
    ],
  },
};

interface RawCompletion {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export class HostedLlmProvider implements LlmProvider {
  readonly id: HostedVendor;
  readonly label: string;
  private readonly config: VendorConfig;

  constructor(vendor: HostedVendor) {
    this.id = vendor;
    this.config = VENDORS[vendor];
    this.label = this.config.label;
  }

  async listModels(): Promise<LlmModel[]> {
    return this.config.models;
  }

  private apiKey(): string {
    const key = envValue(this.config.envKey);
    if (!key) {
      throw new Error(
        `${this.config.envKey} is not set. Set it in the server environment, or use the mock provider for local development.`,
      );
    }
    return key;
  }

  private costFor(model: string, inputTokens: number, outputTokens: number): number {
    const definition = this.config.models.find((m) => m.id === model) ?? this.config.models[0];
    return Number(
      (
        (inputTokens / 1_000_000) * definition.inputCostPerMTokens +
        (outputTokens / 1_000_000) * definition.outputCostPerMTokens
      ).toFixed(5),
    );
  }

  private async complete(
    model: string,
    system: string,
    user: string,
    temperature: number,
  ): Promise<RawCompletion> {
    const key = this.apiKey();

    if (this.id === "anthropic") {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          temperature,
          system,
          messages: [{ role: "user", content: user }],
        }),
      });
      if (!response.ok) throw new Error(`Anthropic request failed: ${response.status}`);
      const json = (await response.json()) as {
        content: Array<{ type: string; text?: string }>;
        usage: { input_tokens: number; output_tokens: number };
      };
      return {
        text: json.content.map((c) => c.text ?? "").join(""),
        inputTokens: json.usage.input_tokens,
        outputTokens: json.usage.output_tokens,
      };
    }

    if (this.id === "openai") {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          temperature,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
      const json = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
        usage: { prompt_tokens: number; completion_tokens: number };
      };
      return {
        text: json.choices[0]?.message.content ?? "",
        inputTokens: json.usage.prompt_tokens,
        outputTokens: json.usage.completion_tokens,
      };
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { temperature },
        }),
      },
    );
    if (!response.ok) throw new Error(`Gemini request failed: ${response.status}`);
    const json = (await response.json()) as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
      usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number };
    };
    return {
      text: json.candidates[0]?.content.parts.map((p) => p.text).join("") ?? "",
      inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
    };
  }

  private wrap<T>(data: T, model: string, raw: RawCompletion): LlmResponse<T> {
    return {
      data,
      model,
      isDraft: true,
      usage: {
        inputTokens: raw.inputTokens,
        outputTokens: raw.outputTokens,
        costEstimateUsd: this.costFor(model, raw.inputTokens, raw.outputTokens),
      },
    };
  }

  private async completeJson<T>(
    request: CompositionRequest,
    user: string,
    fallback: T,
  ): Promise<{ data: T; raw: RawCompletion; model: string }> {
    const model = this.config.models[0].id;
    const raw = await this.complete(model, buildSystemPrompt(), user, request.temperature);
    const match = raw.text.match(/\{[\s\S]*\}/);
    let data = fallback;
    if (match) {
      try {
        data = JSON.parse(match[0]) as T;
      } catch {
        // Malformed model output is a draft failure, not a crash. The caller
        // records the run and a human sees the raw text.
      }
    }
    return { data, raw, model };
  }

  async generateOutline(request: CompositionRequest): Promise<LlmResponse<OutlineResult>> {
    const fallback: OutlineResult = {
      intention: request.plan.target,
      sections: request.timeline.sections.map((s) => ({
        sectionId: s.id,
        title: s.title,
        summary: "",
        wordBudget: s.wordBudget,
      })),
    };
    const { data, raw, model } = await this.completeJson(
      request,
      `${buildUserPrompt(request)}\n\nProduce an OUTLINE only: {"intention":"…","sections":[{"sectionId":"…","title":"…","summary":"…","wordBudget":0}]}`,
      fallback,
    );
    return this.wrap(data, model, raw);
  }

  async generateScript(request: CompositionRequest): Promise<LlmResponse<ScriptResult>> {
    const fallback: ScriptResult = { sections: [] };
    const { data, raw, model } = await this.completeJson(request, buildUserPrompt(request), fallback);

    // Enforce the plan on the way back: unknown sections are dropped, and word
    // counts are recomputed from the text rather than trusted from the model.
    const allowed = new Set(request.timeline.sections.map((s) => s.id));
    const sections = (data.sections ?? [])
      .filter((s) => allowed.has(s.sectionId))
      .map((s) => ({ ...s, wordCount: countWords(s.text) }));

    return this.wrap({ sections }, model, raw);
  }

  async composeSession(request: CompositionRequest): Promise<LlmResponse<ScriptResult>> {
    return this.generateScript(request);
  }

  async improveText(
    text: string,
    instruction: string,
    request: CompositionRequest,
  ): Promise<LlmResponse<string>> {
    const model = this.config.models[0].id;
    const raw = await this.complete(
      model,
      buildSystemPrompt(),
      `Rewrite the passage below. Instruction: ${instruction}\nKeep the word count within 10% of the original.\n\n---\n${text}`,
      request.temperature,
    );
    return this.wrap(raw.text.trim(), model, raw);
  }

  async generateAlternative(
    text: string,
    request: CompositionRequest,
  ): Promise<LlmResponse<string>> {
    return this.improveText(text, "Offer a different phrasing with the same meaning and length.", request);
  }

  async rankInterventions(
    candidates: Intervention[],
    request: CompositionRequest,
  ): Promise<LlmResponse<RankedIntervention[]>> {
    const model = this.config.models[0].id;
    const raw = await this.complete(
      model,
      buildSystemPrompt(),
      `Advisory second opinion only — the deterministic engine ranking is authoritative and will not be replaced by yours.\nRank these interventions for: ${request.plan.target}\n${candidates.map((c) => `- ${c.key}: ${c.description}`).join("\n")}\nReturn {"ranking":["key", …]}.`,
      request.temperature,
    );
    const match = raw.text.match(/\{[\s\S]*\}/);
    let order: string[] = [];
    if (match) {
      try {
        order = (JSON.parse(match[0]) as { ranking?: string[] }).ranking ?? [];
      } catch {
        order = [];
      }
    }
    const ranked = candidates.map<RankedIntervention>((c) => {
      const index = order.indexOf(c.key);
      return {
        interventionKey: c.key,
        name: c.name,
        score: index >= 0 ? Number((order.length - index).toFixed(2)) : 0,
        familiar: c.familiarityGroup.endsWith("_core"),
        breakdown: [{ factor: "Model advisory rank", value: index >= 0 ? order.length - index : 0 }],
        eligible: true,
        exclusionReason: null,
      };
    });
    return this.wrap(
      ranked.sort((a, b) => b.score - a.score),
      model,
      raw,
    );
  }

  async rewriteFromProfessionalPerspective(
    text: string,
    skill: ProfessionalSkillKey,
    request: CompositionRequest,
  ): Promise<LlmResponse<string>> {
    return this.improveText(
      text,
      `Rewrite through a ${skill.replace(/_/g, " ")} lens. This is an editorial exercise and does not constitute professional approval.`,
      request,
    );
  }

  async identifyClaims(text: string) {
    // Deterministic detection is authoritative here; no model call needed.
    const claims = detectClaims(text);
    return {
      data: claims,
      model: "deterministic",
      isDraft: true as const,
      usage: { inputTokens: 0, outputTokens: 0, costEstimateUsd: 0 },
    };
  }

  async validateClaims(claims: string[]): Promise<LlmResponse<ClaimValidationResult[]>> {
    const model = this.config.models[0].id;
    const raw = await this.complete(
      model,
      buildSystemPrompt(),
      `For each claim, state whether a wellness product can make it. Return {"results":[{"claim":"…","verdict":"supported|unsupported|overstated|unverifiable","category":"wellness|educational|medical_advice|clinical_treatment","reasoning":"…","suggestedRewrite":"…"}]}\n\n${claims.map((c) => `- ${c}`).join("\n")}`,
      0.1,
    );
    const match = raw.text.match(/\{[\s\S]*\}/);
    let results: ClaimValidationResult[] = [];
    if (match) {
      try {
        results = (JSON.parse(match[0]) as { results?: ClaimValidationResult[] }).results ?? [];
      } catch {
        results = [];
      }
    }
    return this.wrap(results, model, raw);
  }

  async suggestSources(claim: string): Promise<LlmResponse<SourceSuggestion[]>> {
    const model = this.config.models[0].id;
    const raw = await this.complete(
      model,
      buildSystemPrompt(),
      `Suggest up to three real published sources that could support: "${claim}". Return {"sources":[{"title":"…","authors":"…","year":2020,"reason":"…"}]}. Suggestions are leads only and must be verified by a human before use.`,
      0.2,
    );
    const match = raw.text.match(/\{[\s\S]*\}/);
    let sources: Array<Omit<SourceSuggestion, "requiresVerification">> = [];
    if (match) {
      try {
        sources =
          (JSON.parse(match[0]) as { sources?: Array<Omit<SourceSuggestion, "requiresVerification">> })
            .sources ?? [];
      } catch {
        sources = [];
      }
    }
    return this.wrap(
      sources.map((s) => ({ ...s, requiresVerification: true as const })),
      model,
      raw,
    );
  }

  async checkContraindications(
    request: CompositionRequest,
  ): Promise<LlmResponse<ContraindicationCheck[]>> {
    const model = this.config.models[0].id;
    const raw = await this.complete(
      model,
      buildSystemPrompt(),
      `Flag any safety concern in this plan that the declared contraindications do not already cover.\n${JSON.stringify(request.plan.sequence, null, 2)}\nReturn {"checks":[{"interventionKey":"…","concern":"…","requiresSkill":"…"}]}`,
      0.1,
    );
    const match = raw.text.match(/\{[\s\S]*\}/);
    let checks: ContraindicationCheck[] = [];
    if (match) {
      try {
        checks = (JSON.parse(match[0]) as { checks?: ContraindicationCheck[] }).checks ?? [];
      } catch {
        checks = [];
      }
    }
    return this.wrap(checks, model, raw);
  }

  async evaluateFlow(timeline: SectionTimeline): Promise<LlmResponse<FlowOpinion>> {
    const model = this.config.models[0].id;
    const raw = await this.complete(
      model,
      buildSystemPrompt(),
      `Comment on the pacing of this arrangement. Editorial opinion only — the deterministic flow validator is authoritative.\n${JSON.stringify(
        timeline.sections.map((s) => ({
          title: s.title,
          words: s.wordCount,
          speech: s.estimatedSpeechSeconds,
          pause: s.pauseSeconds,
        })),
        null,
        2,
      )}\nReturn {"observations":["…"],"suggestions":["…"]}`,
      0.3,
    );
    const match = raw.text.match(/\{[\s\S]*\}/);
    let opinion: FlowOpinion = { observations: [], suggestions: [] };
    if (match) {
      try {
        opinion = JSON.parse(match[0]) as FlowOpinion;
      } catch {
        opinion = { observations: [raw.text.slice(0, 300)], suggestions: [] };
      }
    }
    return this.wrap(opinion, model, raw);
  }
}
