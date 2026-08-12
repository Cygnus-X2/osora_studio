import { AlertTriangle, Bot } from "lucide-react";
import { PageHeader, SectionHeading } from "@/components/studio/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { store } from "@/data/store";
import { allExperiences } from "@/data/source";
import { SKILL_LABELS } from "@/data/seed/people";
import type { ProfessionalSkillKey } from "@/domain/types";

export const metadata = { title: "Professionals · Osora Studio" };

/** Cases where the platform will refuse to publish without a matching skill. */
const SKILL_TRIGGERS: Array<{ trigger: string; skill: ProfessionalSkillKey }> = [
  { trigger: "A trauma-sensitive intervention is present", skill: "trauma_informed_practice" },
  { trigger: "A breathing protocol makes a physiological claim", skill: "scientific_research" },
  { trigger: "Any breath-based block at all", skill: "breathwork" },
  { trigger: "A sound journey or rhythmic bed", skill: "sound_design" },
  { trigger: "The session has a sleep intent", skill: "sleep_science" },
  { trigger: "Attention is directed near a painful region", skill: "pain_science" },
  { trigger: "The script names a clinical construct", skill: "medical_review" },
  { trigger: "Cognitive or emotional-exposure content", skill: "clinical_psychology" },
];

export default async function ProfessionalsPage() {
  const professionals = store.professionals();
  const requirements = store.reviewRequirements();
  const experiences = await allExperiences();

  // A requirement with no active, permitted professional is a real gap.
  const coverage = SKILL_TRIGGERS.map((entry) => {
    const qualified = professionals.filter(
      (p) => p.active && p.reviewPermissions.includes(entry.skill),
    );
    return { ...entry, qualified };
  });
  const gaps = coverage.filter((c) => c.qualified.length === 0);

  return (
    <>
      <PageHeader
        eyebrow="Professional skills"
        title="Professionals"
        description="Review is skill-matched, not seniority-matched. A reviewer may approve only within the skills they hold, and the platform blocks publication when a required skill has nobody behind it."
        actions={<Button variant="outline">Add professional</Button>}
      />

      <div className="mb-8 flex items-start gap-3 rounded-lg border border-rust/20 bg-rust-soft/50 p-4">
        <Bot className="mt-0.5 size-4 shrink-0 text-rust" />
        <div className="text-[13px] leading-6 text-ink-soft">
          <p className="font-medium text-ink">
            An AI-generated professional perspective is an editorial tool.
          </p>
          <p className="mt-0.5">
            The composer can rewrite a section &ldquo;through a trauma-informed lens&rdquo; and that
            is useful for drafting. It does not count as approval, it never satisfies a review
            requirement, and it is recorded as a generation run rather than as a review.
          </p>
        </div>
      </div>

      {gaps.length > 0 && (
        <div className="mb-8 rounded-lg border border-amber/25 bg-amber-soft/50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber" />
            <div>
              <p className="text-[13px] font-medium text-ink">
                {gaps.length} required skill{gaps.length === 1 ? " has" : "s have"} no active
                reviewer
              </p>
              <ul className="mt-1.5 space-y-1">
                {gaps.map((gap) => (
                  <li key={gap.skill} className="text-[13px] leading-5 text-ink-soft">
                    <span className="font-medium">{SKILL_LABELS[gap.skill]}</span> — {gap.trigger}.
                    Sessions needing this cannot be published.
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="mb-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {professionals.map((professional) => {
          const openRequirements = requirements.filter(
            (r) =>
              professional.reviewPermissions.includes(r.requiredSkill) && !r.satisfiedByReviewId,
          );

          return (
            <Card key={professional.id} className={professional.active ? "" : "opacity-70"}>
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sand-soft text-[13px] font-medium text-[#8a6f42]">
                    {professional.avatarInitials}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium text-ink">{professional.name}</p>
                    <p className="truncate text-[12px] text-ink-muted">
                      {professional.role} · {professional.organisation}
                    </p>
                  </div>
                  {!professional.active && (
                    <Badge tone="outline" className="ml-auto shrink-0">
                      Inactive
                    </Badge>
                  )}
                </div>

                <p className="mt-3 text-[13px] leading-6 text-ink-soft">{professional.biography}</p>

                <div className="mt-4 space-y-3 border-t border-line pt-3">
                  <div>
                    <p className="label-eyebrow mb-1">May approve</p>
                    <div className="flex flex-wrap gap-1">
                      {professional.reviewPermissions.map((skill) => (
                        <Badge key={skill} tone="sage">
                          {SKILL_LABELS[skill]}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="label-eyebrow mb-1">Other skills</p>
                    <div className="flex flex-wrap gap-1">
                      {professional.skills
                        .filter((s) => !professional.reviewPermissions.includes(s))
                        .map((skill) => (
                          <Badge key={skill} tone="neutral">
                            {SKILL_LABELS[skill]}
                          </Badge>
                        ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <div>
                      <p className="label-eyebrow">Experience</p>
                      <p className="font-mono text-[13px] text-ink-soft">
                        {professional.yearsOfExperience}y
                      </p>
                    </div>
                    <div>
                      <p className="label-eyebrow">Contributions</p>
                      <p className="font-mono text-[13px] text-ink-soft">
                        {professional.contributionCount}
                      </p>
                    </div>
                    <div>
                      <p className="label-eyebrow">Queue</p>
                      <p
                        className={`font-mono text-[13px] ${
                          openRequirements.length > 0 ? "text-amber" : "text-ink-soft"
                        }`}
                      >
                        {openRequirements.length}
                      </p>
                    </div>
                  </div>
                  {professional.certifications.length > 0 && (
                    <p className="text-[12px] leading-5 text-ink-muted">
                      {professional.certifications.join(" · ")}
                    </p>
                  )}
                  <p className="text-[12px] text-ink-faint">
                    {professional.languages.join(", ")}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <SectionHeading
        title="When a skill becomes required"
        description="These triggers are evaluated automatically from the plan and the script — nobody has to remember them."
      />
      <Card>
        <CardContent className="p-0">
          <div className="divide-y divide-line">
            {coverage.map((entry) => (
              <div
                key={`${entry.skill}-${entry.trigger}`}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <p className="text-[13px] text-ink-soft">{entry.trigger}</p>
                <div className="flex items-center gap-2">
                  <Badge tone="slate">{SKILL_LABELS[entry.skill]}</Badge>
                  {entry.qualified.length === 0 ? (
                    <Badge tone="rust">No active reviewer</Badge>
                  ) : (
                    <span className="text-[12px] text-ink-faint">
                      {entry.qualified.map((p) => p.name.split(" ").slice(-1)[0]).join(", ")}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <p className="mt-4 text-[12px] leading-5 text-ink-faint">
        {experiences.filter((e) => e.requiredReviewSkills.length > 0).length} of{" "}
        {experiences.length} sessions currently carry at least one required review skill, derived
        from their mechanisms, interventions and contraindications.
      </p>
    </>
  );
}
