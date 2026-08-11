import { validateFlow } from "@/domain/flow/validate";
import { evaluateExperienceRules, summariseResults } from "@/domain/rules/registry";
import {
  attributionByDuration,
  attributionByIntervention,
  attributionByMechanism,
  attributionBySequence,
  attributionBySilenceRatio,
  attributionBySoundStyle,
  attributionByVoice,
  dimensionDeltas,
  summariseOutcomes,
} from "@/domain/outcomes/attribution";
import type { Experience, FlowAnalysis, RuleResult } from "@/domain/types";
import { AUDIO_ASSETS, SOUND_ASSETS, VOICES } from "./seed/audio-library";
import { OSORA_DNA } from "./seed/dna";
import { EVIDENCE_LINKS, SCIENTIFIC_SOURCES } from "./seed/evidence";
import { EXPERIENCES, EXPERIENCE_BY_ID, EXPERIENCE_VERSIONS, USER_CONSTRAINT_SETS } from "./seed/experiences";
import { EXPERIMENTS, SESSION_OUTCOMES } from "./seed/experiments";
import { CURRENT_USER_ID, MOCK_USERS, PROFESSIONALS } from "./seed/people";
import {
  AUDIO_PROJECTS,
  AUDIO_PROJECT_BY_ID,
  AUDIT_LOG,
  COMMENTS,
  GENERATION_RUNS,
  REVIEWS,
  REVIEW_REQUIREMENTS,
} from "./seed/studio";

/**
 * Read model for the studio.
 *
 * The first milestone runs on seeded data, but every derived value here —
 * rule results, flow analysis, outcome attribution — is computed by the real
 * domain engines rather than hard-coded. Swapping this module for Supabase
 * queries changes where the rows come from and nothing else.
 */

export const store = {
  currentUser: () => MOCK_USERS.find((u) => u.id === CURRENT_USER_ID) ?? MOCK_USERS[0],
  users: () => MOCK_USERS,
  professionals: () => PROFESSIONALS,
  dna: () => OSORA_DNA,
  sources: () => SCIENTIFIC_SOURCES,
  evidenceLinks: () => EVIDENCE_LINKS,
  experiences: () => EXPERIENCES,
  experience: (id: string): Experience | undefined => EXPERIENCE_BY_ID[id],
  experienceVersions: (id: string) =>
    EXPERIENCE_VERSIONS.filter((v) => v.experienceId === id).sort((a, b) => b.version - a.version),
  constraintSets: () => USER_CONSTRAINT_SETS,
  experiments: () => EXPERIMENTS,
  outcomes: () => SESSION_OUTCOMES,
  voices: () => VOICES,
  sounds: () => SOUND_ASSETS,
  audioAssets: () => AUDIO_ASSETS,
  audioProjects: () => AUDIO_PROJECTS,
  audioProject: (id: string | null) => (id ? AUDIO_PROJECT_BY_ID[id] : undefined),
  generationRuns: () => GENERATION_RUNS,
  reviews: () => REVIEWS,
  reviewRequirements: () => REVIEW_REQUIREMENTS,
  comments: (experienceId?: string) =>
    experienceId ? COMMENTS.filter((c) => c.experienceId === experienceId) : COMMENTS,
  auditLog: () => AUDIT_LOG,
};

/** Fixed clock so seeded rule and flow results stay stable across renders. */
const EVALUATED_AT = "2026-08-06T09:00:00.000Z";

const ruleCache = new Map<string, RuleResult[]>();

export function ruleResultsFor(experience: Experience): RuleResult[] {
  const cached = ruleCache.get(experience.id);
  if (cached) return cached;

  const results = evaluateExperienceRules(
    {
      experience,
      audioProject: store.audioProject(experience.audioProjectId) ?? null,
      sources: SCIENTIFIC_SOURCES,
      reviews: REVIEWS.filter((r) => r.experienceId === experience.id),
      requirements: REVIEW_REQUIREMENTS.filter((r) => r.experienceId === experience.id),
    },
    EVALUATED_AT,
  );
  ruleCache.set(experience.id, results);
  return results;
}

export function ruleSummaryFor(experience: Experience) {
  return summariseResults(ruleResultsFor(experience));
}

const flowCache = new Map<string, FlowAnalysis | null>();

export function flowAnalysisFor(experience: Experience): FlowAnalysis | null {
  const cached = flowCache.get(experience.id);
  if (cached !== undefined) return cached;

  if (!experience.plan || !experience.timeline) {
    flowCache.set(experience.id, null);
    return null;
  }

  const project = store.audioProject(experience.audioProjectId) ?? null;
  const narration = project?.tracks.find((t) => t.kind === "narration");
  const ambient = project?.tracks.find((t) => t.kind === "ambient");

  const analysis = validateFlow(
    {
      plan: experience.plan,
      timeline: experience.timeline,
      dna: OSORA_DNA,
      audioProject: project,
      fadeOutSeconds: experience.settings.fadeOutSeconds,
      narrationVolumeDb: narration?.volumeDb ?? 0,
      ambientVolumeDb: ambient?.volumeDb ?? -14,
    },
    EVALUATED_AT,
  );
  flowCache.set(experience.id, analysis);
  return analysis;
}

export function outcomeAttribution() {
  const input = { outcomes: SESSION_OUTCOMES, experiences: EXPERIENCES };
  return {
    summary: summariseOutcomes(SESSION_OUTCOMES),
    dimensions: dimensionDeltas(SESSION_OUTCOMES),
    byMechanism: attributionByMechanism(input),
    byIntervention: attributionByIntervention(input),
    bySequence: attributionBySequence(input),
    byVoice: attributionByVoice(input),
    bySoundStyle: attributionBySoundStyle(input),
    bySilenceRatio: attributionBySilenceRatio(input),
    byDuration: attributionByDuration(input),
  };
}

/** Everything the dashboard needs, computed from the same engines as the detail screens. */
export function dashboardData() {
  const experiences = store.experiences();

  const recentlyEdited = [...experiences]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 5);

  const awaitingReview = experiences.filter((e) =>
    ["internal_review", "scientific_review", "safety_review", "audio_review"].includes(e.status),
  );

  const failedValidations = experiences
    .map((experience) => ({
      experience,
      failures: ruleResultsFor(experience).filter(
        (r) => !r.passed && (r.severity === "blocking" || r.severity === "warning"),
      ),
    }))
    .filter((entry) => entry.failures.length > 0)
    .sort((a, b) => b.failures.length - a.failures.length);

  const missingEvidence = experiences.filter((experience) =>
    ruleResultsFor(experience).some((r) => r.ruleKey === "evidence_present" && !r.passed),
  );

  const durationMismatches = store
    .audioProjects()
    .map((project) => ({
      project,
      delta: Number((project.arrangedSeconds - project.targetSeconds).toFixed(1)),
    }))
    .filter((entry) => Math.abs(entry.delta) > 30);

  const unmeasuredAssets = store
    .audioAssets()
    .filter((a) => a.status !== "ready" || a.actualDurationSeconds === null);

  const activeExperiments = store.experiments().filter((e) => e.status === "running");

  const recentAssets = [...store.audioAssets()]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 5);

  return {
    recentlyEdited,
    awaitingReview,
    failedValidations,
    missingEvidence,
    durationMismatches,
    unmeasuredAssets,
    activeExperiments,
    recentAssets,
    outcomes: outcomeAttribution(),
    auditLog: store.auditLog().slice(0, 6),
  };
}

/** Review queue rows, joined across requirements, reviews and skills. */
export function reviewQueue() {
  return store
    .reviewRequirements()
    .map((requirement) => {
      const experience = store.experience(requirement.experienceId);
      const review = requirement.satisfiedByReviewId
        ? store.reviews().find((r) => r.id === requirement.satisfiedByReviewId)
        : store
            .reviews()
            .find(
              (r) =>
                r.experienceId === requirement.experienceId &&
                r.skillUsed === requirement.requiredSkill,
            );

      const qualified = store
        .professionals()
        .filter((p) => p.active && p.reviewPermissions.includes(requirement.requiredSkill));

      return { requirement, experience, review, qualified };
    })
    .filter((row) => row.experience !== undefined)
    .sort((a, b) => {
      const aDone = a.review?.decision === "approved" ? 1 : 0;
      const bDone = b.review?.decision === "approved" ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return Number(b.requirement.blocking) - Number(a.requirement.blocking);
    });
}
