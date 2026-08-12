import Link from "next/link";
import { PageHeader, SectionHeading } from "@/components/studio/page-header";
import { SeverityBadge, Stat } from "@/components/studio/indicators";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RULES } from "@/domain/rules/registry";
import { CLAIM_PATTERNS } from "@/domain/safety/claims";
import { ruleResultsFor } from "@/data/store";
import { allExperiences } from "@/data/source";
import { titleCase } from "@/lib/format";
import type { RuleCategory } from "@/domain/types";

export const metadata = { title: "Rules · Osora Studio" };

const CATEGORY_ORDER: RuleCategory[] = [
  "safety",
  "scientific_integrity",
  "timing",
  "audio_quality",
  "consistency",
  "process",
  "licensing",
];

export default async function RulesPage() {
  const experiences = await allExperiences();

  // Live pass/fail counts per rule, computed from the same validators the
  // composer uses — the rules screen and the session screen cannot disagree.
  const stats = RULES.map((rule) => {
    let passed = 0;
    let failed = 0;
    for (const experience of experiences) {
      for (const result of ruleResultsFor(experience)) {
        if (result.ruleKey !== rule.key) continue;
        if (result.passed) passed += 1;
        else failed += 1;
      }
    }
    return { rule, passed, failed };
  });

  const blockingFailures = stats
    .filter((s) => s.rule.severity === "blocking")
    .reduce((sum, s) => sum + s.failed, 0);

  return (
    <>
      <PageHeader
        eyebrow="Rules engine"
        title="Rules"
        description="Rule logic lives in TypeScript so it stays deterministic and testable. Rule metadata — active, severity, owner, version — lives in the database so governance can be tuned without a deploy."
      />

      <div className="mb-8 grid gap-x-6 gap-y-5 rounded-lg border border-line bg-surface p-5 shadow-quiet sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active rules" value={String(RULES.filter((r) => r.active).length)} />
        <Stat
          label="Blocking rules"
          value={String(RULES.filter((r) => r.severity === "blocking").length)}
        />
        <Stat
          label="Blocking failures"
          value={String(blockingFailures)}
          tone={blockingFailures > 0 ? "danger" : "good"}
          hint="across all sessions"
        />
        <Stat
          label="Evaluations"
          value={String(stats.reduce((s, x) => s + x.passed + x.failed, 0))}
        />
      </div>

      <div className="mb-8 rounded-lg border border-line bg-surface-muted/60 px-4 py-3">
        <p className="text-[13px] leading-6 text-ink-soft">
          Severity is a ladder:{" "}
          <Badge tone="outline">Information</Badge> <Badge tone="stone">Recommendation</Badge>{" "}
          <Badge tone="amber">Warning</Badge> <Badge tone="rust">Blocking</Badge>. Anything blocking
          disables publication outright — there is no override, and no role that can grant one.
        </p>
      </div>

      {CATEGORY_ORDER.map((category) => {
        const rows = stats.filter((s) => s.rule.category === category);
        if (rows.length === 0) return null;

        return (
          <div key={category} className="mb-8">
            <SectionHeading title={titleCase(category)} />
            <div className="space-y-3">
              {rows.map(({ rule, passed, failed }) => (
                <Card key={rule.key} className={rule.active ? "" : "opacity-60"}>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="max-w-2xl">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-[14px] font-medium text-ink">{rule.name}</h3>
                          <code className="rounded-xs bg-surface-muted px-1.5 py-0.5 font-mono text-[11px] text-ink-faint">
                            {rule.key}
                          </code>
                        </div>
                        <p className="mt-1 text-[13px] leading-6 text-ink-soft">
                          {rule.description}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        <SeverityBadge severity={rule.severity} />
                        <Badge tone="neutral">{titleCase(rule.scope)}</Badge>
                        <Badge tone="outline">v{rule.version}</Badge>
                        {!rule.active && <Badge tone="outline">Inactive</Badge>}
                      </div>
                    </div>

                    <div className="mt-3 grid gap-3 border-t border-line pt-3 lg:grid-cols-4">
                      <div className="lg:col-span-2">
                        <p className="label-eyebrow mb-1">Validation logic</p>
                        <code className="block overflow-x-auto rounded-md bg-canvas-sunk px-2 py-1.5 font-mono text-[11px] leading-5 text-ink-muted">
                          {rule.logicSummary}
                        </code>
                      </div>
                      <div>
                        <p className="label-eyebrow mb-1">On failure</p>
                        <p className="text-[12px] leading-5 text-ink-muted">{rule.errorMessage}</p>
                        <p className="mt-1 text-[12px] leading-5 text-clay">
                          {rule.suggestedCorrection}
                        </p>
                      </div>
                      <div>
                        <p className="label-eyebrow mb-1">Current results</p>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-[13px] tabular-nums text-sage">
                            {passed} pass
                          </span>
                          <span
                            className={`font-mono text-[13px] tabular-nums ${
                              failed > 0 ? "text-rust" : "text-ink-faint"
                            }`}
                          >
                            {failed} fail
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-ink-faint">Owner: {rule.owner}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })}

      <SectionHeading
        title="Prohibited and reviewable language"
        description="Detected deterministically in every script. Blocking patterns have no approvable form — there is no review that can let them through."
      />
      <Card>
        <CardContent className="p-0">
          <div className="divide-y divide-line">
            {CLAIM_PATTERNS.map((pattern) => (
              <div key={pattern.key} className="grid gap-2 px-4 py-3 lg:grid-cols-[160px_120px_1fr]">
                <div>
                  <p className="text-[13px] font-medium text-ink">{pattern.label}</p>
                  <code className="font-mono text-[11px] text-ink-faint">
                    {String(pattern.pattern).replace(/^\/|\/[a-z]*$/g, "")}
                  </code>
                </div>
                <div>
                  <Badge tone={pattern.severity === "blocking" ? "rust" : "amber"}>
                    {pattern.severity === "blocking" ? "Blocking" : "Review required"}
                  </Badge>
                </div>
                <div>
                  <p className="text-[12px] leading-5 text-ink-muted">{pattern.explanation}</p>
                  <p className="mt-0.5 text-[12px] leading-5 text-clay">{pattern.suggestion}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-8">
        <CardHeader className="pb-3">
          <CardTitle>Content categories</CardTitle>
          <p className="text-[13px] leading-6 text-ink-muted">
            Osora produces the first two. The platform must never produce the last two, and never
            diagnoses or claims to treat anything.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Badge tone="sage">Wellness content</Badge>
            <Badge tone="sage">Educational content</Badge>
            <Badge tone="rust">Medical advice</Badge>
            <Badge tone="rust">Clinical treatment</Badge>
          </div>
          <p className="mt-3 text-[13px] leading-6 text-ink-soft">
            Where the line is unclear, the rule engine escalates rather than guesses:{" "}
            <Link href="/reviews" className="text-clay hover:underline">
              the review queue
            </Link>{" "}
            routes the section to somebody holding the relevant skill, and publication waits.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
