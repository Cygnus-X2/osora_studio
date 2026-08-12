import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/studio/page-header";
import { NewSessionForm } from "@/components/studio/composer/new-session-form";
import { BOUNDARIES, PREFERENCES } from "@/domain/constraints/catalog";
import { DESIRED_DIRECTIONS, STATE_DIMENSIONS } from "@/domain/state/dimensions";
import { isDatabaseConfigured } from "@/lib/db/client";
import { usingDatabase } from "@/data/source";
import { titleCase } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "New session · Osora Studio" };

const INTENTS = [
  "reset_during_day",
  "wind_down",
  "prepare_for_sleep",
  "prepare_for_focus",
  "recover_after_stress",
  "sit_with_a_feeling",
  "start_the_day",
];

const ENVIRONMENTS = ["quiet_room", "bed", "office", "outdoors", "commute", "shared_space"];

const FAMILIARITY_GROUPS = [
  "grounding_core",
  "breath_core",
  "body_core",
  "cognitive_core",
  "compassion_core",
  "silence_core",
  "imagery_extended",
  "sound_extended",
];

export default async function NewSessionPage() {
  const databaseReady = isDatabaseConfigured() && (await usingDatabase());

  return (
    <>
      <Link
        href="/composer"
        className="mb-3 inline-flex items-center gap-1 text-[12px] text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="size-3" /> Sessions
      </Link>

      <PageHeader
        eyebrow="New session"
        title="Describe the state"
        description="There is no prompt here on purpose. The listener says where they are and where they want to get to; the State Engine decides which mechanisms and interventions serve that, in what order, for how many seconds — and records why."
      />

      <NewSessionForm
        databaseReady={databaseReady}
        dimensions={STATE_DIMENSIONS}
        directions={DESIRED_DIRECTIONS.map((d) => ({
          key: d.key,
          label: d.label,
          description: d.description,
        }))}
        boundaries={BOUNDARIES.filter((b) => !b.requiresValue).map((b) => ({
          key: b.key,
          label: b.label,
          description: b.description,
        }))}
        preferences={PREFERENCES.map((p) => ({ key: p.key, label: p.label }))}
        familiarityGroups={FAMILIARITY_GROUPS.map((key) => ({ key, label: titleCase(key) }))}
        intents={INTENTS.map((key) => ({ key, label: titleCase(key) }))}
        environments={ENVIRONMENTS.map((key) => ({ key, label: titleCase(key) }))}
      />
    </>
  );
}
