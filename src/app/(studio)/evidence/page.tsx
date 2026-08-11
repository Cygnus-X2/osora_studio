import { ExternalLink } from "lucide-react";
import { PageHeader, SectionHeading } from "@/components/studio/page-header";
import { EvidenceBadge, VerificationBadge } from "@/components/studio/indicators";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { store } from "@/data/store";
import { MECHANISM_BY_KEY } from "@/domain/mechanisms/library";
import { PROFESSIONAL_BY_ID } from "@/data/seed/people";
import { titleCase } from "@/lib/format";

export const metadata = { title: "Evidence · Osora Studio" };

const PROVENANCE_LADDER = [
  {
    kind: "Scientific evidence",
    tone: "sage" as const,
    canClaim: "Yes",
    canApprove: "—",
    note: "Peer-reviewed work that has been located, read and verified by a named reviewer.",
  },
  {
    kind: "Expert opinion",
    tone: "slate" as const,
    canClaim: "Yes, labelled",
    canApprove: "Within skill",
    note: "Practitioner literature and clinical consensus. Never presented as research.",
  },
  {
    kind: "Traditional practice",
    tone: "stone" as const,
    canClaim: "Yes, labelled",
    canApprove: "No",
    note: "Lineage and provenance. Explains where a block came from, not whether it works.",
  },
  {
    kind: "Internal hypothesis",
    tone: "amber" as const,
    canClaim: "Yes, labelled",
    canApprove: "No",
    note: "An Osora belief we have not tested yet. Usually the seed of an experiment.",
  },
  {
    kind: "AI suggestion",
    tone: "rust" as const,
    canClaim: "Draft only",
    canApprove: "Never",
    note: "A model may propose a source. Nobody may cite one until a human has found and read it.",
  },
];

export default function EvidencePage() {
  const sources = store.sources();
  const links = store.evidenceLinks();

  const verified = sources.filter((s) => s.verificationStatus === "verified").length;
  const disputed = sources.filter((s) => s.verificationStatus === "disputed").length;
  const unverified = sources.filter((s) => s.verificationStatus === "unverified").length;

  return (
    <>
      <PageHeader
        eyebrow="Evidence library"
        title="Evidence"
        description={`${sources.length} sources — ${verified} verified, ${disputed} disputed, ${unverified} unverified. A source that is disputed or unverified is still worth recording; it just cannot back a claim.`}
        actions={<Button variant="outline">Add source</Button>}
      />

      <SectionHeading
        title="What may claim, and what may approve"
        description="The single most important distinction in the product. Only the top two rows can approve anything."
      />
      <Card className="mb-10">
        <CardContent className="p-0">
          <div className="divide-y divide-line">
            {PROVENANCE_LADDER.map((row) => (
              <div key={row.kind} className="grid gap-2 p-4 sm:grid-cols-[180px_100px_120px_1fr]">
                <Badge tone={row.tone} className="w-fit">
                  {row.kind}
                </Badge>
                <div>
                  <p className="label-eyebrow">Can claim</p>
                  <p className="text-[13px] text-ink-soft">{row.canClaim}</p>
                </div>
                <div>
                  <p className="label-eyebrow">Can approve</p>
                  <p className="text-[13px] text-ink-soft">{row.canApprove}</p>
                </div>
                <p className="text-[13px] leading-6 text-ink-muted">{row.note}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <SectionHeading title="Sources" description="Limitations are recorded as carefully as findings." />
      <div className="space-y-4">
        {sources.map((source) => {
          const linked = links.filter((l) => l.sourceId === source.id);
          const verifier = source.verifiedBy ? PROFESSIONAL_BY_ID[source.verifiedBy] : null;

          return (
            <Card key={source.id} id={source.id} className="scroll-mt-6">
              <CardContent className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="max-w-3xl">
                    <h2 className="text-[15px] font-medium leading-6 text-ink">{source.title}</h2>
                    <p className="mt-1 text-[13px] text-ink-muted">
                      {source.authors.join(", ")} · {source.year} · {source.publisher}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <Badge tone="neutral">{titleCase(source.sourceType)}</Badge>
                    <EvidenceBadge level={source.evidenceQuality} />
                    <VerificationBadge status={source.verificationStatus} />
                  </div>
                </div>

                <p className="mt-3 text-[13px] leading-6 text-ink-soft">{source.summary}</p>

                <div className="mt-4 grid gap-4 border-t border-line pt-4 lg:grid-cols-3">
                  <div>
                    <p className="label-eyebrow mb-1.5">Relevant findings</p>
                    <ul className="space-y-1">
                      {source.relevantFindings.map((finding, i) => (
                        <li key={i} className="text-[12px] leading-5 text-ink-muted">
                          — {finding}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="label-eyebrow mb-1.5">Limitations</p>
                    <ul className="space-y-1">
                      {source.limitations.map((limitation, i) => (
                        <li key={i} className="text-[12px] leading-5 text-amber">
                          — {limitation}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="label-eyebrow mb-1">Linked to</p>
                      <div className="flex flex-wrap gap-1">
                        {source.relevantMechanisms.map((key) => (
                          <Badge key={key} tone="clay">
                            {MECHANISM_BY_KEY[key]?.name ?? key}
                          </Badge>
                        ))}
                        {linked.map((link) => (
                          <Badge key={link.id} tone="stone">
                            {titleCase(link.targetType)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    {source.contraindicationNotes.length > 0 && (
                      <div>
                        <p className="label-eyebrow mb-1">Contraindication notes</p>
                        <ul className="space-y-0.5">
                          {source.contraindicationNotes.map((note, i) => (
                            <li key={i} className="text-[12px] leading-5 text-ink-muted">
                              — {note}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-3">
                      {source.doiOrUrl && (
                        <a
                          href={source.doiOrUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[12px] text-clay hover:underline"
                        >
                          <ExternalLink className="size-3" /> Source
                        </a>
                      )}
                      {verifier && (
                        <span className="text-[12px] text-ink-faint">
                          Verified by {verifier.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {source.reviewerNotes && (
                  <div className="mt-3 rounded-md border-l-2 border-clay bg-clay-soft/40 px-3 py-2">
                    <p className="font-serif text-[13px] italic leading-6 text-ink-soft">
                      {source.reviewerNotes}
                    </p>
                  </div>
                )}

                <p className="mt-3 font-mono text-[11px] leading-5 text-ink-faint">
                  {source.citation}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
