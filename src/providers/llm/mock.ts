import "server-only";

import { INTERVENTION_BY_KEY } from "@/domain/interventions/library";
import { MECHANISM_BY_KEY } from "@/domain/mechanisms/library";
import { detectClaims } from "@/domain/safety/claims";
import { countWords } from "@/domain/timeline/planner";
import type { Intervention, ProfessionalSkillKey, RankedIntervention, SectionTimeline } from "@/domain/types";
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
 * Mock LLM provider.
 *
 * Deterministic, offline, and — importantly — it writes *inside* the word
 * budgets the timeline planner computed. That makes local development behave
 * like production: the plan constrains the text, not the other way round.
 */

const MODELS: LlmModel[] = [
  {
    id: "mock-composer-1",
    label: "Mock composer (deterministic)",
    contextWindow: 200_000,
    supportsJson: true,
    inputCostPerMTokens: 0,
    outputCostPerMTokens: 0,
  },
  {
    id: "mock-editor-1",
    label: "Mock editor (deterministic)",
    contextWindow: 200_000,
    supportsJson: true,
    inputCostPerMTokens: 0,
    outputCostPerMTokens: 0,
  },
];

/** Osora phrasing bank, keyed by section kind. */
const OPENERS: Record<string, string[]> = {
  opening: [
    "You've arrived. Nothing needs to start yet.",
    "Let the next few minutes be as they are.",
  ],
  orientation: [
    "Here's what this is: about {{minutes}} minutes, {{shape}}, and quiet at the end.",
    "Nothing in this asks you to prepare.",
  ],
  breath: [
    "See if the out-breath can become just a little longer than the in-breath.",
    "Not forcing it — more like letting it lengthen on its own.",
  ],
  body: [
    "Starting at your feet.",
    "The lower legs. The knees. Nothing to change.",
    "And upward, region by region, at whatever pace this takes.",
  ],
  main: [
    "If a thought is circling, you don't have to finish it.",
    "You could notice it the way you'd notice a sound outside.",
  ],
  silence: ["Still here."],
  sound_only: [],
  closing: ["Whenever you're ready — no rush at all.", "This stays available.", "Take your time."],
  reflection: ["Nothing to conclude. Just noticing where you are now."],
  transition: ["And letting that settle."],
  intention: [""],
  aftercare: ["If anything felt like too much, stopping early is always a complete session."],
  rationale: [""],
  contraindications: [""],
};

const PAUSE_MARK = (seconds: number) => `\n\n[pause ${seconds}]\n\n`;

/** Builds text that fills a word budget without exceeding it. */
function composeSectionText(
  kind: string,
  wordBudget: number,
  interventionKey: string | null,
  pauseSeconds: number,
): string {
  if (wordBudget <= 0) return "";

  const intervention = interventionKey ? INTERVENTION_BY_KEY[interventionKey] : undefined;
  const bank = [...(OPENERS[kind] ?? OPENERS.main)];

  // Seed from the intervention's own template so provenance shows through.
  if (intervention) {
    const templateLines = intervention.scriptTemplate
      .split(/\n+/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("["))
      .map((line) => line.replace(/\{\{[^}]+\}\}/g, "that"));
    bank.unshift(...templateLines);
  }

  const lines: string[] = [];
  let used = 0;
  let index = 0;
  const pausePerLine = Math.max(4, Math.round(pauseSeconds / Math.max(1, bank.length)));

  while (used < wordBudget * 0.92 && bank.length > 0 && index < 24) {
    const line = bank[index % bank.length];
    const lineWords = countWords(line);
    if (lineWords === 0) break;
    if (used + lineWords > wordBudget) break;
    lines.push(line);
    used += lineWords;
    index += 1;
  }

  if (lines.length === 0) return "";
  return lines.join(PAUSE_MARK(pausePerLine));
}

function usage(inputTokens: number, outputTokens: number) {
  return { inputTokens, outputTokens, costEstimateUsd: 0 };
}

function wrap<T>(data: T, inputTokens = 0, outputTokens = 0): LlmResponse<T> {
  return {
    data,
    usage: usage(inputTokens, outputTokens),
    model: "mock-composer-1",
    isDraft: true,
  };
}

export class MockLlmProvider implements LlmProvider {
  readonly id = "mock";
  readonly label = "Mock provider";

  async listModels(): Promise<LlmModel[]> {
    return MODELS;
  }

  async generateOutline(request: CompositionRequest): Promise<LlmResponse<OutlineResult>> {
    const sections = request.timeline.sections.map((section) => ({
      sectionId: section.id,
      title: section.title,
      summary: section.mechanism
        ? `${MECHANISM_BY_KEY[section.mechanism]?.intendedEffect ?? section.title}`
        : "Structural section carried by the Osora opening and closing patterns.",
      wordBudget: section.wordBudget,
    }));

    return wrap(
      {
        intention: `A ${Math.round(request.plan.durationSeconds / 60)}-minute session to ${request.plan.target}.`,
        sections,
      },
      1200,
      420,
    );
  }

  async generateScript(request: CompositionRequest): Promise<LlmResponse<ScriptResult>> {
    const system = buildSystemPrompt();
    const user = buildUserPrompt(request);

    const sections = request.timeline.sections.map((section) => {
      const text = composeSectionText(
        section.kind,
        section.wordBudget,
        section.interventionKey,
        section.pauseSeconds,
      );
      return { sectionId: section.id, text, wordCount: countWords(text) };
    });

    const outputTokens = sections.reduce((sum, s) => sum + s.wordCount * 2, 0);
    const response = wrap({ sections }, 2400, outputTokens);
    return {
      ...response,
      transcript: {
        provider: "mock",
        model: "mock-composer-1",
        temperature: request.temperature,
        system,
        // The prompt a hosted provider would receive, built by the same code.
        user,
        raw: JSON.stringify({ sections }, null, 2),
      },
    };
  }

  async composeSession(request: CompositionRequest): Promise<LlmResponse<ScriptResult>> {
    return this.generateScript(request);
  }

  async improveText(
    text: string,
    instruction: string,
  ): Promise<LlmResponse<string>> {
    // Deterministic "improvement": shorten sentences, soften imperatives.
    const improved = text
      .replace(/\byou must\b/gi, "you might")
      .replace(/\bmake sure\b/gi, "see if")
      .replace(/\bnow\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    return wrap(
      improved.length > 0 ? improved : `[${instruction}] — no change produced by the mock provider.`,
      600,
      Math.round(countWords(improved) * 2),
    );
  }

  async generateAlternative(text: string): Promise<LlmResponse<string>> {
    const alternative = text
      .split(/\n\n+/)
      .reverse()
      .join("\n\n")
      .replace(/\bnotice\b/gi, "let yourself feel")
      .replace(/\blet\b/gi, "allow");
    return wrap(alternative, 600, Math.round(countWords(alternative) * 2));
  }

  async rankInterventions(
    candidates: Intervention[],
  ): Promise<LlmResponse<RankedIntervention[]>> {
    // Advisory only. Deliberately a simple heuristic so it never looks like a
    // competitor to the deterministic engine ranking.
    const ranked = candidates
      .map<RankedIntervention>((intervention) => ({
        interventionKey: intervention.key,
        name: intervention.name,
        score: Number((intervention.mechanisms.length * 0.5 + intervention.version * 0.05).toFixed(2)),
        familiar: intervention.familiarityGroup.endsWith("_core"),
        breakdown: [{ factor: "Editorial second opinion (advisory)", value: 1 }],
        eligible: true,
        exclusionReason: null,
      }))
      .sort((a, b) => b.score - a.score);
    return wrap(ranked, 900, 300);
  }

  async rewriteFromProfessionalPerspective(
    text: string,
    skill: ProfessionalSkillKey,
  ): Promise<LlmResponse<string>> {
    const framing: Partial<Record<ProfessionalSkillKey, string>> = {
      trauma_informed_practice: "Every instruction below is offered, never required.",
      breathwork: "No counts, no holds, no target ratio anywhere below.",
      sleep_science: "Nothing below asks for effort or a decision.",
      pain_science: "Attention is never routed to a painful region below.",
      clinical_psychology: "No content below implies a diagnosis or a treatment effect.",
    };
    const note = framing[skill] ?? `Reviewed through a ${skill.replace(/_/g, " ")} lens.`;
    return wrap(`${note}\n\n${text}`, 800, Math.round(countWords(text) * 2));
  }

  async identifyClaims(text: string) {
    const claims = detectClaims(text);
    return wrap(claims, 500, claims.length * 40);
  }

  async validateClaims(claims: string[]): Promise<LlmResponse<ClaimValidationResult[]>> {
    const results = claims.map<ClaimValidationResult>((claim) => ({
      claim,
      verdict: "unverifiable",
      category: "educational",
      reasoning:
        "The mock provider cannot verify claims. Every claim must be checked against the evidence library by a scientific reviewer.",
      suggestedRewrite: null,
    }));
    return wrap(results, 400, claims.length * 60);
  }

  async suggestSources(claim: string): Promise<LlmResponse<SourceSuggestion[]>> {
    return wrap(
      [
        {
          title: `Candidate source for: ${claim.slice(0, 60)}`,
          authors: "Unverified",
          year: new Date().getUTCFullYear(),
          reason:
            "Model-generated suggestion. Not evidence. Must be located, read and verified before it may back a claim.",
          requiresVerification: true,
        },
      ],
      300,
      120,
    );
  }

  async checkContraindications(
    request: CompositionRequest,
  ): Promise<LlmResponse<ContraindicationCheck[]>> {
    const checks: ContraindicationCheck[] = [];
    for (const block of request.plan.sequence) {
      if (!block.interventionKey) continue;
      const intervention = INTERVENTION_BY_KEY[block.interventionKey];
      for (const contraindication of intervention?.contraindications ?? []) {
        checks.push({
          interventionKey: intervention.key,
          concern: contraindication.summary,
          requiresSkill: contraindication.requiresSkill,
        });
      }
    }
    return wrap(checks, 700, checks.length * 50);
  }

  async evaluateFlow(timeline: SectionTimeline): Promise<LlmResponse<FlowOpinion>> {
    const longest = [...timeline.sections].sort(
      (a, b) => b.estimatedSpeechSeconds - a.estimatedSpeechSeconds,
    )[0];
    return wrap(
      {
        observations: [
          `${timeline.sections.length} sections across ${Math.round(timeline.totalSeconds / 60)} minutes.`,
          longest
            ? `"${longest.title}" carries the most speech at ${longest.estimatedSpeechSeconds.toFixed(0)}s.`
            : "No spoken section yet.",
        ],
        suggestions: [
          "Editorial opinion only — the deterministic flow validator is authoritative.",
        ],
      },
      600,
      180,
    );
  }
}
