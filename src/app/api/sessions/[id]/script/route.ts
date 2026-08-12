import { NextResponse } from "next/server";
import { countWords, recomputeBounds } from "@/domain/timeline/planner";
import { buildHardConstraints, getLlmProvider, type LlmProviderId } from "@/providers/llm";
import { OSORA_DNA } from "@/data/seed/dna";
import { findExperience } from "@/data/source";
import { saveTimeline } from "@/lib/db/experiences";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Fills the frozen timeline with text.
 *
 * The model is handed the plan and the per-section word budgets it must write
 * inside, plus the hard-constraint block. On the way back, anything for a
 * section that does not exist is discarded and every word count is recomputed
 * from the text rather than taken on trust.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const experience = await findExperience(id);

  if (!experience?.plan || !experience.timeline) {
    return NextResponse.json(
      { ok: false, error: "This session has no plan to write into yet." },
      { status: 422 },
    );
  }

  try {
    const provider = getLlmProvider(experience.settings.llmProvider as LlmProviderId);
    const response = await provider.generateScript({
      plan: experience.plan,
      timeline: experience.timeline,
      dna: OSORA_DNA,
      constraints: experience.constraints,
      hardConstraints: buildHardConstraints(experience.constraints),
      professionalPerspective: experience.settings.professionalPerspective,
      temperature: experience.settings.temperature,
      promptVersion: experience.settings.promptTemplate,
    });

    const byId = new Map(response.data.sections.map((s) => [s.sectionId, s.text]));
    const sections = experience.timeline.sections.map((section) => {
      const text = byId.get(section.id);
      if (text === undefined) return section;
      return { ...section, text, wordCount: countWords(text) };
    });

    const timeline = recomputeBounds({ ...experience.timeline, sections });
    await saveTimeline(
      id,
      timeline,
      "Script generated",
      `${response.model} wrote ${sections.filter((s) => s.wordCount > 0).length} sections. Draft until reviewed.`,
    );

    const overruns = sections.filter((s) => s.wordCount > s.wordBudget);

    return NextResponse.json({
      ok: true,
      model: response.model,
      isDraft: response.isDraft,
      usage: response.usage,
      sections: sections.map((s) => ({
        title: s.title,
        words: s.wordCount,
        budget: s.wordBudget,
        withinBudget: s.wordCount <= s.wordBudget,
      })),
      // Should always be zero: the composer enforces budgets rather than
      // hoping the model respected them.
      overrunCount: overruns.length,
      totalWords: sections.reduce((sum, s) => sum + s.wordCount, 0),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Script generation failed." },
      { status: 500 },
    );
  }
}
