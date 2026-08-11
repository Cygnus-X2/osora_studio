import "server-only";

import { HostedLlmProvider, type HostedVendor } from "./hosted";
import { MockLlmProvider } from "./mock";
import { envIsSet, envValue } from "@/lib/env";
import type { LlmProvider } from "./types";

export type LlmProviderId = "mock" | HostedVendor;

export const LLM_PROVIDER_LABELS: Record<LlmProviderId, string> = {
  mock: "Mock provider",
  anthropic: "Anthropic",
  openai: "OpenAI",
  gemini: "Google Gemini",
};

const cache = new Map<LlmProviderId, LlmProvider>();

/**
 * Resolves an LLM provider. Server-only by construction — this module imports
 * `server-only`, so a client component that reaches for it fails at build time
 * rather than shipping a key to the browser.
 */
export function getLlmProvider(id: LlmProviderId = defaultLlmProviderId()): LlmProvider {
  const cached = cache.get(id);
  if (cached) return cached;

  const provider: LlmProvider =
    id === "mock" ? new MockLlmProvider() : new HostedLlmProvider(id);
  cache.set(id, provider);
  return provider;
}

export function defaultLlmProviderId(): LlmProviderId {
  const configured = envValue("LLM_PROVIDER") as LlmProviderId | undefined;
  if (configured && configured in LLM_PROVIDER_LABELS) return configured;
  return "mock";
}

/** Which providers currently have credentials. Safe to send to the client. */
export function llmProviderAvailability(): Array<{
  id: LlmProviderId;
  label: string;
  configured: boolean;
}> {
  return [
    { id: "mock", label: LLM_PROVIDER_LABELS.mock, configured: true },
    { id: "anthropic", label: LLM_PROVIDER_LABELS.anthropic, configured: envIsSet("ANTHROPIC_API_KEY") },
    { id: "openai", label: LLM_PROVIDER_LABELS.openai, configured: envIsSet("OPENAI_API_KEY") },
    { id: "gemini", label: LLM_PROVIDER_LABELS.gemini, configured: envIsSet("GOOGLE_API_KEY") },
  ];
}

export * from "./types";
export { buildHardConstraints, PROMPT_VERSION } from "./prompt";
