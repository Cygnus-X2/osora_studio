import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { envIsSet, envValue } from "@/lib/env";
import type { Database } from "./types";

/**
 * Server-side Supabase clients.
 *
 * Two of them, deliberately:
 *
 *  - `getSupabaseAnon()` uses the anon key and respects row-level security. It
 *    is what request handlers acting on behalf of a person should use.
 *
 *  - `getSupabaseService()` uses the service-role key and bypasses RLS. It
 *    exists for the pipeline work that has no user — measuring an asset,
 *    recording a generation run — and is never reachable from a client
 *    component because this module imports `server-only`.
 */

let anonClient: SupabaseClient<Database> | null = null;
let serviceClient: SupabaseClient<Database> | null = null;

function requireEnv(name: string): string {
  const value = envValue(name);
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env.local and fill it in, or keep the studio on seeded data.`,
    );
  }
  return value;
}

export function isSupabaseConfigured(): boolean {
  return envIsSet("NEXT_PUBLIC_SUPABASE_URL") && envIsSet("NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

export function getSupabaseAnon(): SupabaseClient<Database> {
  if (anonClient) return anonClient;
  anonClient = createClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { auth: { persistSession: false } },
  );
  return anonClient;
}

export function getSupabaseService(): SupabaseClient<Database> {
  if (serviceClient) return serviceClient;
  serviceClient = createClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return serviceClient;
}

/**
 * A time-limited URL for a stored asset. Storage stays private; nothing is
 * served from a public bucket.
 */
export async function signedAudioUrl(
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const bucket = envValue("SUPABASE_AUDIO_BUCKET") ?? "audio";
  const { data, error } = await getSupabaseService()
    .storage.from(bucket)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error) return null;
  return data.signedUrl;
}
