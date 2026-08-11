import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type {
  AudioAssetStatus,
  EvidenceLevel,
  ExperienceStatus,
  KnowledgeKind,
  ReviewStatus,
  RuleSeverity,
  VerificationStatus,
} from "@/domain/types";

type Tone = NonNullable<BadgeProps["tone"]>;

/* ---------------------------------------------------------------- */
/* Status badges                                                     */
/* ---------------------------------------------------------------- */

const EXPERIENCE_STATUS: Record<ExperienceStatus, { label: string; tone: Tone }> = {
  idea: { label: "Idea", tone: "outline" },
  research: { label: "Research", tone: "stone" },
  draft: { label: "Draft", tone: "stone" },
  composition: { label: "Composition", tone: "sand" },
  script_generation: { label: "Script generation", tone: "sand" },
  audio_generation: { label: "Audio generation", tone: "sand" },
  internal_review: { label: "Internal review", tone: "slate" },
  scientific_review: { label: "Scientific review", tone: "slate" },
  safety_review: { label: "Safety review", tone: "rust" },
  audio_review: { label: "Audio review", tone: "slate" },
  changes_requested: { label: "Changes requested", tone: "amber" },
  approved: { label: "Approved", tone: "sage" },
  published: { label: "Published", tone: "sage" },
  archived: { label: "Archived", tone: "outline" },
};

export function ExperienceStatusBadge({ status }: { status: ExperienceStatus }) {
  const entry = EXPERIENCE_STATUS[status];
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}

const REVIEW_STATUS: Record<ReviewStatus, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "stone" },
  in_review: { label: "In review", tone: "slate" },
  changes_requested: { label: "Changes requested", tone: "amber" },
  approved: { label: "Approved", tone: "sage" },
  retired: { label: "Retired", tone: "outline" },
};

export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  const entry = REVIEW_STATUS[status];
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}

/* ---------------------------------------------------------------- */
/* Evidence and provenance                                           */
/* ---------------------------------------------------------------- */

const EVIDENCE: Record<EvidenceLevel, { label: string; tone: Tone }> = {
  strong: { label: "Strong", tone: "sage" },
  moderate: { label: "Moderate", tone: "sage" },
  preliminary: { label: "Preliminary", tone: "sand" },
  expert_consensus: { label: "Expert consensus", tone: "slate" },
  traditional_practice: { label: "Traditional practice", tone: "stone" },
  internal_hypothesis: { label: "Internal hypothesis", tone: "amber" },
  unverified: { label: "Unverified", tone: "rust" },
};

export function EvidenceBadge({ level }: { level: EvidenceLevel }) {
  const entry = EVIDENCE[level];
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}

/**
 * Provenance is the most important distinction in the whole product, so it
 * gets its own visual language rather than sharing the status palette.
 */
const KNOWLEDGE: Record<KnowledgeKind, { label: string; tone: Tone }> = {
  scientific_evidence: { label: "Scientific evidence", tone: "sage" },
  expert_opinion: { label: "Expert opinion", tone: "slate" },
  traditional_practice: { label: "Traditional practice", tone: "stone" },
  internal_hypothesis: { label: "Internal hypothesis", tone: "amber" },
  ai_suggestion: { label: "AI suggestion — draft only", tone: "rust" },
};

export function KnowledgeBadge({ kind }: { kind: KnowledgeKind }) {
  const entry = KNOWLEDGE[kind];
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}

const VERIFICATION: Record<VerificationStatus, { label: string; tone: Tone }> = {
  unverified: { label: "Unverified", tone: "amber" },
  in_verification: { label: "In verification", tone: "slate" },
  verified: { label: "Verified", tone: "sage" },
  disputed: { label: "Disputed", tone: "rust" },
};

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  const entry = VERIFICATION[status];
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}

const SEVERITY: Record<RuleSeverity, { label: string; tone: Tone }> = {
  information: { label: "Information", tone: "outline" },
  recommendation: { label: "Recommendation", tone: "stone" },
  warning: { label: "Warning", tone: "amber" },
  blocking: { label: "Blocking", tone: "rust" },
};

export function SeverityBadge({ severity }: { severity: RuleSeverity }) {
  const entry = SEVERITY[severity];
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}

const ASSET_STATUS: Record<AudioAssetStatus, { label: string; tone: Tone }> = {
  pending: { label: "Pending", tone: "outline" },
  generating: { label: "Generating", tone: "sand" },
  analysing: { label: "Measuring", tone: "slate" },
  ready: { label: "Ready", tone: "sage" },
  failed: { label: "Failed", tone: "rust" },
};

export function AssetStatusBadge({ status }: { status: AudioAssetStatus }) {
  const entry = ASSET_STATUS[status];
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}

/* ---------------------------------------------------------------- */
/* Numbers                                                           */
/* ---------------------------------------------------------------- */

export function ScoreBar({
  label,
  value,
  hint,
}: {
  label: string;
  /** 0–1 */
  value: number;
  hint?: string;
}) {
  const tone = value >= 0.8 ? "sage" : value >= 0.6 ? "clay" : value >= 0.4 ? "amber" : "rust";
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[13px] text-ink-soft">{label}</span>
        <span className="font-mono text-[12px] tabular-nums text-ink-muted">
          {(value * 100).toFixed(0)}
        </span>
      </div>
      <Progress value={value * 100} tone={tone} size="sm" label={label} />
      {hint && <p className="mt-1 text-[11px] leading-4 text-ink-faint">{hint}</p>}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warning" | "danger" | "good";
}) {
  const toneClass = {
    default: "text-ink",
    warning: "text-amber",
    danger: "text-rust",
    good: "text-sage",
  }[tone];

  return (
    <div>
      <p className="label-eyebrow">{label}</p>
      <p className={cn("mt-1 font-mono text-xl tabular-nums tracking-tight", toneClass)}>{value}</p>
      {hint && <p className="mt-0.5 text-[12px] leading-4 text-ink-muted">{hint}</p>}
    </div>
  );
}

export function DeltaValue({
  seconds,
  tolerance = 30,
}: {
  seconds: number | null;
  tolerance?: number;
}) {
  if (seconds === null) {
    return <span className="font-mono text-[12px] text-ink-faint">—</span>;
  }
  const within = Math.abs(seconds) <= tolerance;
  return (
    <span
      className={cn(
        "font-mono text-[12px] tabular-nums",
        within ? "text-ink-muted" : seconds > 0 ? "text-amber" : "text-rust",
      )}
    >
      {seconds >= 0 ? "+" : ""}
      {seconds.toFixed(1)}s
    </span>
  );
}
