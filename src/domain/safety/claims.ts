import type { ProfessionalSkillKey } from "@/domain/types";

/**
 * Claim detection.
 *
 * Osora produces wellness and educational content. It does not diagnose, does
 * not treat, and does not claim proof. This module finds language that would
 * cross that line and routes it to the review that can approve it — or, for
 * the worst cases, blocks it outright.
 */

export type ContentCategory =
  | "wellness"
  | "educational"
  | "medical_advice"
  | "clinical_treatment";

export type ClaimSeverity = "note" | "review_required" | "blocking";

export interface ClaimPattern {
  key: string;
  /** Word-boundary matched, case-insensitive. */
  pattern: RegExp;
  label: string;
  severity: ClaimSeverity;
  category: ContentCategory;
  requiresSkill: ProfessionalSkillKey | null;
  explanation: string;
  suggestion: string;
}

export const CLAIM_PATTERNS: ClaimPattern[] = [
  {
    key: "cures",
    pattern: /\bcure[sd]?\b/i,
    label: "Cure claim",
    severity: "blocking",
    category: "clinical_treatment",
    requiresSkill: "medical_review",
    explanation: "States that the content resolves a condition. Osora never makes cure claims.",
    suggestion: "Remove entirely. There is no approvable form of this claim in a wellness product.",
  },
  {
    key: "treats",
    pattern: /\btreat(s|ed|ing|ment)?\b/i,
    label: "Treatment claim",
    severity: "blocking",
    category: "clinical_treatment",
    requiresSkill: "medical_review",
    explanation: "Frames the session as clinical treatment.",
    suggestion: "Rewrite as what the session invites, not what it does to a condition.",
  },
  {
    key: "prevents",
    pattern: /\bprevent(s|ed|ing|ion)?\b/i,
    label: "Prevention claim",
    severity: "blocking",
    category: "medical_advice",
    requiresSkill: "medical_review",
    explanation: "Asserts a protective medical effect.",
    suggestion: "Remove. Prevention claims require regulated evidence Osora does not hold.",
  },
  {
    key: "guarantees",
    pattern: /\bguarantee(s|d)?\b/i,
    label: "Guarantee",
    severity: "blocking",
    category: "medical_advice",
    requiresSkill: null,
    explanation: "Promises an outcome. Individual responses vary and are never guaranteed.",
    suggestion: 'Replace with conditional language: "many people find…", "you may notice…".',
  },
  {
    key: "clinically_proven",
    pattern: /\bclinically[\s-]?proven\b/i,
    label: "Clinically proven",
    severity: "blocking",
    category: "medical_advice",
    requiresSkill: "medical_review",
    explanation: "A regulated phrase implying clinical trial evidence for this product.",
    suggestion: "Remove, or cite the specific trial and route through medical review.",
  },
  {
    key: "scientifically_proven",
    pattern: /\bscientifically[\s-]?proven\b/i,
    label: "Scientifically proven",
    severity: "blocking",
    category: "medical_advice",
    requiresSkill: "scientific_research",
    explanation: 'Science does not "prove" in this sense, and the phrase overstates any evidence base.',
    suggestion: 'Use "research suggests" with a linked verified source.',
  },
  {
    key: "diagnose",
    pattern: /\b(diagnos(e|es|ed|is|tic))\b/i,
    label: "Diagnostic language",
    severity: "blocking",
    category: "clinical_treatment",
    requiresSkill: "medical_review",
    explanation: "The platform must never diagnose or imply a diagnosis.",
    suggestion: "Describe the self-reported state instead of naming a condition.",
  },
  {
    key: "therapy",
    pattern: /\b(therapy|therapeutic|therapist)\b/i,
    label: "Therapy framing",
    severity: "review_required",
    category: "clinical_treatment",
    requiresSkill: "psychotherapy",
    explanation: "Implies a clinical relationship that Osora does not provide.",
    suggestion: "Reframe as a practice or a session. Requires psychotherapy review if kept.",
  },
  {
    key: "reduces_symptom",
    pattern: /\b(reduces?|relieves?|eliminates?)\s+(symptoms?|anxiety|depression|insomnia|pain)\b/i,
    label: "Symptom-reduction claim",
    severity: "review_required",
    category: "medical_advice",
    requiresSkill: "medical_review",
    explanation: "Names a clinical construct and asserts an effect on it.",
    suggestion: "Speak to the self-reported dimension instead, and link a verified source.",
  },
  {
    key: "medication",
    pattern: /\b(medication|prescription|dosage|antidepressants?)\b/i,
    label: "Medication reference",
    severity: "blocking",
    category: "medical_advice",
    requiresSkill: "medical_review",
    explanation: "Session content must never touch medication.",
    suggestion: "Remove and, if the user context requires it, defer to a professional.",
  },
  {
    key: "rewires",
    pattern: /\brewir(e|es|ing)\b|\bneuroplasticity\b/i,
    label: "Neuro-claim",
    severity: "review_required",
    category: "educational",
    requiresSkill: "neuroscience",
    explanation: "A mechanistic brain claim that needs a source and neuroscience review.",
    suggestion: "Either cite the specific finding or describe the felt experience instead.",
  },
  {
    key: "activates_vagus",
    pattern: /\b(vagus|vagal|parasympathetic|nervous system)\b/i,
    label: "Physiological mechanism claim",
    severity: "review_required",
    category: "educational",
    requiresSkill: "scientific_research",
    explanation: "A physiological claim requiring a verified source.",
    suggestion: "Link a verified source, or replace with the subjective description.",
  },
];

export interface DetectedClaim {
  pattern: ClaimPattern;
  match: string;
  sectionId: string | null;
  context: string;
}

export function detectClaims(text: string, sectionId: string | null = null): DetectedClaim[] {
  const found: DetectedClaim[] = [];
  for (const pattern of CLAIM_PATTERNS) {
    const regex = new RegExp(pattern.pattern.source, "gi");
    for (const match of text.matchAll(regex)) {
      const index = match.index ?? 0;
      found.push({
        pattern,
        match: match[0],
        sectionId,
        context: text
          .slice(Math.max(0, index - 45), Math.min(text.length, index + match[0].length + 45))
          .replace(/\s+/g, " ")
          .trim(),
      });
    }
  }
  return found;
}

export function requiredSkillsForClaims(claims: DetectedClaim[]): ProfessionalSkillKey[] {
  const skills = new Set<ProfessionalSkillKey>();
  for (const claim of claims) {
    if (claim.pattern.requiresSkill) skills.add(claim.pattern.requiresSkill);
  }
  return [...skills];
}

export function hasBlockingClaim(claims: DetectedClaim[]): boolean {
  return claims.some((c) => c.pattern.severity === "blocking");
}

export const CONTENT_CATEGORY_LABELS: Record<ContentCategory, string> = {
  wellness: "Wellness content",
  educational: "Educational content",
  medical_advice: "Medical advice",
  clinical_treatment: "Clinical treatment",
};
