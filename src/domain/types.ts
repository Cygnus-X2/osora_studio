/**
 * Osora Studio — core domain types.
 *
 * This module is pure: no React, no Next, no Supabase, no I/O.
 * Everything the State Engine, timeline planner, rules engine and flow
 * validator need is expressed here so that all of it stays unit-testable
 * and deterministic.
 */

/* ------------------------------------------------------------------ */
/* Shared vocabulary                                                    */
/* ------------------------------------------------------------------ */

export type ReviewStatus =
  | "draft"
  | "in_review"
  | "changes_requested"
  | "approved"
  | "retired";

export type EvidenceLevel =
  | "strong"
  | "moderate"
  | "preliminary"
  | "expert_consensus"
  | "traditional_practice"
  | "internal_hypothesis"
  | "unverified";

/** How much a claim of a given evidence level may influence engine scoring. */
export const EVIDENCE_WEIGHT: Record<EvidenceLevel, number> = {
  strong: 1,
  moderate: 0.8,
  preliminary: 0.55,
  expert_consensus: 0.5,
  traditional_practice: 0.3,
  internal_hypothesis: 0.2,
  unverified: 0.1,
};

/** The provenance ladder. Only the first two may ever approve a claim. */
export type KnowledgeKind =
  | "scientific_evidence"
  | "expert_opinion"
  | "traditional_practice"
  | "internal_hypothesis"
  | "ai_suggestion";

export type SourceType =
  | "peer_reviewed_paper"
  | "systematic_review"
  | "meta_analysis"
  | "clinical_guideline"
  | "book"
  | "expert_protocol"
  | "training_material"
  | "internal_research_note"
  | "traditional_source";

export type VerificationStatus = "unverified" | "in_verification" | "verified" | "disputed";

export type GuidanceDensity = "sparse" | "moderate" | "dense";

export type Directiveness = "invitational" | "balanced" | "direct";

/* ------------------------------------------------------------------ */
/* 1. State model                                                       */
/* ------------------------------------------------------------------ */

export type DimensionKey =
  | "stress"
  | "calmness"
  | "energy"
  | "tiredness"
  | "mental_activity"
  | "rumination"
  | "focus"
  | "emotional_intensity"
  | "physical_tension"
  | "discomfort"
  | "safety"
  | "connectedness"
  | "openness"
  | "motivation"
  | "restlessness"
  | "overwhelm";

/**
 * A self-reported dimension. Deliberately *not* a diagnostic construct:
 * `internalInterpretation` is for the team, `userFacingWording` is what a
 * person actually reads, and nothing here names a condition.
 */
export interface StateDimension {
  key: DimensionKey;
  name: string;
  description: string;
  scale: "0-10";
  min: number;
  max: number;
  /** Whether a *higher* number is the pleasant end of the scale. */
  higherIsPleasant: boolean;
  userFacingWording: string;
  internalInterpretation: string;
  allowedUseCases: string[];
  safetyNotes: string | null;
  version: number;
}

/** A self-reported reading of every dimension the user answered. */
export type StateProfile = Partial<Record<DimensionKey, number>>;

export type DesiredDirection =
  | "calmer"
  | "more_grounded"
  | "more_focused"
  | "more_connected"
  | "less_mentally_busy"
  | "ready_for_sleep"
  | "more_accepting"
  | "more_energised"
  | "more_spacious"
  | "less_overwhelmed";

export interface DesiredDirectionDefinition {
  key: DesiredDirection;
  label: string;
  description: string;
  /** Dimension movements this direction implies, signed: +1 up, -1 down. */
  targets: Array<{ dimension: DimensionKey; direction: 1 | -1; weight: number }>;
}

export type SessionEnvironment =
  | "quiet_room"
  | "bed"
  | "office"
  | "outdoors"
  | "commute"
  | "shared_space";

export type SessionIntent =
  | "reset_during_day"
  | "wind_down"
  | "prepare_for_sleep"
  | "prepare_for_focus"
  | "recover_after_stress"
  | "sit_with_a_feeling"
  | "start_the_day";

export interface StateCheckIn {
  id: string;
  userId: string;
  capturedAt: string;
  profile: StateProfile;
  note: string | null;
}

export interface DesiredStateInput {
  directions: DesiredDirection[];
  intent: SessionIntent;
  environment: SessionEnvironment;
  availableSeconds: number;
  context: string | null;
}

/* ------------------------------------------------------------------ */
/* 2. Mechanisms                                                        */
/* ------------------------------------------------------------------ */

export type MechanismKey =
  | "attention_stabilisation"
  | "attentional_widening"
  | "extended_exhalation"
  | "breath_awareness"
  | "interoceptive_awareness"
  | "exteroceptive_orientation"
  | "cognitive_distancing"
  | "acceptance"
  | "self_compassion"
  | "muscle_relaxation"
  | "rhythmic_entrainment"
  | "sensory_grounding"
  | "emotional_labelling"
  | "perceived_safety"
  | "imagery"
  | "silence"
  | "body_awareness"
  | "predictability"
  | "repetition"
  | "progressive_guidance_reduction";

export type ComparisonOperator = "gte" | "lte" | "gt" | "lt";

/** An expert-authored eligibility condition, e.g. `stress >= 6`. */
export interface DimensionCondition {
  dimension: DimensionKey;
  operator: ComparisonOperator;
  value: number;
  /** Shown in the engine trace when this condition decides something. */
  note?: string;
}

export type ProfessionalSkillKey =
  | "meditation_instruction"
  | "clinical_psychology"
  | "psychotherapy"
  | "breathwork"
  | "trauma_informed_practice"
  | "somatic_practice"
  | "sleep_science"
  | "neuroscience"
  | "pain_science"
  | "stress_regulation"
  | "sound_design"
  | "music_composition"
  | "voice_direction"
  | "scientific_research"
  | "medical_review"
  | "copy_editing";

export interface Mechanism {
  key: MechanismKey;
  name: string;
  description: string;
  intendedEffect: string;
  /** Conditions under which this mechanism is a good fit. */
  suitableStates: DimensionCondition[];
  /** Conditions under which it is a poor fit — penalised, not blocked. */
  unsuitableStates: DimensionCondition[];
  /** Conditions under which it must be excluded outright. */
  contraindications: Contraindication[];
  evidenceLevel: EvidenceLevel;
  knowledgeKind: KnowledgeKind;
  supportingSourceIds: string[];
  requiredSkills: ProfessionalSkillKey[];
  recommendedSeconds: number;
  minExposureSeconds: number;
  maxExposureSeconds: number;
  compatibleWith: MechanismKey[];
  incompatibleWith: MechanismKey[];
  /** Which desired directions this mechanism serves, and how strongly. */
  servesDirections: Partial<Record<DesiredDirection, number>>;
  reviewStatus: ReviewStatus;
  version: number;
  tags: string[];
}

export interface Contraindication {
  id: string;
  summary: string;
  /** Machine-checkable state trigger, when one exists. */
  condition: DimensionCondition | null;
  /** Free-text guidance for the reviewer when no condition can be encoded. */
  guidance: string;
  requiresSkill: ProfessionalSkillKey | null;
}

/* ------------------------------------------------------------------ */
/* 3. Interventions                                                     */
/* ------------------------------------------------------------------ */

export type SourceTradition =
  | "vipassana"
  | "zen"
  | "yoga_nidra"
  | "act"
  | "cbt"
  | "hypnosis"
  | "somatic_practice"
  | "feldenkrais"
  | "alexander_technique"
  | "breathwork"
  | "music_psychology"
  | "sport_psychology"
  | "osora_original";

/**
 * Tags that hard user boundaries match against. This is the join key that
 * makes boundaries structurally unbreakable: an intervention carrying a
 * blocked tag is removed from the candidate set before scoring, so it never
 * reaches the ranking, the composer, or any LLM prompt.
 */
export type BoundaryTag =
  | "hypnotic_language"
  | "spiritual_terminology"
  | "visualisation"
  | "breath_retention"
  | "strong_breath_manipulation"
  | "pain_focus"
  | "sudden_sounds"
  | "unpredictable_structure"
  | "body_scanning"
  | "emotional_exposure";

export type FamiliarityGroup =
  | "grounding_core"
  | "breath_core"
  | "body_core"
  | "cognitive_core"
  | "compassion_core"
  | "imagery_extended"
  | "sound_extended"
  | "silence_core";

export interface Intervention {
  key: string;
  name: string;
  description: string;
  /** Mechanisms this block engages, with a 0–1 contribution weight. */
  mechanisms: Array<{ mechanism: MechanismKey; weight: number }>;
  suitableStates: DimensionCondition[];
  excludedStates: DimensionCondition[];
  targetOutcome: string;
  instructions: string;
  /** Template with {{placeholders}} the composer fills. */
  scriptTemplate: string;
  minDurationSeconds: number;
  preferredDurationSeconds: number;
  maxDurationSeconds: number;
  guidanceDensity: GuidanceDensity;
  pausePattern: PausePattern;
  voiceRequirements: string | null;
  soundRequirements: string | null;
  silenceCompatible: boolean;
  contraindications: Contraindication[];
  evidenceLevel: EvidenceLevel;
  knowledgeKind: KnowledgeKind;
  supportingSourceIds: string[];
  requiredSkills: ProfessionalSkillKey[];
  reviewStatus: ReviewStatus;
  familiarityGroup: FamiliarityGroup;
  /** Internal provenance only — never surfaced in the consumer experience. */
  sourceTradition: SourceTradition;
  boundaryTags: BoundaryTag[];
  /** A "major" intervention counts against the one-unfamiliar-per-session rule. */
  major: boolean;
  tags: string[];
  version: number;
}

export interface PausePattern {
  /** Typical silence after each instruction, in seconds. */
  afterInstructionSeconds: number;
  /** Longest continuous pause this block invites. */
  maxPauseSeconds: number;
  /** Share of the block's duration spent not speaking, 0–1. */
  pauseRatio: number;
}

/* ------------------------------------------------------------------ */
/* 4. Preferences and boundaries                                        */
/* ------------------------------------------------------------------ */

export type PreferenceKey =
  | "more_silence"
  | "less_silence"
  | "more_body_awareness"
  | "less_body_awareness"
  | "more_structure"
  | "more_openness"
  | "more_scientific_language"
  | "more_poetic_language"
  | "spiritually_neutral"
  | "more_nature_imagery"
  | "less_visualisation"
  | "more_direct_guidance"
  | "more_invitational_guidance";

export type BoundaryKey =
  | "no_hypnotic_language"
  | "no_spiritual_terminology"
  | "no_visualisation"
  | "no_breath_retention"
  | "no_strong_breath_manipulation"
  | "no_pain_focus"
  | "no_sudden_sounds"
  | "avoid_voice"
  | "avoid_sound_type"
  | "avoid_theme"
  | "keep_predictable";

export type ConstraintScope = "always" | "this_session" | "evening" | "sleep_only" | "daytime";

export interface UserConstraint {
  id: string;
  userId: string;
  type: "hard" | "soft";
  key: BoundaryKey | PreferenceKey;
  /** e.g. a voice id for `avoid_voice`, or a strength for a preference. */
  value: string | number | boolean | null;
  reason: string | null;
  scope: ConstraintScope;
  createdAt: string;
  updatedAt: string;
}

/** Boundary → the intervention tags it removes from the candidate set. */
export const BOUNDARY_BLOCKS: Record<BoundaryKey, BoundaryTag[]> = {
  no_hypnotic_language: ["hypnotic_language"],
  no_spiritual_terminology: ["spiritual_terminology"],
  no_visualisation: ["visualisation"],
  no_breath_retention: ["breath_retention"],
  no_strong_breath_manipulation: ["strong_breath_manipulation", "breath_retention"],
  no_pain_focus: ["pain_focus"],
  no_sudden_sounds: ["sudden_sounds"],
  avoid_voice: [],
  avoid_sound_type: [],
  avoid_theme: [],
  keep_predictable: ["unpredictable_structure"],
};

/* ------------------------------------------------------------------ */
/* 5. Osora DNA                                                         */
/* ------------------------------------------------------------------ */

export interface OsoraDnaProfile {
  id: string;
  name: string;
  version: number;
  /** Stable elements — these keep every session recognisably Osora. */
  stable: {
    openingStyle: string;
    closingStyle: string;
    voiceIdentity: string;
    languageTone: string;
    pacingPrinciples: string;
    safetyFraming: string;
    soundIdentity: string;
    sessionGrammar: SectionKind[];
    familiarAnchor: string;
    emotionalAttitude: string;
    directiveness: Directiveness;
  };
  /** Adaptive elements — allowed to move per session, within bounds. */
  adaptive: {
    silenceRatioRange: [number, number];
    guidanceDensityRange: [GuidanceDensity, GuidanceDensity];
    allowedImageryThemes: string[];
    soundscapeOptions: string[];
    voiceIntensityRange: [number, number];
  };
  rules: {
    defaultFamiliarityRatio: number;
    defaultExplorationRatio: number;
    maxUnfamiliarMajorInterventions: number;
    maxSimultaneousDimensionChanges: number;
    explorationDropAfterNegative: number;
    explorationGrowthAfterPositive: number;
    minRecognisableStructureRatio: number;
    lockedSections: SectionKind[];
  };
  updatedAt: string;
}

export interface DnaScore {
  total: number;
  components: Array<{
    key: string;
    label: string;
    score: number;
    weight: number;
    detail: string;
  }>;
  warnings: string[];
}

/* ------------------------------------------------------------------ */
/* 6. State Engine I/O                                                  */
/* ------------------------------------------------------------------ */

export interface EngineInput {
  currentState: StateProfile;
  desired: DesiredStateInput;
  constraints: UserConstraint[];
  dna: OsoraDnaProfile;
  /** Familiarity groups this person has already met. */
  familiarGroups: FamiliarityGroup[];
  /** Intervention keys used recently, most recent first. */
  recentInterventionKeys: string[];
  /** Measured outcome bias per mechanism for this user, −1…+1. Capped in scoring. */
  outcomeBias: Partial<Record<MechanismKey, number>>;
  /** Production ceiling, e.g. narration length limits. */
  production: ProductionConstraints;
}

export interface ProductionConstraints {
  maxNarrationWords: number;
  minSectionSeconds: number;
  wordsPerMinute: number;
  availableVoiceIds: string[];
  availableSoundStyles: string[];
}

export type TraceDecision = "included" | "excluded" | "penalised" | "boosted" | "adjusted";

export interface TraceEntry {
  stage: "gate" | "score" | "select" | "allocate" | "sequence" | "explain";
  subject: string;
  decision: TraceDecision;
  reason: string;
  /** Non-null when the decision was driven by a hard constraint. */
  constraintKey?: string;
  delta?: number;
}

export interface MechanismRecommendation {
  mechanism: MechanismKey;
  score: number;
  share: number;
  seconds: number;
  rationale: string;
  evidenceLevel: EvidenceLevel;
}

export interface RankedIntervention {
  interventionKey: string;
  name: string;
  score: number;
  familiar: boolean;
  breakdown: Array<{ factor: string; value: number }>;
  eligible: boolean;
  exclusionReason: string | null;
}

export interface PlannedBlock {
  order: number;
  sectionKind: SectionKind;
  mechanism: MechanismKey;
  interventionKey: string | null;
  interventionName: string | null;
  seconds: number;
  familiar: boolean;
  rationale: string;
}

export interface SessionPlan {
  target: string;
  durationSeconds: number;
  familiarityRatio: number;
  explorationRatio: number;
  composition: Array<{ mechanism: MechanismKey; share: number }>;
  mechanisms: MechanismRecommendation[];
  rankedInterventions: RankedIntervention[];
  sequence: PlannedBlock[];
  voiceRecommendation: { voiceId: string; reason: string } | null;
  soundRecommendation: { style: string; intensity: number; reason: string } | null;
  silenceRatio: number;
  requiredReviews: ProfessionalSkillKey[];
  confidence: number;
  warnings: string[];
  trace: TraceEntry[];
}

/* ------------------------------------------------------------------ */
/* 7. Timeline                                                          */
/* ------------------------------------------------------------------ */

export type SectionKind =
  | "intention"
  | "opening"
  | "orientation"
  | "main"
  | "transition"
  | "breath"
  | "body"
  | "reflection"
  | "silence"
  | "sound_only"
  | "closing"
  | "aftercare"
  | "rationale"
  | "contraindications";

export interface TimelineSection {
  id: string;
  order: number;
  kind: SectionKind;
  title: string;
  mechanism: MechanismKey | null;
  interventionKey: string | null;
  evidenceSourceIds: string[];
  reviewStatus: ReviewStatus;
  text: string;
  wordCount: number;
  /** Words the composer is allowed to write for this section. */
  wordBudget: number;
  estimatedSpeechSeconds: number;
  actualSpeechSeconds: number | null;
  pauseSeconds: number;
  soundOnlySeconds: number;
  transitionSeconds: number;
  startSeconds: number;
  endSeconds: number;
}

export interface SectionTimeline {
  targetSeconds: number;
  totalSeconds: number;
  /** True once every section has a measured `actualSpeechSeconds`. */
  reconciled: boolean;
  sections: TimelineSection[];
}

/* ------------------------------------------------------------------ */
/* 8. Evidence, professionals, reviews                                  */
/* ------------------------------------------------------------------ */

export interface ScientificSource {
  id: string;
  title: string;
  authors: string[];
  year: number;
  publisher: string;
  doiOrUrl: string | null;
  sourceType: SourceType;
  abstract: string;
  summary: string;
  relevantFindings: string[];
  limitations: string[];
  evidenceQuality: EvidenceLevel;
  relevantMechanisms: MechanismKey[];
  relevantInterventionKeys: string[];
  targetPopulations: string[];
  contraindicationNotes: string[];
  reviewerNotes: string | null;
  documentPath: string | null;
  citation: string;
  verificationStatus: VerificationStatus;
  verifiedBy: string | null;
  addedAt: string;
}

export type EvidenceTargetType =
  | "mechanism"
  | "intervention"
  | "claim"
  | "session_section"
  | "safety_rule"
  | "contraindication"
  | "experiment";

export interface EvidenceLink {
  id: string;
  sourceId: string;
  targetType: EvidenceTargetType;
  targetId: string;
  knowledgeKind: KnowledgeKind;
  note: string | null;
}

export interface ProfessionalProfile {
  id: string;
  name: string;
  role: string;
  organisation: string;
  biography: string;
  skills: ProfessionalSkillKey[];
  certifications: string[];
  areasOfExpertise: string[];
  yearsOfExperience: number;
  languages: string[];
  reviewPermissions: ProfessionalSkillKey[];
  contributionCount: number;
  active: boolean;
  avatarInitials: string;
}

export type ReviewKind =
  | "internal"
  | "scientific"
  | "safety"
  | "professional"
  | "audio"
  | "sound_design";

export type ReviewDecision = "pending" | "approved" | "changes_requested" | "rejected";

export interface ReviewRequirement {
  id: string;
  experienceId: string;
  kind: ReviewKind;
  requiredSkill: ProfessionalSkillKey;
  reason: string;
  satisfiedByReviewId: string | null;
  blocking: boolean;
}

export interface Review {
  id: string;
  experienceId: string;
  kind: ReviewKind;
  reviewerId: string;
  reviewerName: string;
  skillUsed: ProfessionalSkillKey;
  decision: ReviewDecision;
  comment: string;
  createdAt: string;
}

export interface Comment {
  id: string;
  experienceId: string;
  sectionId: string | null;
  authorId: string;
  authorName: string;
  body: string;
  resolved: boolean;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* 9. Experiences                                                       */
/* ------------------------------------------------------------------ */

export type ExperienceStatus =
  | "idea"
  | "research"
  | "draft"
  | "composition"
  | "script_generation"
  | "audio_generation"
  | "internal_review"
  | "scientific_review"
  | "safety_review"
  | "audio_review"
  | "changes_requested"
  | "approved"
  | "published"
  | "archived";

export interface ComposerSettings {
  llmProvider: string;
  /** Which voice provider renders this session. Falls back to the server default. */
  ttsProvider?: string;
  llmModel: string;
  temperature: number;
  promptTemplate: string;
  professionalPerspective: ProfessionalSkillKey | null;
  voiceId: string;
  voiceStyle: string;
  language: string;
  speakingRate: number;
  voiceStability: number;
  soundModel: string;
  soundStyle: string;
  soundIntensity: number;
  targetSeconds: number;
  silenceRatio: number;
  fadeInSeconds: number;
  fadeOutSeconds: number;
  loudnessTargetLufs: number;
  familiarityRatio: number;
  explorationRatio: number;
}

export interface Experience {
  id: string;
  title: string;
  internalTitle: string;
  status: ExperienceStatus;
  currentState: StateProfile;
  desired: DesiredStateInput;
  targetOutcome: string;
  durationSeconds: number;
  plan: SessionPlan | null;
  timeline: SectionTimeline | null;
  settings: ComposerSettings;
  constraints: UserConstraint[];
  contributorIds: string[];
  requiredReviewSkills: ProfessionalSkillKey[];
  scientificConfidence: number;
  dnaProfileId: string;
  dnaScore: DnaScore | null;
  audioProjectId: string | null;
  experimentId: string | null;
  version: number;
  updatedAt: string;
  updatedBy: string;
  createdAt: string;
}

export interface ExperienceVersion {
  id: string;
  experienceId: string;
  version: number;
  label: string;
  authorName: string;
  createdAt: string;
  summary: string;
}

/* ------------------------------------------------------------------ */
/* 10. Rules                                                            */
/* ------------------------------------------------------------------ */

export type RuleSeverity = "information" | "recommendation" | "warning" | "blocking";

export type RuleScope =
  | "global"
  | "experience"
  | "mechanism"
  | "intervention"
  | "user_profile"
  | "experiment"
  | "session"
  | "audio_project";

export type RuleCategory =
  | "timing"
  | "safety"
  | "scientific_integrity"
  | "audio_quality"
  | "consistency"
  | "process"
  | "licensing";

export interface RuleDefinition {
  key: string;
  name: string;
  description: string;
  category: RuleCategory;
  scope: RuleScope;
  severity: RuleSeverity;
  /** Human-readable statement of the deterministic check. */
  logicSummary: string;
  errorMessage: string;
  suggestedCorrection: string;
  active: boolean;
  version: number;
  owner: string;
}

export interface RuleFinding {
  ruleKey: string;
  severity: RuleSeverity;
  passed: boolean;
  message: string;
  suggestion: string | null;
  subject: string | null;
}

export interface RuleResult extends RuleFinding {
  ruleName: string;
  category: RuleCategory;
  evaluatedAt: string;
}

/* ------------------------------------------------------------------ */
/* 11. Flow validation                                                  */
/* ------------------------------------------------------------------ */

export interface FlowScores {
  overall: number;
  timing: number;
  voicePacing: number;
  soundBalance: number;
  familiarity: number;
  scientificQuality: number;
  safety: number;
}

export interface FlowCheck {
  key: string;
  label: string;
  value: string;
  status: "ok" | "info" | "warning" | "blocking";
  detail: string;
}

export interface FlowAnalysis {
  scores: FlowScores;
  checks: FlowCheck[];
  warnings: string[];
  blockingErrors: string[];
  suggestions: string[];
  analysedAt: string;
}

/* ------------------------------------------------------------------ */
/* 12. Audio                                                            */
/* ------------------------------------------------------------------ */

export type AudioTrackKind =
  | "narration"
  | "ambient"
  | "music"
  | "sfx"
  | "breath_cue"
  | "silence"
  | "intro"
  | "outro";

export type AudioAssetStatus = "pending" | "generating" | "analysing" | "ready" | "failed";

export type AudioAssetOrigin = "generated" | "uploaded" | "processed";

export interface AudioAnalysis {
  durationSeconds: number;
  codec: string;
  bitrateKbps: number | null;
  sampleRate: number;
  channels: number;
  fileSizeBytes: number;
  peakDb: number | null;
  loudnessLufs: number | null;
  analysedAt: string;
  tool: string;
}

export interface AudioAsset {
  id: string;
  name: string;
  origin: AudioAssetOrigin;
  kind: AudioTrackKind;
  storagePath: string;
  format: string;
  status: AudioAssetStatus;
  /** What we asked the provider for — never trusted as the truth. */
  requestedDurationSeconds: number | null;
  /** What ffprobe actually measured. Required before status can be `ready`. */
  actualDurationSeconds: number | null;
  durationDeltaSeconds: number | null;
  analysis: AudioAnalysis | null;
  generationRunId: string | null;
  licence: string | null;
  error: string | null;
  createdAt: string;
}

export interface AudioClip {
  id: string;
  trackId: string;
  assetId: string | null;
  name: string;
  startSeconds: number;
  durationSeconds: number;
  /** Trim offsets into the source asset. */
  offsetSeconds: number;
  gainDb: number;
  fadeInSeconds: number;
  fadeOutSeconds: number;
  loop: boolean;
}

export interface AudioTrack {
  id: string;
  projectId: string;
  kind: AudioTrackKind;
  name: string;
  volumeDb: number;
  muted: boolean;
  solo: boolean;
  locked: boolean;
  clips: AudioClip[];
}

export interface AudioProject {
  id: string;
  experienceId: string | null;
  name: string;
  targetSeconds: number;
  /** Sum of the timeline as laid out; compared against `targetSeconds`. */
  arrangedSeconds: number;
  loudnessTargetLufs: number;
  tracks: AudioTrack[];
  exports: AudioExport[];
  updatedAt: string;
}

export interface AudioExport {
  id: string;
  format: "mp3" | "wav";
  assetId: string;
  createdAt: string;
  measuredSeconds: number | null;
}

export interface Voice {
  id: string;
  providerVoiceId: string;
  provider: string;
  name: string;
  description: string;
  gender: string;
  accent: string;
  languages: string[];
  warmth: number;
  pace: number;
  suitableFor: string[];
  previewAssetId: string | null;
  approved: boolean;
}

export interface SoundAsset {
  id: string;
  name: string;
  style: string;
  description: string;
  intensity: number;
  loopable: boolean;
  assetId: string | null;
  licence: string;
  approved: boolean;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* 13. Generation runs                                                  */
/* ------------------------------------------------------------------ */

export type GenerationCapability =
  | "outline"
  | "script"
  | "improve"
  | "alternative"
  | "compose"
  | "rank"
  | "perspective"
  | "claims"
  | "sources"
  | "contraindications"
  | "flow"
  | "tts"
  | "voice_preview"
  | "sound_effect"
  | "ambient";

export type GenerationStatus = "queued" | "running" | "succeeded" | "failed";

export interface GenerationRun {
  id: string;
  provider: string;
  capability: GenerationCapability;
  model: string;
  promptVersion: string;
  input: string;
  structuredConstraints: Record<string, unknown>;
  selectedMechanisms: MechanismKey[];
  selectedInterventionKeys: string[];
  professionalPerspective: ProfessionalSkillKey | null;
  output: string | null;
  settings: Record<string, unknown>;
  status: GenerationStatus;
  error: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  requestedAudioSeconds: number | null;
  actualAudioSeconds: number | null;
  costEstimateUsd: number | null;
  createdBy: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* 14. Experiments and outcomes                                         */
/* ------------------------------------------------------------------ */

export type ExperimentVariable =
  | "intervention_sequence"
  | "pause_duration"
  | "silence_ratio"
  | "voice"
  | "speaking_speed"
  | "guidance_density"
  | "direct_vs_invitational"
  | "ambient_vs_near_silence"
  | "body_first_vs_breath_first"
  | "opening_duration"
  | "closing_duration";

export type ExperimentStatus =
  | "design"
  | "review"
  | "running"
  | "paused"
  | "stopped"
  | "analysed";

export interface ExperimentVariant {
  id: string;
  label: string;
  isControl: boolean;
  description: string;
  settingsDelta: Record<string, string | number | boolean>;
  assignments: number;
  completions: number;
  meanPrimaryDelta: number | null;
}

export interface Experiment {
  id: string;
  name: string;
  hypothesis: string;
  eligiblePopulation: string;
  exclusionCriteria: string[];
  variable: ExperimentVariable;
  variants: ExperimentVariant[];
  primaryOutcome: DimensionKey;
  secondaryOutcomes: DimensionKey[];
  safetyGuardrails: string[];
  minimumSample: number;
  stopCondition: string;
  ownerId: string;
  ownerName: string;
  requiredReview: ReviewKind;
  status: ExperimentStatus;
  results: string | null;
  interpretation: string | null;
  startedAt: string | null;
  updatedAt: string;
}

export interface SessionOutcome {
  id: string;
  experienceId: string;
  userId: string;
  experimentVariantId: string | null;
  pre: StateProfile;
  post: StateProfile;
  completed: boolean;
  completionRatio: number;
  skipPoints: number[];
  replays: number;
  helpfulness: number;
  feltSafe: boolean;
  wouldRepeat: boolean;
  freeText: string | null;
  dislikes: string[];
  audioProblems: string[];
  context: { environment: SessionEnvironment; timeOfDay: string };
  recordedAt: string;
}

export interface OutcomeAttributionRow {
  key: string;
  label: string;
  sessions: number;
  meanDelta: number;
  meanHelpfulness: number;
  feltSafeRatio: number;
}

/* ------------------------------------------------------------------ */
/* 15. Identity                                                         */
/* ------------------------------------------------------------------ */

export type StudioRole =
  | "admin"
  | "creator"
  | "scientific_reviewer"
  | "professional_reviewer"
  | "safety_reviewer"
  | "sound_designer"
  | "audio_reviewer"
  | "experiment_owner"
  | "publisher"
  | "viewer";

export type Permission =
  | "experience.create"
  | "experience.edit"
  | "experience.publish"
  | "experience.archive"
  | "knowledge.edit"
  | "evidence.verify"
  | "review.scientific"
  | "review.safety"
  | "review.professional"
  | "review.audio"
  | "audio.edit"
  | "experiment.manage"
  | "settings.manage"
  | "read";

export interface StudioUser {
  id: string;
  name: string;
  email: string;
  roles: StudioRole[];
  professionalProfileId: string | null;
  initials: string;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  createdAt: string;
}
