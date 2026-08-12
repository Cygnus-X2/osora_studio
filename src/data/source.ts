import "server-only";

import { isDatabaseConfigured } from "@/lib/db/client";
import {
  getExperience as dbGetExperience,
  listExperiences as dbListExperiences,
  listVersions as dbListVersions,
} from "@/lib/db/experiences";
import { EXPERIENCES, EXPERIENCE_VERSIONS } from "./seed/experiences";
import type { Experience, ExperienceVersion } from "@/domain/types";

/**
 * Where sessions come from.
 *
 * Postgres when there is one, the shipped examples when there is not. The
 * fallback exists so `npm run dev` works with no configuration at all — not so
 * that a misconfigured server silently serves fixtures. `usingDatabase()` is
 * what the UI reads to say which of the two it is looking at.
 */

export async function usingDatabase(): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  try {
    await dbListExperiences();
    return true;
  } catch {
    return false;
  }
}

export async function allExperiences(): Promise<Experience[]> {
  if (isDatabaseConfigured()) {
    try {
      const rows = await dbListExperiences();
      if (rows.length > 0) return rows;
    } catch {
      // Fall through to the shipped examples rather than rendering nothing.
    }
  }
  return EXPERIENCES;
}

export async function findExperience(idOrSlug: string): Promise<Experience | undefined> {
  if (isDatabaseConfigured()) {
    try {
      const row = await dbGetExperience(idOrSlug);
      if (row) return row;
    } catch {
      // As above.
    }
  }
  return EXPERIENCES.find((e) => e.id === idOrSlug);
}

export async function experienceVersions(idOrSlug: string): Promise<ExperienceVersion[]> {
  if (isDatabaseConfigured()) {
    try {
      const rows = await dbListVersions(idOrSlug);
      if (rows.length > 0) return rows;
    } catch {
      // As above.
    }
  }
  return EXPERIENCE_VERSIONS.filter((v) => v.experienceId === idOrSlug).sort(
    (a, b) => b.version - a.version,
  );
}
