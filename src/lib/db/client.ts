import "server-only";

import { Pool } from "pg";
import { envValue } from "@/lib/env";

/**
 * Postgres access for the self-hosted deployment.
 *
 * The studio can run without a database — the first milestone reads seeded
 * data — so everything here degrades rather than throws. `isDatabaseConfigured`
 * is what callers check before assuming there is one.
 */

let pool: Pool | null = null;

export function isDatabaseConfigured(): boolean {
  return envValue("DATABASE_URL") !== undefined;
}

export function getPool(): Pool {
  if (pool) return pool;
  const connectionString = envValue("DATABASE_URL");
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set.");
  }
  pool = new Pool({
    connectionString,
    max: Number(envValue("DATABASE_POOL_MAX") ?? 8),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
  });
  return pool;
}

export async function query<T>(text: string, values: unknown[] = []): Promise<T[]> {
  const result = await getPool().query(text, values);
  return result.rows as T[];
}

export interface DatabaseStatus {
  configured: boolean;
  reachable: boolean;
  version: string | null;
  migrationsApplied: number;
  tables: number;
  rowCounts: Array<{ table: string; rows: number }>;
  error: string | null;
}

const COUNTED_TABLES = [
  "state_dimensions",
  "mechanisms",
  "interventions",
  "scientific_sources",
  "professional_profiles",
  "professional_skills",
  "rules",
  "osora_dna_profiles",
  "experiences",
  "audio_assets",
];

/**
 * A cheap, non-throwing snapshot for the health endpoint and the settings
 * screen. A database that is configured but unreachable is a fact worth
 * showing, not an exception worth crashing a page render over.
 */
export async function databaseStatus(): Promise<DatabaseStatus> {
  const base: DatabaseStatus = {
    configured: isDatabaseConfigured(),
    reachable: false,
    version: null,
    migrationsApplied: 0,
    tables: 0,
    rowCounts: [],
    error: null,
  };
  if (!base.configured) return base;

  try {
    const [{ version }] = await query<{ version: string }>("select version() as version");
    const [{ count: tables }] = await query<{ count: string }>(
      "select count(*)::text as count from information_schema.tables where table_schema = 'public'",
    );

    let migrationsApplied = 0;
    try {
      const [{ count }] = await query<{ count: string }>(
        "select count(*)::text as count from schema_migrations",
      );
      migrationsApplied = Number(count);
    } catch {
      migrationsApplied = 0;
    }

    const rowCounts: DatabaseStatus["rowCounts"] = [];
    for (const table of COUNTED_TABLES) {
      try {
        const [{ count }] = await query<{ count: string }>(
          `select count(*)::text as count from ${table}`,
        );
        rowCounts.push({ table, rows: Number(count) });
      } catch {
        // Table absent — migrations have not been applied yet.
      }
    }

    return {
      ...base,
      reachable: true,
      version: version.split(" ").slice(0, 2).join(" "),
      migrationsApplied,
      tables: Number(tables),
      rowCounts,
    };
  } catch (error) {
    return {
      ...base,
      error: error instanceof Error ? error.message : "Could not reach the database.",
    };
  }
}
