import { ShieldAlert } from "lucide-react";
import { PageHeader, SectionHeading } from "@/components/studio/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DESIRED_DIRECTIONS, STATE_DIMENSIONS } from "@/domain/state/dimensions";
import { titleCase } from "@/lib/format";

export const metadata = { title: "States · Osora Studio" };

export default function StatesPage() {
  const gating = STATE_DIMENSIONS.filter((d) => d.allowedUseCases.includes("safety_gating"));

  return (
    <>
      <PageHeader
        eyebrow="State model"
        title="States"
        description="Sixteen self-reported dimensions on a 0–10 scale. These are not clinical instruments and the platform never infers a condition from them — the internal interpretation is for the team, the user-facing wording is the only text a listener sees."
      />

      <div className="mb-8 flex items-start gap-3 rounded-lg border border-rust/20 bg-rust-soft/50 p-4">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-rust" />
        <div className="text-[13px] leading-6 text-ink-soft">
          <p className="font-medium text-ink">Osora does not diagnose.</p>
          <p className="mt-0.5">
            A high reading is a description of how someone feels right now, not a signal of a
            disorder. Two dimensions —{" "}
            {gating.map((d) => d.name.toLowerCase()).join(" and ")} — gate the State Engine: what
            they exclude cannot be reintroduced by any score, preference or model output.
          </p>
        </div>
      </div>

      <SectionHeading
        title="Dimensions"
        description="Each carries its own version so a change in wording is traceable against recorded outcomes."
      />
      <div className="mb-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {STATE_DIMENSIONS.map((dimension) => (
          <Card key={dimension.key}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <CardTitle>{dimension.name}</CardTitle>
                <div className="flex shrink-0 gap-1.5">
                  {dimension.allowedUseCases.includes("safety_gating") && (
                    <Badge tone="rust">Gating</Badge>
                  )}
                  <Badge tone="outline">v{dimension.version}</Badge>
                </div>
              </div>
              <p className="text-[13px] leading-5 text-ink-muted">{dimension.description}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="label-eyebrow">Asked as</p>
                <p className="mt-0.5 font-serif text-[15px] italic leading-6 text-ink-soft">
                  “{dimension.userFacingWording}”
                </p>
              </div>
              <div>
                <p className="label-eyebrow">Internal interpretation</p>
                <p className="mt-0.5 text-[12px] leading-5 text-ink-muted">
                  {dimension.internalInterpretation}
                </p>
              </div>
              <div className="flex items-center gap-2 text-[12px] text-ink-faint">
                <span className="font-mono">
                  {dimension.min}–{dimension.max}
                </span>
                <span>·</span>
                <span>
                  higher is {dimension.higherIsPleasant ? "pleasant" : "unpleasant"}
                </span>
              </div>
              {dimension.safetyNotes && (
                <div className="rounded-md border border-amber/20 bg-amber-soft/60 px-2.5 py-2">
                  <p className="text-[12px] leading-5 text-ink-soft">{dimension.safetyNotes}</p>
                </div>
              )}
              <div className="flex flex-wrap gap-1">
                {dimension.allowedUseCases.map((useCase) => (
                  <Badge key={useCase} tone="neutral">
                    {titleCase(useCase)}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <SectionHeading
        title="Desired directions"
        description="What a listener may ask to move toward. Each maps to signed movements on specific dimensions, which is how the engine scores directional fit."
      />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Direction</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Implied dimension movement</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {DESIRED_DIRECTIONS.map((direction) => (
                <TableRow key={direction.key}>
                  <TableCell className="font-medium text-ink">{direction.label}</TableCell>
                  <TableCell className="text-ink-muted">{direction.description}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {direction.targets.map((target) => (
                        <Badge
                          key={target.dimension}
                          tone={target.direction === 1 ? "sage" : "stone"}
                        >
                          {target.direction === 1 ? "↑" : "↓"} {target.dimension.replace(/_/g, " ")}
                          <span className="font-mono text-[10px] opacity-70">×{target.weight}</span>
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <SectionHeading
        className="mt-10"
        title="What a listener provides"
        description="Everything the engine needs, and nothing that requires them to know a method."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          {
            title: "Current state",
            body: "A reading on whichever dimensions they answer. Unanswered dimensions default to neutral rather than blocking the session.",
          },
          {
            title: "Desired state",
            body: "One or more directions. Not a technique, not a category — a direction of travel.",
          },
          {
            title: "Available time",
            body: "The engine allocates seconds against this, clamped to each mechanism's exposure window.",
          },
          {
            title: "Environment",
            body: "Bed, office, commute, shared space. Changes what can reasonably be asked.",
          },
          {
            title: "Session intent",
            body: "Wind down, prepare for sleep, reset, sit with a feeling. Shapes the grammar and the fade.",
          },
          {
            title: "Optional context",
            body: "Free text. Never parsed for clinical meaning; available to a reviewer looking at an outcome.",
          },
        ].map((item) => (
          <div key={item.title} className="rounded-lg border border-line bg-surface p-4 shadow-quiet">
            <p className="text-[13px] font-medium text-ink">{item.title}</p>
            <p className="mt-1 text-[12px] leading-5 text-ink-muted">{item.body}</p>
          </div>
        ))}
      </div>
    </>
  );
}
