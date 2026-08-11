-- ============================================================================
-- Reference data.
--
-- Skills and rules are not application content — they are the vocabulary the
-- rest of the schema references by foreign key, so they belong in a migration
-- rather than in a seed script that might not have run.
-- ============================================================================

insert into professional_skills (key, label, description) values
  ('meditation_instruction', 'Meditation instruction', 'Practice design, attention training, session structure.'),
  ('clinical_psychology',    'Clinical psychology',    'Cognitive and acceptance-based content.'),
  ('psychotherapy',          'Psychotherapy',          'Therapeutic framing and its limits in a wellness product.'),
  ('breathwork',             'Breathwork',             'Breath protocols and their contraindications.'),
  ('trauma_informed_practice','Trauma-informed practice','Safety gating, titration, permission to stop.'),
  ('somatic_practice',       'Somatic practice',       'Body-based attention and movement.'),
  ('sleep_science',          'Sleep science',          'Evening and pre-sleep content.'),
  ('neuroscience',           'Neuroscience',           'Mechanistic brain claims.'),
  ('pain_science',           'Pain science',           'Attention near painful regions.'),
  ('stress_regulation',      'Stress regulation',      'Arousal and recovery.'),
  ('sound_design',           'Sound design',           'Beds, levels, loops, transients.'),
  ('music_composition',      'Music composition',      'Rhythmic and tonal material.'),
  ('voice_direction',        'Voice direction',        'Delivery, pacing, intonation.'),
  ('scientific_research',    'Scientific research',    'Evidence appraisal and study design.'),
  ('medical_review',         'Medical review',         'Anything touching a clinical construct.'),
  ('copy_editing',           'Copy editing',           'Plain language and sentence length.')
on conflict (key) do nothing;

insert into rules (key, name, description, category, scope, severity, logic_summary, error_message, suggested_correction, version, owner) values
  ('duration_window', 'Session lands inside its duration window',
   'A session must finish within ±30 seconds of its target.',
   'timing', 'experience', 'blocking',
   'abs(timeline.totalSeconds − targetSeconds) <= 30',
   'The arranged timeline is outside the ±30s window around the target duration.',
   'Adjust pause allocation or reduce text. Do not compress narration beyond the configured speaking-rate bounds.',
   4, 'Production'),

  ('audio_measured', 'Every audio asset is measured',
   'No generated or uploaded asset may be marked ready on provider metadata alone.',
   'audio_quality', 'audio_project', 'blocking',
   'every asset with status = ready has a completed ffprobe measurement',
   'An audio asset is marked ready without a completed server-side measurement.',
   'Re-run duration analysis on the asset before continuing.',
   5, 'Production'),

  ('gentle_opening', 'The first 20 seconds carry no complex instruction',
   'Nothing in the opening 20 seconds may ask for more than arriving.',
   'consistency', 'experience', 'warning',
   'no dense-guidance section starts before t = 20s',
   'A dense instruction block starts inside the first 20 seconds.',
   'Move the block later and let arrival and orientation hold the opening.',
   3, 'Editorial'),

  ('breath_contraindications', 'Breathing content declares contraindications',
   'Any breath-based intervention must carry at least one contraindication note.',
   'safety', 'intervention', 'blocking',
   'every breath-mechanism block has contraindications',
   'A breathing intervention is used without declared contraindications.',
   'Add contraindications to the intervention and route it to breathwork review.',
   4, 'Safety'),

  ('claims_have_sources', 'Every scientific claim links to a verified source',
   'Detected mechanism or physiological claims must reference a verified source.',
   'scientific_integrity', 'experience', 'blocking',
   'claims detected implies at least one linked source with verification_status = verified',
   'The script makes a claim with no verified source behind it.',
   'Link a verified source, or rewrite the line as a subjective description.',
   6, 'Science'),

  ('prohibited_claims', 'No cure, treatment, prevention or proof claims',
   'Language asserting that Osora cures, treats, prevents, guarantees or is clinically proven is never publishable.',
   'safety', 'experience', 'blocking',
   'no blocking claim pattern matches the script',
   'The script contains language that cannot appear in a wellness product.',
   'Remove the phrase. There is no review that can approve it.',
   5, 'Safety'),

  ('trauma_sensitive_review', 'Trauma-sensitive content has qualified review',
   'Content requiring trauma-informed practice must be approved by a reviewer holding that skill.',
   'process', 'experience', 'blocking',
   'required review skills are covered by approved reviews',
   'Trauma-sensitive material is present without trauma-informed approval.',
   'Request review from a professional holding trauma-informed practice.',
   4, 'Safety'),

  ('sleep_fade', 'Sleep sessions have a long final fade',
   'A session with a sleep intent must fade out over at least 15 seconds.',
   'audio_quality', 'experience', 'warning',
   'intent = prepare_for_sleep implies fade_out_seconds >= 15',
   'A sleep session ends with a fade shorter than 15 seconds.',
   'Increase the fade-out; an abrupt ending undoes the session.',
   3, 'Production'),

  ('sound_under_speech', 'Background audio does not overpower speech',
   'The ambient bed must sit at least 12 dB below the narration track.',
   'audio_quality', 'audio_project', 'warning',
   'narration.volume_db − ambient.volume_db >= 12',
   'The ambient bed is too close in level to the narration.',
   'Lower the ambient track or raise narration to restore the 12 dB gap.',
   3, 'Sound'),

  ('sound_licence', 'Generated sounds carry licence metadata',
   'Every sound asset must record its licence before it can ship.',
   'licensing', 'audio_project', 'blocking',
   'every sound asset has a licence',
   'A sound asset has no licence recorded.',
   'Add licence metadata to the asset.',
   2, 'Sound'),

  ('hard_boundaries_respected', 'Hard user boundaries are never violated',
   'No block in the plan may carry a tag blocked by one of the user hard boundaries.',
   'safety', 'user_profile', 'blocking',
   'planned block boundary_tags intersect blocked tags is empty',
   'A planned block violates a hard user boundary.',
   'Re-run the State Engine. A violation here means the plan was edited after gating.',
   6, 'Safety'),

  ('one_unfamiliar_major', 'At most one unfamiliar major intervention',
   'A normal session introduces at most one major unfamiliar intervention.',
   'consistency', 'experience', 'warning',
   'count(major and not familiar) <= dna.max_unfamiliar_major_interventions',
   'The session introduces more unfamiliar major interventions than the DNA allows.',
   'Swap one for a familiar block from the same mechanism.',
   4, 'Editorial'),

  ('reviews_before_publish', 'Publication requires every blocking review',
   'A session cannot be published until all required reviews are approved.',
   'process', 'experience', 'blocking',
   'status = published implies no unsatisfied blocking review requirement',
   'This session is not eligible for publication yet.',
   'Complete the outstanding reviews listed in the review panel.',
   5, 'Process'),

  ('silence_ratio_band', 'Silence ratio stays inside the DNA band',
   'Silence share must remain inside the configured adaptive range.',
   'consistency', 'experience', 'recommendation',
   'dna.silence_ratio_range[0] <= plan.silence_ratio <= dna.silence_ratio_range[1]',
   'The silence ratio sits outside the Osora DNA band.',
   'Adjust the silence block, or record why this session is an exception.',
   2, 'Editorial'),

  ('evidence_present', 'Every mechanism has supporting evidence',
   'Each mechanism in the plan should reference at least one source.',
   'scientific_integrity', 'experience', 'recommendation',
   'every mechanism in the plan has at least one supporting source',
   'A mechanism in this session has no supporting source recorded.',
   'Link a source, or mark the mechanism as an internal hypothesis.',
   3, 'Science')
on conflict (key) do nothing;
