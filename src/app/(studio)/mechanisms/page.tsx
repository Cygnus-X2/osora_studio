import Link from "next/link";
import { PageHeader } from "@/components/studio/page-header";
import { EvidenceBadge, KnowledgeBadge, ReviewStatusBadge } from "@/components/studio/indicators";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MECHANISMS, MECHANISM_BY_KEY } from "@/domain/mechanisms/library";
import { DIRECTION_BY_KEY } from "@/domain/state/dimensions";
import { SKILL_LABELS } from "@/data/seed/people";
import { formatSeconds } from "@/domain/timeline/planner";
import { store } from "@/data/store";

export const metadata = { title: "Mechanisms · Osora Studio" };

const OPERATOR = { gte: "≥", lte: "≤", gt: ">", lt: "<" } as const;

export default function MechanismsPage() {
  const sources = store.sources();

  return (
    <>
      <PageHeader
        eyebrow="Mechanism library"
        title="Mechanisms"
        description="What changes in a person, described independently of the tradition the technique came from. Mixing material from very different schools only works because the mixing happens here, at the mechanism level."
        actions={<Button variant="outline">Add mechanism</Button>}
      />

      <div className="mb-6 rounded-lg border border-line bg-surface-muted/60 px-4 py-3 text-[13px] leading-6 text-ink-soft">
        Medical or clinical claims are not permitted on a mechanism unless a verified source
        supports them and a reviewer holding the relevant skill has approved it. Evidence level and
        provenance are shown on every card because they decide how much a mechanism is allowed to
        influence engine scoring.
      </div>

      <div className="space-y-4">
        {MECHANISMS.map((mechanism) => {
          const directions = Object.entries(mechanism.servesDirections)
            .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
            .slice(0, 4);

          return (
            <Card key={mechanism.key}>
              <CardContent className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 max-w-2xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[15px] font-medium text-ink">{mechanism.name}</h2>
                      <code className="rounded-xs bg-surface-muted px-1.5 py-0.5 font-mono text-[11px] text-ink-faint">
                        {mechanism.key}
                      </code>
                    </div>
                    <p className="mt-1.5 text-[13px] leading-6 text-ink-soft">
                      {mechanism.description}
                    </p>
                    <p className="mt-1 text-[13px] leading-6 text-ink-muted">
                      <span className="text-ink-faint">Intended effect — </span>
                      {mechanism.intendedEffect}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <EvidenceBadge level={mechanism.evidenceLevel} />
                    <KnowledgeBadge kind={mechanism.knowledgeKind} />
                    <ReviewStatusBadge status={mechanism.reviewStatus} />
                    <Badge tone="outline">v{mechanism.version}</Badge>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 border-t border-line pt-4 lg:grid-cols-4">
                  <div>
                    <p className="label-eyebrow mb-1.5">Serves</p>
                    <div className="flex flex-wrap gap-1">
                      {directions.map(([key, weight]) => (
                        <Badge key={key} tone="clay">
                          {DIRECTION_BY_KEY[key as keyof typeof DIRECTION_BY_KEY]?.label ?? key}
                          <span className="font-mono text-[10px] opacity-70">{weight}</span>
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="label-eyebrow mb-1.5">Suitable when</p>
                    <div className="flex flex-wrap gap-1">
                      {mechanism.suitableStates.length === 0 ? (
                        <span className="text-[12px] text-ink-faint">Always eligible</span>
                      ) : (
                        mechanism.suitableStates.map((condition, i) => (
                          <Badge key={i} tone="sage">
                            {condition.dimension.replace(/_/g, " ")} {OPERATOR[condition.operator]}{" "}
                            {condition.value}
                          </Badge>
                        ))
                      )}
                    </div>
                    {mechanism.unsuitableStates.length > 0 && (
                      <>
                        <p className="label-eyebrow mb-1.5 mt-2.5">Penalised when</p>
                        <div className="flex flex-wrap gap-1">
                          {mechanism.unsuitableStates.map((condition, i) => (
                            <Badge key={i} tone="amber">
                              {condition.dimension.replace(/_/g, " ")} {OPERATOR[condition.operator]}{" "}
                              {condition.value}
                            </Badge>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  <div>
                    <p className="label-eyebrow mb-1.5">Exposure</p>
                    <p className="font-mono text-[12px] text-ink-soft">
                      {formatSeconds(mechanism.minExposureSeconds)} –{" "}
                      {formatSeconds(mechanism.maxExposureSeconds)}
                    </p>
                    <p className="mt-0.5 text-[12px] text-ink-muted">
                      recommended {formatSeconds(mechanism.recommendedSeconds)}
                    </p>
                    {mechanism.incompatibleWith.length > 0 && (
                      <>
                        <p className="label-eyebrow mb-1 mt-2.5">Never with</p>
                        <div className="flex flex-wrap gap-1">
                          {mechanism.incompatibleWith.map((key) => (
                            <Badge key={key} tone="rust">
                              {MECHANISM_BY_KEY[key]?.name ?? key}
                            </Badge>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  <div>
                    <p className="label-eyebrow mb-1.5">Required review skills</p>
                    <div className="flex flex-wrap gap-1">
                      {mechanism.requiredSkills.length === 0 ? (
                        <span className="text-[12px] text-ink-faint">None</span>
                      ) : (
                        mechanism.requiredSkills.map((skill) => (
                          <Badge key={skill} tone="slate">
                            {SKILL_LABELS[skill]}
                          </Badge>
                        ))
                      )}
                    </div>
                    <p className="label-eyebrow mb-1 mt-2.5">Sources</p>
                    <div className="space-y-0.5">
                      {mechanism.supportingSourceIds.length === 0 ? (
                        <span className="text-[12px] text-amber">No source recorded</span>
                      ) : (
                        mechanism.supportingSourceIds.map((id) => {
                          const source = sources.find((s) => s.id === id);
                          return (
                            <Link
                              key={id}
                              href={`/evidence#${id}`}
                              className="block truncate text-[12px] text-clay hover:underline"
                              title={source?.title}
                            >
                              {source ? `${source.authors[0]?.split(",")[0]} ${source.year}` : id}
                            </Link>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                {mechanism.contraindications.length > 0 && (
                  <div className="mt-4 space-y-2 rounded-md border border-rust/20 bg-rust-soft/40 p-3">
                    <p className="label-eyebrow text-rust">Contraindications — engine gates</p>
                    {mechanism.contraindications.map((contraindication) => (
                      <div key={contraindication.id} className="text-[12px] leading-5">
                        <p className="font-medium text-ink-soft">
                          {contraindication.summary}
                          {contraindication.condition && (
                            <code className="ml-2 rounded-xs bg-surface px-1.5 py-0.5 font-mono text-[11px] text-rust">
                              {contraindication.condition.dimension}{" "}
                              {OPERATOR[contraindication.condition.operator]}{" "}
                              {contraindication.condition.value}
                            </code>
                          )}
                        </p>
                        <p className="text-ink-muted">{contraindication.guidance}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
