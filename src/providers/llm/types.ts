import type {
  DetectedClaim,
  ContentCategory,
} from "@/domain/safety/claims";
import type {
  Intervention,
  OsoraDnaProfile,
  ProfessionalSkillKey,
  RankedIntervention,
  SectionTimeline,
  SessionPlan,
  UserConstraint,
} from "@/domain/types";

/**
 * LLM provider contract.
 *
 * The engine decides *what* the session is. The model only writes the words
 * that fill an already-frozen plan. Every request therefore carries the plan
 * and a non-negotiable constraint block, and the caller re-validates the
 * response against those constraints before anything is stored.
 */

export interface LlmModel {
  id: string;
  label: string;
  contextWindow: number;
  supportsJson: boolean;
  inputCostPerMTokens: number;
  outputCostPerMTokens: number;
}

/** The immutable part of every prompt. Never derived from model output. */
export interface HardConstraintBlock {
  /** Boundary tags the model must never write toward. */
  blockedTags: string[];
  /** Phrases the model must not produce under any circumstances. */
  prohibitedLanguage: string[];
  /** Locked structural sections the model may not add to or remove. */
  lockedSections: string[];
  notes: string[];
}

export interface CompositionRequest {
  plan: SessionPlan;
  timeline: SectionTimeline;
  dna: OsoraDnaProfile;
  constraints: UserConstraint[];
  hardConstraints: HardConstraintBlock;
  professionalPerspective: ProfessionalSkillKey | null;
  temperature: number;
  promptVersion: string;
}

export interface OutlineResult {
  intention: string;
  sections: Array<{ sectionId: string; title: string; summary: string; wordBudget: number }>;
}

export interface ScriptResult {
  sections: Array<{ sectionId: string; text: string; wordCount: number }>;
}

export interface ClaimValidationResult {
  claim: string;
  verdict: "supported" | "unsupported" | "overstated" | "unverifiable";
  category: ContentCategory;
  reasoning: string;
  suggestedRewrite: string | null;
}

export interface SourceSuggestion {
  title: string;
  authors: string;
  year: number;
  reason: string;
  /** Always true for model output — a suggestion is never a verified source. */
  requiresVerification: true;
}

export interface ContraindicationCheck {
  interventionKey: string;
  concern: string;
  requiresSkill: ProfessionalSkillKey | null;
}

export interface FlowOpinion {
  observations: string[];
  suggestions: string[];
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  costEstimateUsd: number;
}

export interface LlmResponse<T> {
  data: T;
  usage: LlmUsage;
  model: string;
  /** Always true. AI output is a draft until a human accepts it. */
  isDraft: true;
}

export interface LlmProvider {
  readonly id: string;
  readonly label: string;

  listModels(): Promise<LlmModel[]>;

  generateOutline(request: CompositionRequest): Promise<LlmResponse<OutlineResult>>;
  generateScript(request: CompositionRequest): Promise<LlmResponse<ScriptResult>>;
  improveText(
    text: string,
    instruction: string,
    request: CompositionRequest,
  ): Promise<LlmResponse<string>>;
  generateAlternative(
    text: string,
    request: CompositionRequest,
  ): Promise<LlmResponse<string>>;
  composeSession(request: CompositionRequest): Promise<LlmResponse<ScriptResult>>;

  /**
   * Advisory only. The State Engine's ranking is authoritative; this exists so
   * an editor can see a second opinion, never to replace the ranking.
   */
  rankInterventions(
    candidates: Intervention[],
    request: CompositionRequest,
  ): Promise<LlmResponse<RankedIntervention[]>>;

  rewriteFromProfessionalPerspective(
    text: string,
    skill: ProfessionalSkillKey,
    request: CompositionRequest,
  ): Promise<LlmResponse<string>>;

  identifyClaims(text: string): Promise<LlmResponse<DetectedClaim[]>>;
  validateClaims(claims: string[]): Promise<LlmResponse<ClaimValidationResult[]>>;
  suggestSources(claim: string): Promise<LlmResponse<SourceSuggestion[]>>;
  checkContraindications(
    request: CompositionRequest,
  ): Promise<LlmResponse<ContraindicationCheck[]>>;
  evaluateFlow(timeline: SectionTimeline): Promise<LlmResponse<FlowOpinion>>;
}
