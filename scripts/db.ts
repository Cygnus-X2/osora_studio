/**
 * Database CLI.
 *
 *   npx tsx scripts/db.ts migrate   apply pending migrations
 *   npx tsx scripts/db.ts seed      load the knowledge base
 *   npx tsx scripts/db.ts status    what is applied and how much is in there
 *
 * Migrations are applied in filename order inside a transaction each, and
 * recorded in `schema_migrations`. Re-running is safe: applied files are
 * skipped, and the seed is idempotent via ON CONFLICT.
 */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

import { STATE_DIMENSIONS } from "../src/domain/state/dimensions";
import { MECHANISMS } from "../src/domain/mechanisms/library";
import { INTERVENTIONS } from "../src/domain/interventions/library";
import { SCIENTIFIC_SOURCES } from "../src/data/seed/evidence";
import { PROFESSIONALS } from "../src/data/seed/people";
import { OSORA_DNA } from "../src/data/seed/dna";
import { EXPERIENCES } from "../src/data/seed/experiences";

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

function connectionString(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  return url;
}

function pool() {
  return new Pool({ connectionString: connectionString(), max: 4 });
}

async function migrate() {
  const db = pool();
  try {
    await db.query(`
      create table if not exists schema_migrations (
        version text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      )
    `);

    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
    const { rows } = await db.query<{ version: string; checksum: string }>(
      "select version, checksum from schema_migrations",
    );
    const applied = new Map(rows.map((r) => [r.version, r.checksum]));

    let ran = 0;
    for (const file of files) {
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex").slice(0, 16);

      const previous = applied.get(file);
      if (previous) {
        // A changed file that is already applied is a mistake worth naming
        // rather than silently ignoring.
        if (previous !== checksum) {
          console.warn(`  ! ${file} changed since it was applied (${previous} → ${checksum})`);
        } else {
          console.log(`  · ${file} already applied`);
        }
        continue;
      }

      const client = await db.connect();
      try {
        await client.query("begin");
        await client.query(sql);
        await client.query(
          "insert into schema_migrations (version, checksum) values ($1, $2)",
          [file, checksum],
        );
        await client.query("commit");
        console.log(`  ✓ ${file}`);
        ran += 1;
      } catch (error) {
        await client.query("rollback");
        console.error(`  ✗ ${file}`);
        throw error;
      } finally {
        client.release();
      }
    }

    console.log(ran === 0 ? "Nothing to apply." : `Applied ${ran} migration(s).`);
  } finally {
    await db.end();
  }
}

/** Seeds the knowledge base from the TypeScript libraries — one source of truth. */
async function seed() {
  const db = pool();
  try {
    for (const d of STATE_DIMENSIONS) {
      await db.query(
        `insert into state_dimensions
           (key, name, description, scale, min_value, max_value, higher_is_pleasant,
            user_facing_wording, internal_interpretation, allowed_use_cases, safety_notes, version)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         on conflict (key) do update set
           name = excluded.name, description = excluded.description,
           user_facing_wording = excluded.user_facing_wording,
           internal_interpretation = excluded.internal_interpretation,
           allowed_use_cases = excluded.allowed_use_cases,
           safety_notes = excluded.safety_notes, version = excluded.version`,
        [
          d.key, d.name, d.description, d.scale, d.min, d.max, d.higherIsPleasant,
          d.userFacingWording, d.internalInterpretation, d.allowedUseCases, d.safetyNotes, d.version,
        ],
      );
    }
    console.log(`  ✓ ${STATE_DIMENSIONS.length} state dimensions`);

    for (const m of MECHANISMS) {
      await db.query(
        `insert into mechanisms
           (key, name, description, intended_effect, suitable_states, unsuitable_states,
            contraindications, evidence_level, knowledge_kind, required_skills,
            recommended_seconds, min_exposure_seconds, max_exposure_seconds,
            compatible_with, incompatible_with, serves_directions, review_status, version, tags)
         values ($1,$2,$3,$4,$5,$6,$7,$8::evidence_level,$9::knowledge_kind,$10,$11,$12,$13,$14,$15,$16,$17::review_status,$18,$19)
         on conflict (key) do update set
           name = excluded.name, description = excluded.description,
           intended_effect = excluded.intended_effect,
           suitable_states = excluded.suitable_states,
           unsuitable_states = excluded.unsuitable_states,
           contraindications = excluded.contraindications,
           evidence_level = excluded.evidence_level,
           serves_directions = excluded.serves_directions,
           review_status = excluded.review_status, version = excluded.version,
           updated_at = now()`,
        [
          m.key, m.name, m.description, m.intendedEffect,
          JSON.stringify(m.suitableStates), JSON.stringify(m.unsuitableStates),
          JSON.stringify(m.contraindications), m.evidenceLevel, m.knowledgeKind,
          m.requiredSkills, m.recommendedSeconds, m.minExposureSeconds, m.maxExposureSeconds,
          m.compatibleWith, m.incompatibleWith, JSON.stringify(m.servesDirections),
          m.reviewStatus, m.version, m.tags,
        ],
      );
    }
    console.log(`  ✓ ${MECHANISMS.length} mechanisms`);

    for (const i of INTERVENTIONS) {
      await db.query(
        `insert into interventions
           (key, name, description, target_outcome, instructions, script_template,
            min_duration_seconds, preferred_duration_seconds, max_duration_seconds,
            guidance_density, pause_pattern, voice_requirements, sound_requirements,
            silence_compatible, suitable_states, excluded_states, contraindications,
            evidence_level, knowledge_kind, required_skills, review_status,
            familiarity_group, source_tradition, boundary_tags, major, tags, version)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
                 $18::evidence_level,$19::knowledge_kind,$20,$21::review_status,$22,$23,$24,$25,$26,$27)
         on conflict (key) do update set
           name = excluded.name, description = excluded.description,
           script_template = excluded.script_template,
           boundary_tags = excluded.boundary_tags,
           contraindications = excluded.contraindications,
           review_status = excluded.review_status, version = excluded.version,
           updated_at = now()`,
        [
          i.key, i.name, i.description, i.targetOutcome, i.instructions, i.scriptTemplate,
          i.minDurationSeconds, i.preferredDurationSeconds, i.maxDurationSeconds,
          i.guidanceDensity, JSON.stringify(i.pausePattern), i.voiceRequirements, i.soundRequirements,
          i.silenceCompatible, JSON.stringify(i.suitableStates), JSON.stringify(i.excludedStates),
          JSON.stringify(i.contraindications), i.evidenceLevel, i.knowledgeKind, i.requiredSkills,
          i.reviewStatus, i.familiarityGroup, i.sourceTradition, i.boundaryTags, i.major, i.tags, i.version,
        ],
      );

      for (const link of i.mechanisms) {
        await db.query(
          `insert into mechanism_intervention_links (mechanism_key, intervention_key, weight)
           values ($1,$2,$3)
           on conflict (mechanism_key, intervention_key) do update set weight = excluded.weight`,
          [link.mechanism, i.key, link.weight],
        );
      }
    }
    console.log(`  ✓ ${INTERVENTIONS.length} interventions and their mechanism links`);

    // Professionals must exist before sources, because a verified source
    // references its verifier.
    const professionalIds = new Map<string, string>();
    for (const p of PROFESSIONALS) {
      const { rows } = await db.query<{ id: string }>(
        `insert into professional_profiles
           (name, role, organisation, biography, certifications, areas_of_expertise,
            years_of_experience, languages, contribution_count, active, avatar_initials)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         on conflict (name) do update set
           role = excluded.role, organisation = excluded.organisation,
           biography = excluded.biography, certifications = excluded.certifications,
           areas_of_expertise = excluded.areas_of_expertise,
           years_of_experience = excluded.years_of_experience,
           languages = excluded.languages, contribution_count = excluded.contribution_count,
           active = excluded.active, avatar_initials = excluded.avatar_initials
         returning id`,
        [
          p.name, p.role, p.organisation, p.biography, p.certifications, p.areasOfExpertise,
          p.yearsOfExperience, p.languages, p.contributionCount, p.active, p.avatarInitials,
        ],
      );
      professionalIds.set(p.id, rows[0].id);

      for (const skill of p.skills) {
        await db.query(
          `insert into profile_skills (professional_profile_id, skill_key, can_review)
           values ($1,$2,$3)
           on conflict (professional_profile_id, skill_key) do update set can_review = excluded.can_review`,
          [rows[0].id, skill, p.reviewPermissions.includes(skill)],
        );
      }
    }
    console.log(`  ✓ ${PROFESSIONALS.length} professional profiles`);

    for (const s of SCIENTIFIC_SOURCES) {
      await db.query(
        `insert into scientific_sources
           (id, title, authors, year, publisher, doi_or_url, source_type, abstract, summary,
            relevant_findings, limitations, evidence_quality, target_populations,
            contraindication_notes, reviewer_notes, document_path, citation,
            verification_status, verified_by, added_at)
         values ($1,$2,$3,$4,$5,$6,$7::source_type,$8,$9,$10,$11,$12::evidence_level,$13,$14,$15,$16,$17,
                 $18::verification_status,$19,$20)
         on conflict (id) do update set
           title = excluded.title, summary = excluded.summary,
           relevant_findings = excluded.relevant_findings,
           limitations = excluded.limitations,
           verification_status = excluded.verification_status,
           verified_by = excluded.verified_by`,
        [
          s.id, s.title, s.authors, s.year, s.publisher, s.doiOrUrl, s.sourceType, s.abstract,
          s.summary, s.relevantFindings, s.limitations, s.evidenceQuality, s.targetPopulations,
          s.contraindicationNotes, s.reviewerNotes, s.documentPath, s.citation,
          s.verificationStatus, s.verifiedBy ? professionalIds.get(s.verifiedBy) ?? null : null,
          s.addedAt,
        ],
      );

      for (const mechanism of s.relevantMechanisms) {
        await db.query(
          `insert into evidence_links (source_id, target_type, target_id, knowledge_kind, note)
           values ($1,'mechanism',$2,$3::knowledge_kind,null)
           on conflict (source_id, target_type, target_id) do nothing`,
          [s.id, mechanism, s.evidenceQuality === "internal_hypothesis" ? "internal_hypothesis" : "scientific_evidence"],
        );
      }
    }
    console.log(`  ✓ ${SCIENTIFIC_SOURCES.length} scientific sources and their evidence links`);

    await db.query("delete from osora_dna_profiles where name = $1", [OSORA_DNA.name]);
    await db.query(
      `insert into osora_dna_profiles (name, version, stable, adaptive, rules, active)
       values ($1,$2,$3,$4,$5,true)`,
      [
        OSORA_DNA.name, OSORA_DNA.version,
        JSON.stringify(OSORA_DNA.stable), JSON.stringify(OSORA_DNA.adaptive),
        JSON.stringify(OSORA_DNA.rules),
      ],
    );
    console.log("  ✓ Osora DNA profile");

    // The shipped example sessions go in as real rows flagged `is_example`, so
    // the studio has one source of truth rather than a database beside a set of
    // fixtures that drift apart.
    for (const e of EXPERIENCES) {
      const { rows } = await db.query<{ id: string }>(
        `insert into experiences
           (slug, title, internal_title, status, current_state, desired_state, target_outcome,
            duration_seconds, familiarity_ratio, exploration_ratio, scientific_confidence,
            settings, plan, timeline, constraints, dna_score, required_review_skills,
            contributor_ids, audio_project_id, is_example, version, created_at, updated_at)
         values ($1,$2,$3,$4::experience_status,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,null,true,$19,$20,$21)
         on conflict (slug) where slug is not null do update set
           title = excluded.title, status = excluded.status,
           plan = excluded.plan, timeline = excluded.timeline,
           settings = excluded.settings, dna_score = excluded.dna_score,
           constraints = excluded.constraints
         returning id`,
        [
          e.id, e.title, e.internalTitle, e.status,
          JSON.stringify(e.currentState), JSON.stringify(e.desired), e.targetOutcome,
          e.durationSeconds, e.plan?.familiarityRatio ?? null, e.plan?.explorationRatio ?? null,
          e.scientificConfidence, JSON.stringify(e.settings), JSON.stringify(e.plan),
          JSON.stringify(e.timeline), JSON.stringify(e.constraints), JSON.stringify(e.dnaScore),
          e.requiredReviewSkills, e.contributorIds, e.version, e.createdAt, e.updatedAt,
        ],
      );

      const experienceId = rows[0].id;
      await db.query("delete from session_sections where experience_id = $1", [experienceId]);
      for (const section of e.timeline?.sections ?? []) {
        await db.query(
          `insert into session_sections
             (experience_id, section_key, ordinal, kind, title, mechanism_key, intervention_key,
              body, word_count, word_budget, estimated_speech_seconds, actual_speech_seconds,
              pause_seconds, sound_only_seconds, transition_seconds, start_seconds, end_seconds,
              evidence_source_ids)
           values ($1,$2,$3,$4::section_kind,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
          [
            experienceId, section.id, section.order, section.kind, section.title,
            section.mechanism, section.interventionKey, section.text, section.wordCount,
            section.wordBudget, section.estimatedSpeechSeconds, section.actualSpeechSeconds,
            section.pauseSeconds, section.soundOnlySeconds, section.transitionSeconds,
            section.startSeconds, section.endSeconds, section.evidenceSourceIds,
          ],
        );
      }
    }
    console.log(`  ✓ ${EXPERIENCES.length} example sessions with their sections`);

    console.log("Seed complete.");
  } finally {
    await db.end();
  }
}

async function status() {
  const db = pool();
  try {
    const { rows: version } = await db.query<{ version: string }>("select version()");
    console.log(version[0].version.split(",")[0]);

    const { rows: migrations } = await db.query<{ version: string; applied_at: string }>(
      "select version, applied_at from schema_migrations order by version",
    ).catch(() => ({ rows: [] as Array<{ version: string; applied_at: string }> }));
    console.log(`\nMigrations applied: ${migrations.length}`);
    for (const m of migrations) console.log(`  · ${m.version}`);

    const { rows: tables } = await db.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema='public' order by table_name",
    );
    console.log(`\nTables: ${tables.length}`);

    console.log("\nRow counts:");
    for (const t of tables) {
      const { rows } = await db.query<{ count: string }>(
        `select count(*)::text as count from "${t.table_name}"`,
      );
      if (Number(rows[0].count) > 0) console.log(`  ${t.table_name.padEnd(32)} ${rows[0].count}`);
    }
  } finally {
    await db.end();
  }
}

const command = process.argv[2];
const commands: Record<string, () => Promise<void>> = { migrate, seed, status };

if (!command || !commands[command]) {
  console.error("Usage: tsx scripts/db.ts <migrate|seed|status>");
  process.exit(1);
}

commands[command]().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
