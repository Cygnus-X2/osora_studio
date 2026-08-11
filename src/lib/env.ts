/**
 * Environment reading.
 *
 * `.env.example` lists optional variables as bare keys — `FFPROBE_PATH=` — so
 * copying it produces empty strings rather than absent values. `??` does not
 * fall back on an empty string, which turns "left it blank" into "run the
 * binary called ''". Everything reads env through here instead.
 */
export function envValue(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function envOr(name: string, fallback: string): string {
  return envValue(name) ?? fallback;
}

export function envIsSet(name: string): boolean {
  return envValue(name) !== undefined;
}
