import { NextResponse } from "next/server";
import { z } from "zod";
import { isDatabaseConfigured } from "@/lib/db/client";
import { setVoiceApproval, upsertVoice } from "@/lib/db/voices";

export const runtime = "nodejs";

/**
 * Approving a voice.
 *
 * The provider row is recorded first, because a voice can be approved before
 * it has ever been previewed and the shortlist should not depend on the order
 * somebody happened to click in.
 */
const schema = z.object({
  provider: z.string().min(1),
  providerVoiceId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  gender: z.string().nullable().optional(),
  accent: z.string().nullable().optional(),
  languages: z.array(z.string()).default([]),
  approved: z.boolean(),
});

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "No database configured, so the shortlist cannot be saved." },
      { status: 503 },
    );
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const body = parsed.data;

  try {
    await upsertVoice({
      provider: body.provider,
      providerVoiceId: body.providerVoiceId,
      name: body.name,
      description: body.description ?? null,
      gender: body.gender ?? null,
      accent: body.accent ?? null,
      languages: body.languages,
    });

    const voice = await setVoiceApproval(body.provider, body.providerVoiceId, body.approved);
    return NextResponse.json({ ok: true, voice });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not save." },
      { status: 500 },
    );
  }
}
