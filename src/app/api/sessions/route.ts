import { NextResponse } from "next/server";
import { z } from "zod";
import { createExperience, listExperiences } from "@/lib/db/experiences";
import { isDatabaseConfigured } from "@/lib/db/client";
import type {
  BoundaryKey,
  DesiredDirection,
  DimensionKey,
  FamiliarityGroup,
  PreferenceKey,
  SessionEnvironment,
  SessionIntent,
  UserConstraint,
} from "@/domain/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Session creation over HTTP.
 *
 * The same path the intake form uses. It exists separately because the thing
 * that will eventually call this is not a form — it is an app asking, on
 * behalf of a person, for a session that suits the state they just described.
 *
 * Note there is no `prompt` field and no way to name a technique. What a
 * caller may specify is a state, a direction, a duration and a set of
 * boundaries. Everything else is the engine's decision.
 */
const schema = z.object({
  title: z.string().min(1).max(120),
  state: z.record(z.string(), z.number().min(0).max(10)),
  directions: z.array(z.string()).min(1),
  intent: z.string().default("wind_down"),
  environment: z.string().default("quiet_room"),
  minutes: z.number().min(2).max(45),
  context: z.string().max(500).nullable().default(null),
  boundaries: z.array(z.string()).default([]),
  preferences: z.array(z.string()).default([]),
  familiarGroups: z.array(z.string()).default([]),
});

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "No database configured." }, { status: 503 });
  }
  const experiences = await listExperiences();
  return NextResponse.json({
    ok: true,
    count: experiences.length,
    sessions: experiences.map((e) => ({
      id: e.id,
      title: e.title,
      status: e.status,
      durationSeconds: e.durationSeconds,
      mechanisms: e.plan?.composition.length ?? 0,
      confidence: e.plan?.confidence ?? null,
    })),
  });
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "No database configured." }, { status: 503 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid request.", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const body = parsed.data;
  const now = new Date().toISOString();

  const constraints: UserConstraint[] = [
    ...body.boundaries.map<UserConstraint>((key, i) => ({
      id: `hard-${i}`,
      userId: "api",
      type: "hard",
      key: key as BoundaryKey,
      value: null,
      reason: "Supplied with the request.",
      scope: "always",
      createdAt: now,
      updatedAt: now,
    })),
    ...body.preferences.map<UserConstraint>((key, i) => ({
      id: `soft-${i}`,
      userId: "api",
      type: "soft",
      key: key as PreferenceKey,
      value: 1,
      reason: "Supplied with the request.",
      scope: "always",
      createdAt: now,
      updatedAt: now,
    })),
  ];

  try {
    const experience = await createExperience({
      title: body.title,
      currentState: body.state as Partial<Record<DimensionKey, number>>,
      desired: {
        directions: body.directions as DesiredDirection[],
        intent: body.intent as SessionIntent,
        environment: body.environment as SessionEnvironment,
        availableSeconds: Math.round(body.minutes * 60),
        context: body.context,
      },
      constraints,
      familiarGroups: (body.familiarGroups.length > 0
        ? body.familiarGroups
        : ["grounding_core"]) as FamiliarityGroup[],
    });

    return NextResponse.json(
      {
        ok: true,
        id: experience.id,
        title: experience.title,
        status: experience.status,
        plan: {
          target: experience.plan?.target,
          confidence: experience.plan?.confidence,
          composition: experience.plan?.composition,
          sequence: experience.plan?.sequence.map((b) => ({
            order: b.order,
            section: b.sectionKind,
            intervention: b.interventionKey,
            seconds: b.seconds,
            familiar: b.familiar,
          })),
          warnings: experience.plan?.warnings,
          excludedByBoundary: experience.plan?.rankedInterventions
            .filter((r) => !r.eligible && r.exclusionReason?.includes("boundary"))
            .map((r) => r.name),
          traceEntries: experience.plan?.trace.length,
        },
        requiredReviewSkills: experience.requiredReviewSkills,
        dnaScore: experience.dnaScore?.total,
        timeline: experience.timeline?.sections.map((s) => ({
          title: s.title,
          wordBudget: s.wordBudget,
          start: s.startSeconds,
          end: s.endSeconds,
        })),
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not create session." },
      { status: 500 },
    );
  }
}
