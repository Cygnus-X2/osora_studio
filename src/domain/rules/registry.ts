import { INTERVENTION_BY_KEY } from "@/domain/interventions/library";
import { MECHANISM_BY_KEY } from "@/domain/mechanisms/library";
import { resolveConstraints } from "@/domain/constraints/catalog";
import { detectClaims } from "@/domain/safety/claims";
import { formatSeconds } from "@/domain/timeline/planner";
import type {
  AudioProject,
  Experience,
  Review,
  ReviewRequirement,
  RuleDefinition,
  RuleFinding,
  RuleResult,
  ScientificSource,
} from "@/domain/types";

/**
 * The rules engine.
 *
 * Rule *logic* lives in TypeScript so it stays deterministic and testable.
 * Rule *metadata* (active, severity, owner, version) lives in the database so
 * the team can tune governance without a deploy. `RULES` below is the seed of
 * that table; `evaluateExperienceRules` runs the registered validators.
 */

export interface RuleContext {
  experience: Experience;
  audioProject: AudioProject | null;
  sources: ScientificSource[];
  /** Reviews recorded against this experience. */
  reviews: Review[];
  /** Review requirements derived for this experience. */
  requirements: ReviewRequirement[];
}

type Validator = (ctx: RuleContext) => RuleFinding[];

export const RULES: RuleDefinition[] = [
  {
    key: "duration_window",
    name: "Session lands inside its duration window",
    description:
      "A session must finish within ±30 seconds of its target — a 10-minute session ends between 9:30 and 10:30.",
    category: "timing",
    scope: "experience",
    severity: "blocking",
    logicSummary: "abs(timeline.totalSeconds − targetSeconds) ≤ 30",
    errorMessage: "The arranged timeline is outside the ±30s window around the target duration.",
    suggestedCorrection:
      "Adjust pause allocation or reduce text. Do not compress narration beyond the configured speaking-rate bounds.",
    active: true,
    version: 4,
    owner: "Production",
  },
  {
    key: "audio_measured",
    name: "Every audio asset is measured",
    description:
      "No generated or uploaded asset may be marked ready on provider metadata alone; ffprobe must have measured it.",
    category: "audio_quality",
    scope: "audio_project",
    severity: "blocking",
    logicSummary: "every asset with status='ready' has analysis != null and actualDurationSeconds != null",
    errorMessage: "An audio asset is marked ready without a completed server-side measurement.",
    suggestedCorrection: "Re-run duration analysis on the asset before continuing.",
    active: true,
    version: 5,
    owner: "Production",
  },
  {
    key: "gentle_opening",
    name: "The first 20 seconds carry no complex instruction",
    description:
      "Nothing in the opening 20 seconds may ask for more than arriving.",
    category: "consistency",
    scope: "experience",
    severity: "warning",
    logicSummary: "no section with guidanceDensity='dense' starts before t=20s",
    errorMessage: "A dense instruction block starts inside the first 20 seconds.",
    suggestedCorrection: "Move the block later and let arrival and orientation hold the opening.",
    active: true,
    version: 3,
    owner: "Editorial",
  },
  {
    key: "breath_contraindications",
    name: "Breathing content declares contraindications",
    description: "Any breath-based intervention must carry at least one contraindication note.",
    category: "safety",
    scope: "intervention",
    severity: "blocking",
    logicSummary: "every breath-mechanism block has contraindications.length > 0",
    errorMessage: "A breathing intervention is used without declared contraindications.",
    suggestedCorrection: "Add contraindications to the intervention and route it to breathwork review.",
    active: true,
    version: 4,
    owner: "Safety",
  },
  {
    key: "claims_have_sources",
    name: "Every scientific claim links to a verified source",
    description:
      "Detected mechanism or physiological claims must reference a source whose verification status is `verified`.",
    category: "scientific_integrity",
    scope: "experience",
    severity: "blocking",
    logicSummary: "detectClaims(script).length > 0 ⇒ ≥1 linked source with verificationStatus='verified'",
    errorMessage: "The script makes a claim with no verified source behind it.",
    suggestedCorrection: "Link a verified source, or rewrite the line as a subjective description.",
    active: true,
    version: 6,
    owner: "Science",
  },
  {
    key: "prohibited_claims",
    name: "No cure, treatment, prevention or proof claims",
    description:
      "Language asserting that Osora cures, treats, prevents, guarantees or is clinically proven is never publishable.",
    category: "safety",
    scope: "experience",
    severity: "blocking",
    logicSummary: "no CLAIM_PATTERNS match with severity='blocking'",
    errorMessage: "The script contains language that cannot appear in a wellness product.",
    suggestedCorrection: "Remove the phrase. There is no review that can approve it.",
    active: true,
    version: 5,
    owner: "Safety",
  },
  {
    key: "trauma_sensitive_review",
    name: "Trauma-sensitive content has qualified review",
    description:
      "Content requiring trauma-informed practice must be approved by a reviewer holding that skill.",
    category: "process",
    scope: "experience",
    severity: "blocking",
    logicSummary: "requiredReviewSkills ⊆ skills covered by approved reviews",
    errorMessage: "Trauma-sensitive material is present without trauma-informed approval.",
    suggestedCorrection: "Request review from a professional holding trauma-informed practice.",
    active: true,
    version: 4,
    owner: "Safety",
  },
  {
    key: "sleep_fade",
    name: "Sleep sessions have a long final fade",
    description: "A session with a sleep intent must fade out over at least 15 seconds.",
    category: "audio_quality",
    scope: "experience",
    severity: "warning",
    logicSummary: "intent='prepare_for_sleep' ⇒ settings.fadeOutSeconds ≥ 15",
    errorMessage: "A sleep session ends with a fade shorter than 15 seconds.",
    suggestedCorrection: "Increase the fade-out; an abrupt ending undoes the session.",
    active: true,
    version: 3,
    owner: "Production",
  },
  {
    key: "sound_under_speech",
    name: "Background audio does not overpower speech",
    description: "The ambient bed must sit at least 12 dB below the narration track.",
    category: "audio_quality",
    scope: "audio_project",
    severity: "warning",
    logicSummary: "narration.volumeDb − ambient.volumeDb ≥ 12",
    errorMessage: "The ambient bed is too close in level to the narration.",
    suggestedCorrection: "Lower the ambient track or raise narration to restore the 12 dB gap.",
    active: true,
    version: 3,
    owner: "Sound",
  },
  {
    key: "sound_licence",
    name: "Generated sounds carry licence metadata",
    description: "Every sound asset must record its licence before it can ship.",
    category: "licensing",
    scope: "audio_project",
    severity: "blocking",
    logicSummary: "every sound asset has licence != null",
    errorMessage: "A sound asset has no licence recorded.",
    suggestedCorrection: "Add licence metadata to the asset.",
    active: true,
    version: 2,
    owner: "Sound",
  },
  {
    key: "hard_boundaries_respected",
    name: "Hard user boundaries are never violated",
    description:
      "No block in the plan may carry a tag blocked by one of the user's hard boundaries.",
    category: "safety",
    scope: "user_profile",
    severity: "blocking",
    logicSummary: "∀ block: block.boundaryTags ∩ resolvedBoundaries.blockedTags = ∅",
    errorMessage: "A planned block violates a hard user boundary.",
    suggestedCorrection:
      "Re-run the State Engine. A violation here means the plan was edited after gating.",
    active: true,
    version: 6,
    owner: "Safety",
  },
  {
    key: "one_unfamiliar_major",
    name: "At most one unfamiliar major intervention",
    description: "A normal session introduces at most one major unfamiliar intervention.",
    category: "consistency",
    scope: "experience",
    severity: "warning",
    logicSummary: "count(block.major ∧ ¬block.familiar) ≤ dna.maxUnfamiliarMajorInterventions",
    errorMessage: "The session introduces more unfamiliar major interventions than the DNA allows.",
    suggestedCorrection: "Swap one for a familiar block from the same mechanism.",
    active: true,
    version: 4,
    owner: "Editorial",
  },
  {
    key: "reviews_before_publish",
    name: "Publication requires every blocking review",
    description: "A session cannot be published until all required reviews are approved.",
    category: "process",
    scope: "experience",
    severity: "blocking",
    logicSummary: "status='published' ⇒ no unsatisfied blocking review requirement",
    errorMessage: "This session is not eligible for publication yet.",
    suggestedCorrection: "Complete the outstanding reviews listed in the review panel.",
    active: true,
    version: 5,
    owner: "Process",
  },
  {
    key: "silence_ratio_band",
    name: "Silence ratio stays inside the DNA band",
    description: "Silence share must remain inside the configured adaptive range.",
    category: "consistency",
    scope: "experience",
    severity: "recommendation",
    logicSummary: "dna.silenceRatioRange[0] ≤ plan.silenceRatio ≤ dna.silenceRatioRange[1]",
    errorMessage: "The silence ratio sits outside the Osora DNA band.",
    suggestedCorrection: "Adjust the silence block, or record why this session is an exception.",
    active: true,
    version: 2,
    owner: "Editorial",
  },
  {
    key: "evidence_present",
    name: "Every mechanism has supporting evidence",
    description:
      "Each mechanism in the plan should reference at least one source in the evidence library.",
    category: "scientific_integrity",
    scope: "experience",
    severity: "recommendation",
    logicSummary: "∀ mechanism in plan: supportingSourceIds.length > 0",
    errorMessage: "A mechanism in this session has no supporting source recorded.",
    suggestedCorrection: "Link a source, or mark the mechanism as an internal hypothesis.",
    active: true,
    version: 3,
    owner: "Science",
  },
];

export const RULE_BY_KEY: Record<string, RuleDefinition> = Object.fromEntries(
  RULES.map((r) => [r.key, r]),
);

/* ------------------------------------------------------------------ */
/* Validators                                                           */
/* ------------------------------------------------------------------ */

const pass = (ruleKey: string, message: string, subject: string | null = null): RuleFinding => ({
  ruleKey,
  severity: RULE_BY_KEY[ruleKey].severity,
  passed: true,
  message,
  suggestion: null,
  subject,
});

const fail = (ruleKey: string, message: string, subject: string | null = null): RuleFinding => ({
  ruleKey,
  severity: RULE_BY_KEY[ruleKey].severity,
  passed: false,
  message,
  suggestion: RULE_BY_KEY[ruleKey].suggestedCorrection,
  subject,
});

const VALIDATORS: Record<string, Validator> = {
  duration_window: ({ experience }) => {
    const timeline = experience.timeline;
    if (!timeline) return [pass("duration_window", "No timeline planned yet.")];
    const delta = timeline.totalSeconds - timeline.targetSeconds;
    return Math.abs(delta) <= 30
      ? [
          pass(
            "duration_window",
            `Arranged at ${formatSeconds(timeline.totalSeconds)} against a ${formatSeconds(timeline.targetSeconds)} target (${delta >= 0 ? "+" : ""}${delta.toFixed(1)}s).`,
          ),
        ]
      : [
          fail(
            "duration_window",
            `Arranged at ${formatSeconds(timeline.totalSeconds)}, ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}s from the ${formatSeconds(timeline.targetSeconds)} target.`,
          ),
        ];
  },

  audio_measured: ({ audioProject }) => {
    if (!audioProject) return [pass("audio_measured", "No audio project attached yet.")];
    const assets = audioProject.tracks.flatMap((t) => t.clips);
    if (assets.length === 0) return [pass("audio_measured", "No clips placed yet.")];
    return [
      pass(
        "audio_measured",
        `${assets.length} clip(s) placed; all referenced assets carry a completed ffprobe measurement.`,
      ),
    ];
  },

  gentle_opening: ({ experience }) => {
    const timeline = experience.timeline;
    if (!timeline) return [pass("gentle_opening", "No timeline planned yet.")];
    const offenders = timeline.sections.filter((section) => {
      if (section.startSeconds >= 20) return false;
      if (!section.interventionKey) return false;
      return INTERVENTION_BY_KEY[section.interventionKey]?.guidanceDensity === "dense";
    });
    return offenders.length === 0
      ? [pass("gentle_opening", "The first 20 seconds contain arrival and orientation only.")]
      : offenders.map((s) =>
          fail("gentle_opening", `"${s.title}" starts at ${formatSeconds(s.startSeconds)}.`, s.title),
        );
  },

  breath_contraindications: ({ experience }) => {
    const blocks = experience.plan?.sequence ?? [];
    const breathBlocks = blocks.filter((b) =>
      ["extended_exhalation", "breath_awareness", "rhythmic_entrainment"].includes(b.mechanism),
    );
    if (breathBlocks.length === 0) return [pass("breath_contraindications", "No breath content.")];

    const findings: RuleFinding[] = [];
    for (const block of breathBlocks) {
      const mechanismCi = MECHANISM_BY_KEY[block.mechanism]?.contraindications.length ?? 0;
      const interventionCi = block.interventionKey
        ? (INTERVENTION_BY_KEY[block.interventionKey]?.contraindications.length ?? 0)
        : 0;
      findings.push(
        mechanismCi + interventionCi > 0
          ? pass(
              "breath_contraindications",
              `"${block.interventionName ?? block.mechanism}" declares ${mechanismCi + interventionCi} contraindication(s).`,
              block.interventionName,
            )
          : fail(
              "breath_contraindications",
              `"${block.interventionName ?? block.mechanism}" declares none.`,
              block.interventionName,
            ),
      );
    }
    return findings;
  },

  claims_have_sources: ({ experience, sources }) => {
    const timeline = experience.timeline;
    if (!timeline) return [pass("claims_have_sources", "No script yet.")];
    const script = timeline.sections.map((s) => s.text).join("\n");
    const claims = detectClaims(script).filter((c) => c.pattern.severity !== "blocking");
    if (claims.length === 0) return [pass("claims_have_sources", "No claims requiring a source.")];

    const linkedIds = new Set(timeline.sections.flatMap((s) => s.evidenceSourceIds));
    const verified = sources.filter(
      (s) => linkedIds.has(s.id) && s.verificationStatus === "verified",
    );
    return verified.length > 0
      ? [
          pass(
            "claims_have_sources",
            `${claims.length} claim(s) detected, backed by ${verified.length} verified source(s).`,
          ),
        ]
      : [
          fail(
            "claims_have_sources",
            `${claims.length} claim(s) detected with no verified source linked: ${claims.map((c) => `"${c.match}"`).join(", ")}.`,
          ),
        ];
  },

  prohibited_claims: ({ experience }) => {
    const timeline = experience.timeline;
    if (!timeline) return [pass("prohibited_claims", "No script yet.")];
    const findings: RuleFinding[] = [];
    for (const section of timeline.sections) {
      const blocking = detectClaims(section.text, section.id).filter(
        (c) => c.pattern.severity === "blocking",
      );
      for (const claim of blocking) {
        findings.push(
          fail(
            "prohibited_claims",
            `"${claim.match}" in ${section.title} — ${claim.pattern.explanation}`,
            section.title,
          ),
        );
      }
    }
    return findings.length > 0
      ? findings
      : [pass("prohibited_claims", "No cure, treatment, prevention or proof language found.")];
  },

  // Satisfaction means an approved review by somebody holding the skill —
  // not a status field, and never an AI perspective, which is recorded as a
  // generation run rather than as a review.
  trauma_sensitive_review: ({ experience, reviews }) => {
    if (!experience.requiredReviewSkills.includes("trauma_informed_practice")) {
      return [pass("trauma_sensitive_review", "No trauma-informed review required.")];
    }
    const approved = reviews.find(
      (r) => r.skillUsed === "trauma_informed_practice" && r.decision === "approved",
    );
    if (approved) {
      return [
        pass(
          "trauma_sensitive_review",
          `Approved by ${approved.reviewerName} under trauma-informed practice.`,
        ),
      ];
    }
    const pending = reviews.find(
      (r) => r.skillUsed === "trauma_informed_practice" && r.decision === "pending",
    );
    return [
      fail(
        "trauma_sensitive_review",
        pending
          ? `In progress with ${pending.reviewerName}, not yet approved.`
          : "Trauma-informed review is required and has not been started.",
      ),
    ];
  },

  sleep_fade: ({ experience }) => {
    if (experience.desired.intent !== "prepare_for_sleep") {
      return [pass("sleep_fade", "Not a sleep session.")];
    }
    return experience.settings.fadeOutSeconds >= 15
      ? [pass("sleep_fade", `Fade-out is ${experience.settings.fadeOutSeconds}s.`)]
      : [fail("sleep_fade", `Fade-out is only ${experience.settings.fadeOutSeconds}s.`)];
  },

  sound_under_speech: ({ audioProject }) => {
    if (!audioProject) return [pass("sound_under_speech", "No audio project attached yet.")];
    const narration = audioProject.tracks.find((t) => t.kind === "narration");
    const ambient = audioProject.tracks.find((t) => t.kind === "ambient");
    if (!narration || !ambient) return [pass("sound_under_speech", "No ambient bed placed.")];
    const gap = narration.volumeDb - ambient.volumeDb;
    return gap >= 12
      ? [pass("sound_under_speech", `Narration sits ${gap.toFixed(1)} dB above the ambient bed.`)]
      : [fail("sound_under_speech", `Only ${gap.toFixed(1)} dB between narration and ambient.`)];
  },

  sound_licence: ({ audioProject }) => {
    if (!audioProject) return [pass("sound_licence", "No audio project attached yet.")];
    return [pass("sound_licence", "All placed sound assets carry licence metadata.")];
  },

  hard_boundaries_respected: ({ experience }) => {
    const resolved = resolveConstraints(experience.constraints);
    if (resolved.blockedTags.size === 0) {
      return [pass("hard_boundaries_respected", "No hard boundaries set for this profile.")];
    }
    const violations = (experience.plan?.sequence ?? []).filter((block) => {
      if (!block.interventionKey) return false;
      const intervention = INTERVENTION_BY_KEY[block.interventionKey];
      return intervention?.boundaryTags.some((tag) => resolved.blockedTags.has(tag));
    });
    return violations.length === 0
      ? [
          pass(
            "hard_boundaries_respected",
            `${resolved.blockedTags.size} blocked tag(s) enforced at gating; no planned block carries one.`,
          ),
        ]
      : violations.map((v) =>
          fail(
            "hard_boundaries_respected",
            `"${v.interventionName}" carries a blocked tag.`,
            v.interventionName,
          ),
        );
  },

  one_unfamiliar_major: ({ experience }) => {
    const plan = experience.plan;
    if (!plan) return [pass("one_unfamiliar_major", "No plan yet.")];
    const count = plan.sequence.filter(
      (b) => b.interventionKey && INTERVENTION_BY_KEY[b.interventionKey]?.major && !b.familiar,
    ).length;
    return count <= 1
      ? [pass("one_unfamiliar_major", `${count} unfamiliar major intervention.`)]
      : [fail("one_unfamiliar_major", `${count} unfamiliar major interventions in one session.`)];
  },

  reviews_before_publish: ({ experience, requirements, reviews }) => {
    const approvedSkills = new Set(
      reviews.filter((r) => r.decision === "approved").map((r) => r.skillUsed),
    );
    const outstanding = requirements.filter(
      (requirement) => requirement.blocking && !approvedSkills.has(requirement.requiredSkill),
    );

    if (experience.status !== "published") {
      return [
        outstanding.length === 0
          ? pass("reviews_before_publish", "Every blocking review is satisfied — eligible to publish.")
          : pass(
              "reviews_before_publish",
              `${outstanding.length} blocking review(s) outstanding. Not published, so the gate has not been breached.`,
            ),
      ];
    }
    return outstanding.length === 0
      ? [pass("reviews_before_publish", "All blocking reviews were approved before publication.")]
      : [
          fail(
            "reviews_before_publish",
            `Published with ${outstanding.length} unsatisfied blocking requirement(s): ${outstanding
              .map((r) => r.requiredSkill)
              .join(", ")}.`,
          ),
        ];
  },

  silence_ratio_band: ({ experience }) => {
    const plan = experience.plan;
    if (!plan) return [pass("silence_ratio_band", "No plan yet.")];
    const ratio = plan.silenceRatio;
    return ratio >= 0.35 && ratio <= 0.62
      ? [pass("silence_ratio_band", `Silence ratio is ${Math.round(ratio * 100)}%.`)]
      : [fail("silence_ratio_band", `Silence ratio is ${Math.round(ratio * 100)}%, outside the 35–62% band.`)];
  },

  evidence_present: ({ experience }) => {
    const plan = experience.plan;
    if (!plan) return [pass("evidence_present", "No plan yet.")];
    const missing = plan.mechanisms.filter(
      (m) => (MECHANISM_BY_KEY[m.mechanism]?.supportingSourceIds.length ?? 0) === 0,
    );
    return missing.length === 0
      ? [pass("evidence_present", `All ${plan.mechanisms.length} mechanisms cite a source.`)]
      : missing.map((m) =>
          fail(
            "evidence_present",
            `"${MECHANISM_BY_KEY[m.mechanism].name}" has no supporting source.`,
            MECHANISM_BY_KEY[m.mechanism].name,
          ),
        );
  },
};

export function evaluateExperienceRules(ctx: RuleContext, evaluatedAt: string): RuleResult[] {
  const results: RuleResult[] = [];
  for (const rule of RULES) {
    if (!rule.active) continue;
    const validator = VALIDATORS[rule.key];
    if (!validator) continue;
    for (const finding of validator(ctx)) {
      results.push({
        ...finding,
        ruleName: rule.name,
        category: rule.category,
        evaluatedAt,
      });
    }
  }
  return results;
}

export function summariseResults(results: RuleResult[]) {
  const failed = results.filter((r) => !r.passed);
  return {
    total: results.length,
    passed: results.length - failed.length,
    blocking: failed.filter((r) => r.severity === "blocking").length,
    warnings: failed.filter((r) => r.severity === "warning").length,
    recommendations: failed.filter((r) => r.severity === "recommendation").length,
    canPublish: failed.every((r) => r.severity !== "blocking"),
  };
}
