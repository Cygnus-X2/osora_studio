import { NextResponse } from "next/server";
import { findExperience } from "@/data/source";
import { renderSession } from "@/lib/render/session";

export const runtime = "nodejs";
// A fifteen-minute session is a dozen TTS calls plus an ffmpeg mix. This is the
// reason the studio runs on a container rather than a serverless function.
export const maxDuration = 600;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const experience = await findExperience(id);
  if (!experience) {
    return NextResponse.json({ ok: false, error: "Session not found." }, { status: 404 });
  }

  try {
    const result = await renderSession(experience);
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        steps: [],
        error: error instanceof Error ? error.message : "Render failed.",
      },
      { status: 500 },
    );
  }
}
