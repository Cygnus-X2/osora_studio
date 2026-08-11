import type { OsoraDnaProfile } from "@/domain/types";

/**
 * Osora DNA.
 *
 * `stable` is what makes two very different personalised sessions still feel
 * like the same product. `adaptive` is the part the State Engine is allowed to
 * move. `rules` govern how fast the adaptive part may travel.
 */
export const OSORA_DNA: OsoraDnaProfile = {
  id: "dna-osora-core",
  name: "Osora core",
  version: 7,
  stable: {
    openingStyle:
      "Ambience before any voice. The first line names what this is and how long it lasts. Nothing is asked in the first twenty seconds.",
    closingStyle:
      "Three statements, each shorter than the last, then quiet under a long fade. The session never ends on an instruction.",
    voiceIdentity: "voice-aurel",
    languageTone:
      "Plain, concrete, unhurried. Short sentences. No metaphor that needs unpacking. Never clever.",
    pacingPrinciples:
      "Roughly 105 words per minute. Every instruction is followed by enough silence to actually do it.",
    safetyFraming:
      "Everything is offered, never required. Stopping early is always a complete session. No claim is ever made about what will happen.",
    soundIdentity:
      "Continuous beds with no identifiable events. Nothing a listener can name, because naming pulls attention.",
    sessionGrammar: ["opening", "orientation", "breath", "body", "main", "silence", "closing"],
    familiarAnchor: "Three points of contact — feet, seat, hands, always in that order.",
    emotionalAttitude: "Warm but not soothing. Present without being reassuring.",
    directiveness: "invitational",
  },
  adaptive: {
    // Share of the session with no voice — dedicated silence plus the pauses
    // inside guided blocks. Below 35% an Osora session reads as a talk.
    silenceRatioRange: [0.35, 0.62],
    guidanceDensityRange: ["sparse", "moderate"],
    allowedImageryThemes: [
      "open water",
      "wide field",
      "early light",
      "still air",
      "distant hills",
      "shoreline",
    ],
    soundscapeOptions: ["low_bed", "warm_drone", "soft_air", "near_silence", "slow_pulse"],
    voiceIntensityRange: [0.3, 0.7],
  },
  rules: {
    defaultFamiliarityRatio: 0.8,
    defaultExplorationRatio: 0.2,
    maxUnfamiliarMajorInterventions: 1,
    maxSimultaneousDimensionChanges: 2,
    explorationDropAfterNegative: 0.1,
    explorationGrowthAfterPositive: 0.03,
    minRecognisableStructureRatio: 0.6,
    lockedSections: ["opening", "closing"],
  },
  updatedAt: "2026-07-28T10:12:00.000Z",
};

/** Rules stated for the DNA screen, with the reasoning behind each. */
export const DNA_RULE_NOTES = [
  {
    key: "familiarity",
    label: "Familiarity 80% / exploration 20%",
    detail:
      "Four fifths of every session is material this person already knows. Recognition is what lets the remaining fifth land.",
  },
  {
    key: "one_unfamiliar",
    label: "One major unfamiliar intervention per session",
    detail:
      "Two new things at once makes it impossible to tell which one worked — and makes the session feel like a different product.",
  },
  {
    key: "no_simultaneous_change",
    label: "Never change voice, structure, sound and intervention style together",
    detail:
      "At most two dimensions move per session. Beyond that, outcome data becomes uninterpretable.",
  },
  {
    key: "exploration_response",
    label: "Exploration drops fast, grows slowly",
    detail:
      "−10 points after a negatively rated session, +3 after a positive one. Trust is cheaper to lose than to build.",
  },
  {
    key: "locked_edges",
    label: "Opening and closing stay within approved patterns",
    detail: "The edges of the session carry the identity. They are not personalisation surface.",
  },
  {
    key: "recognisable_floor",
    label: "At least 60% recognisable structure",
    detail: "Below this, a personalised session stops being recognisably Osora.",
  },
];
