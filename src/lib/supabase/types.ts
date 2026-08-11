/**
 * Supabase-compatible database types.
 *
 * Hand-maintained to match `supabase/migrations`. Once a project is linked,
 * regenerate with:
 *
 *   npx supabase gen types typescript --linked > src/lib/supabase/types.ts
 *
 * The enums below are the same closed sets the migration declares, so a value
 * that Postgres would reject also fails to typecheck.
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type DbReviewStatus =
  | "draft"
  | "in_review"
  | "changes_requested"
  | "approved"
  | "retired";

export type DbEvidenceLevel =
  | "strong"
  | "moderate"
  | "preliminary"
  | "expert_consensus"
  | "traditional_practice"
  | "internal_hypothesis"
  | "unverified";

export type DbKnowledgeKind =
  | "scientific_evidence"
  | "expert_opinion"
  | "traditional_practice"
  | "internal_hypothesis"
  | "ai_suggestion";

export type DbSourceType =
  | "peer_reviewed_paper"
  | "systematic_review"
  | "meta_analysis"
  | "clinical_guideline"
  | "book"
  | "expert_protocol"
  | "training_material"
  | "internal_research_note"
  | "traditional_source";

export type DbVerificationStatus = "unverified" | "in_verification" | "verified" | "disputed";

export type DbExperienceStatus =
  | "idea"
  | "research"
  | "draft"
  | "composition"
  | "script_generation"
  | "audio_generation"
  | "internal_review"
  | "scientific_review"
  | "safety_review"
  | "audio_review"
  | "changes_requested"
  | "approved"
  | "published"
  | "archived";

export type DbConstraintType = "hard" | "soft";
export type DbConstraintScope = "always" | "this_session" | "evening" | "sleep_only" | "daytime";
export type DbRuleSeverity = "information" | "recommendation" | "warning" | "blocking";
export type DbRuleScope =
  | "global"
  | "experience"
  | "mechanism"
  | "intervention"
  | "user_profile"
  | "experiment"
  | "session"
  | "audio_project";
export type DbRuleCategory =
  | "timing"
  | "safety"
  | "scientific_integrity"
  | "audio_quality"
  | "consistency"
  | "process"
  | "licensing";
export type DbReviewKind =
  | "internal"
  | "scientific"
  | "safety"
  | "professional"
  | "audio"
  | "sound_design";
export type DbReviewDecision = "pending" | "approved" | "changes_requested" | "rejected";
export type DbAudioAssetStatus = "pending" | "generating" | "analysing" | "ready" | "failed";
export type DbAudioAssetOrigin = "generated" | "uploaded" | "processed";
export type DbAudioTrackKind =
  | "narration"
  | "ambient"
  | "music"
  | "sfx"
  | "breath_cue"
  | "silence"
  | "intro"
  | "outro";
export type DbGenerationStatus = "queued" | "running" | "succeeded" | "failed";
export type DbGenerationCapability =
  | "outline"
  | "script"
  | "improve"
  | "alternative"
  | "compose"
  | "rank"
  | "perspective"
  | "claims"
  | "sources"
  | "contraindications"
  | "flow"
  | "tts"
  | "voice_preview"
  | "sound_effect"
  | "ambient";
export type DbExperimentStatus = "design" | "review" | "running" | "paused" | "stopped" | "analysed";
export type DbExperimentVariable =
  | "intervention_sequence"
  | "pause_duration"
  | "silence_ratio"
  | "voice"
  | "speaking_speed"
  | "guidance_density"
  | "direct_vs_invitational"
  | "ambient_vs_near_silence"
  | "body_first_vs_breath_first"
  | "opening_duration"
  | "closing_duration";
export type DbStudioRole =
  | "admin"
  | "creator"
  | "scientific_reviewer"
  | "professional_reviewer"
  | "safety_reviewer"
  | "sound_designer"
  | "audio_reviewer"
  | "experiment_owner"
  | "publisher"
  | "viewer";
export type DbSectionKind =
  | "intention"
  | "opening"
  | "orientation"
  | "main"
  | "transition"
  | "breath"
  | "body"
  | "reflection"
  | "silence"
  | "sound_only"
  | "closing"
  | "aftercare"
  | "rationale"
  | "contraindications";

/** Row / Insert / Update triple, matching what `gen types` produces. */
type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
};

export interface Database {
  public: {
    Tables: {
      users: Table<{ id: string; email: string; created_at: string }>;

      profiles: Table<{
        id: string;
        display_name: string;
        initials: string;
        roles: DbStudioRole[];
        professional_profile_id: string | null;
        created_at: string;
        updated_at: string;
      }>;

      professional_skills: Table<{ key: string; label: string; description: string | null }>;

      professional_profiles: Table<{
        id: string;
        name: string;
        role: string;
        organisation: string | null;
        biography: string | null;
        certifications: string[];
        areas_of_expertise: string[];
        years_of_experience: number;
        languages: string[];
        contribution_count: number;
        active: boolean;
        avatar_initials: string;
        created_at: string;
      }>;

      profile_skills: Table<{
        professional_profile_id: string;
        skill_key: string;
        can_review: boolean;
      }>;

      state_dimensions: Table<{
        key: string;
        name: string;
        description: string;
        scale: string;
        min_value: number;
        max_value: number;
        higher_is_pleasant: boolean;
        user_facing_wording: string;
        internal_interpretation: string;
        allowed_use_cases: string[];
        safety_notes: string | null;
        version: number;
      }>;

      state_check_ins: Table<{
        id: string;
        user_id: string;
        captured_at: string;
        profile: Json;
        note: string | null;
      }>;

      desired_states: Table<{
        id: string;
        user_id: string;
        directions: string[];
        intent: string;
        environment: string;
        available_seconds: number;
        context: string | null;
        created_at: string;
      }>;

      user_preferences: Table<{
        id: string;
        user_id: string;
        key: string;
        strength: number;
        created_at: string;
      }>;

      user_constraints: Table<{
        id: string;
        user_id: string;
        type: DbConstraintType;
        key: string;
        value: string | null;
        reason: string | null;
        scope: DbConstraintScope;
        created_at: string;
        updated_at: string;
      }>;

      mechanisms: Table<{
        key: string;
        name: string;
        description: string;
        intended_effect: string;
        suitable_states: Json;
        unsuitable_states: Json;
        contraindications: Json;
        evidence_level: DbEvidenceLevel;
        knowledge_kind: DbKnowledgeKind;
        required_skills: string[];
        recommended_seconds: number;
        min_exposure_seconds: number;
        max_exposure_seconds: number;
        compatible_with: string[];
        incompatible_with: string[];
        serves_directions: Json;
        review_status: DbReviewStatus;
        version: number;
        tags: string[];
        updated_at: string;
      }>;

      mechanism_versions: Table<{
        id: string;
        mechanism_key: string;
        version: number;
        payload: Json;
        author_id: string | null;
        created_at: string;
      }>;

      interventions: Table<{
        key: string;
        name: string;
        description: string;
        target_outcome: string;
        instructions: string;
        script_template: string;
        min_duration_seconds: number;
        preferred_duration_seconds: number;
        max_duration_seconds: number;
        guidance_density: string;
        pause_pattern: Json;
        voice_requirements: string | null;
        sound_requirements: string | null;
        silence_compatible: boolean;
        suitable_states: Json;
        excluded_states: Json;
        contraindications: Json;
        evidence_level: DbEvidenceLevel;
        knowledge_kind: DbKnowledgeKind;
        required_skills: string[];
        review_status: DbReviewStatus;
        familiarity_group: string;
        source_tradition: string;
        boundary_tags: string[];
        major: boolean;
        tags: string[];
        version: number;
        updated_at: string;
      }>;

      intervention_versions: Table<{
        id: string;
        intervention_key: string;
        version: number;
        payload: Json;
        author_id: string | null;
        created_at: string;
      }>;

      mechanism_intervention_links: Table<{
        mechanism_key: string;
        intervention_key: string;
        weight: number;
      }>;

      scientific_sources: Table<{
        id: string;
        title: string;
        authors: string[];
        year: number | null;
        publisher: string | null;
        doi_or_url: string | null;
        source_type: DbSourceType;
        abstract: string | null;
        summary: string | null;
        relevant_findings: string[];
        limitations: string[];
        evidence_quality: DbEvidenceLevel;
        target_populations: string[];
        contraindication_notes: string[];
        reviewer_notes: string | null;
        document_path: string | null;
        citation: string;
        verification_status: DbVerificationStatus;
        verified_by: string | null;
        added_at: string;
      }>;

      evidence_links: Table<{
        id: string;
        source_id: string;
        target_type: string;
        target_id: string;
        knowledge_kind: DbKnowledgeKind;
        note: string | null;
        created_at: string;
      }>;

      osora_dna_profiles: Table<{
        id: string;
        name: string;
        version: number;
        stable: Json;
        adaptive: Json;
        rules: Json;
        active: boolean;
        updated_at: string;
      }>;

      experiments: Table<{
        id: string;
        name: string;
        hypothesis: string;
        eligible_population: string | null;
        exclusion_criteria: string[];
        variable: DbExperimentVariable;
        primary_outcome: string;
        secondary_outcomes: string[];
        safety_guardrails: string[];
        minimum_sample: number;
        stop_condition: string;
        owner_id: string | null;
        required_review: DbReviewKind;
        status: DbExperimentStatus;
        results: string | null;
        interpretation: string | null;
        started_at: string | null;
        updated_at: string;
      }>;

      experiment_variants: Table<{
        id: string;
        experiment_id: string;
        label: string;
        is_control: boolean;
        description: string | null;
        settings_delta: Json;
      }>;

      experiment_assignments: Table<{
        id: string;
        experiment_id: string;
        variant_id: string;
        user_id: string;
        experience_id: string | null;
        assigned_at: string;
      }>;

      experiences: Table<{
        id: string;
        title: string;
        internal_title: string | null;
        status: DbExperienceStatus;
        current_state: Json;
        desired_state: Json;
        target_outcome: string | null;
        duration_seconds: number;
        familiarity_ratio: number | null;
        exploration_ratio: number | null;
        scientific_confidence: number | null;
        settings: Json;
        dna_profile_id: string | null;
        dna_score: Json | null;
        experiment_id: string | null;
        required_review_skills: string[];
        version: number;
        created_by: string | null;
        updated_by: string | null;
        created_at: string;
        updated_at: string;
      }>;

      experience_versions: Table<{
        id: string;
        experience_id: string;
        version: number;
        label: string;
        summary: string | null;
        payload: Json;
        author_id: string | null;
        created_at: string;
      }>;

      session_plans: Table<{
        id: string;
        experience_id: string;
        target: string;
        duration_seconds: number;
        familiarity_ratio: number;
        exploration_ratio: number;
        silence_ratio: number;
        composition: Json;
        sequence: Json;
        ranked_interventions: Json;
        voice_recommendation: Json | null;
        sound_recommendation: Json | null;
        required_reviews: string[];
        confidence: number;
        warnings: string[];
        trace: Json;
        engine_version: string;
        created_at: string;
      }>;

      session_sections: Table<{
        id: string;
        experience_id: string;
        section_key: string;
        ordinal: number;
        kind: DbSectionKind;
        title: string;
        mechanism_key: string | null;
        intervention_key: string | null;
        review_status: DbReviewStatus;
        body: string;
        word_count: number;
        word_budget: number;
        estimated_speech_seconds: number;
        actual_speech_seconds: number | null;
        pause_seconds: number;
        sound_only_seconds: number;
        transition_seconds: number;
        start_seconds: number;
        end_seconds: number;
        evidence_source_ids: string[];
      }>;

      session_outcomes: Table<{
        id: string;
        experience_id: string;
        user_id: string;
        experiment_variant_id: string | null;
        pre: Json;
        post: Json;
        completed: boolean;
        completion_ratio: number;
        skip_points: number[];
        replays: number;
        helpfulness: number | null;
        felt_safe: boolean | null;
        would_repeat: boolean | null;
        free_text: string | null;
        dislikes: string[];
        audio_problems: string[];
        context: Json;
        recorded_at: string;
      }>;

      voices: Table<{
        id: string;
        provider: string;
        provider_voice_id: string;
        name: string;
        description: string | null;
        gender: string | null;
        accent: string | null;
        languages: string[];
        warmth: number | null;
        pace: number | null;
        suitable_for: string[];
        preview_asset_id: string | null;
        approved: boolean;
        created_at: string;
      }>;

      sound_assets: Table<{
        id: string;
        name: string;
        style: string;
        description: string | null;
        intensity: number;
        loopable: boolean;
        asset_id: string | null;
        licence: string | null;
        approved: boolean;
        created_at: string;
      }>;

      /**
       * `duration_delta_seconds` is a generated column — it is never written,
       * which is why Insert and Update omit it.
       */
      audio_assets: Table<
        {
          id: string;
          name: string;
          origin: DbAudioAssetOrigin;
          kind: DbAudioTrackKind;
          storage_path: string;
          format: string;
          status: DbAudioAssetStatus;
          requested_duration_seconds: number | null;
          actual_duration_seconds: number | null;
          duration_delta_seconds: number | null;
          codec: string | null;
          bitrate_kbps: number | null;
          sample_rate: number | null;
          channels: number | null;
          file_size_bytes: number | null;
          peak_db: number | null;
          loudness_lufs: number | null;
          licence: string | null;
          generation_run_id: string | null;
          error: string | null;
          created_by: string | null;
          created_at: string;
        },
        Omit<
          Partial<{
            id: string;
            name: string;
            origin: DbAudioAssetOrigin;
            kind: DbAudioTrackKind;
            storage_path: string;
            format: string;
            status: DbAudioAssetStatus;
            requested_duration_seconds: number | null;
            actual_duration_seconds: number | null;
            codec: string | null;
            bitrate_kbps: number | null;
            sample_rate: number | null;
            channels: number | null;
            file_size_bytes: number | null;
            peak_db: number | null;
            loudness_lufs: number | null;
            licence: string | null;
            generation_run_id: string | null;
            error: string | null;
            created_by: string | null;
          }>,
          never
        >
      >;

      audio_projects: Table<{
        id: string;
        experience_id: string | null;
        name: string;
        target_seconds: number;
        arranged_seconds: number;
        loudness_target_lufs: number;
        updated_at: string;
        created_at: string;
      }>;

      audio_tracks: Table<{
        id: string;
        project_id: string;
        kind: DbAudioTrackKind;
        name: string;
        ordinal: number;
        volume_db: number;
        muted: boolean;
        solo: boolean;
        locked: boolean;
      }>;

      audio_clips: Table<{
        id: string;
        track_id: string;
        asset_id: string | null;
        name: string;
        start_seconds: number;
        duration_seconds: number;
        offset_seconds: number;
        gain_db: number;
        fade_in_seconds: number;
        fade_out_seconds: number;
        loop: boolean;
      }>;

      generation_runs: Table<{
        id: string;
        provider: string;
        capability: DbGenerationCapability;
        model: string;
        prompt_version: string | null;
        input: string | null;
        structured_constraints: Json;
        selected_mechanisms: string[];
        selected_intervention_keys: string[];
        professional_perspective: string | null;
        output: string | null;
        settings: Json;
        status: DbGenerationStatus;
        error: string | null;
        input_tokens: number | null;
        output_tokens: number | null;
        requested_audio_seconds: number | null;
        actual_audio_seconds: number | null;
        cost_estimate_usd: number | null;
        experience_id: string | null;
        created_by: string | null;
        created_at: string;
      }>;

      audio_analysis_runs: Table<{
        id: string;
        asset_id: string;
        tool: string;
        succeeded: boolean;
        duration_seconds: number | null;
        codec: string | null;
        bitrate_kbps: number | null;
        sample_rate: number | null;
        channels: number | null;
        file_size_bytes: number | null;
        peak_db: number | null;
        loudness_lufs: number | null;
        raw_output: Json | null;
        error: string | null;
        created_at: string;
      }>;

      flow_analysis_runs: Table<{
        id: string;
        experience_id: string;
        audio_project_id: string | null;
        scores: Json;
        checks: Json;
        warnings: string[];
        blocking_errors: string[];
        suggestions: string[];
        created_at: string;
      }>;

      rules: Table<{
        key: string;
        name: string;
        description: string;
        category: DbRuleCategory;
        scope: DbRuleScope;
        severity: DbRuleSeverity;
        logic_summary: string;
        error_message: string;
        suggested_correction: string | null;
        active: boolean;
        version: number;
        owner: string | null;
        updated_at: string;
      }>;

      rule_versions: Table<{
        id: string;
        rule_key: string;
        version: number;
        payload: Json;
        created_at: string;
      }>;

      rule_results: Table<{
        id: string;
        rule_key: string;
        experience_id: string | null;
        audio_project_id: string | null;
        severity: DbRuleSeverity;
        passed: boolean;
        message: string;
        suggestion: string | null;
        subject: string | null;
        evaluated_at: string;
      }>;

      review_requirements: Table<{
        id: string;
        experience_id: string;
        kind: DbReviewKind;
        required_skill: string;
        reason: string;
        satisfied_by_review_id: string | null;
        blocking: boolean;
        created_at: string;
      }>;

      reviews: Table<{
        id: string;
        experience_id: string;
        kind: DbReviewKind;
        reviewer_id: string | null;
        skill_used: string;
        decision: DbReviewDecision;
        comment: string | null;
        created_at: string;
      }>;

      comments: Table<{
        id: string;
        experience_id: string;
        section_id: string | null;
        author_id: string | null;
        body: string;
        resolved: boolean;
        created_at: string;
      }>;

      audit_logs: Table<{
        id: string;
        actor_id: string | null;
        actor_name: string;
        action: string;
        target_type: string;
        target_id: string;
        summary: string;
        created_at: string;
      }>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      review_status: DbReviewStatus;
      evidence_level: DbEvidenceLevel;
      knowledge_kind: DbKnowledgeKind;
      source_type: DbSourceType;
      verification_status: DbVerificationStatus;
      experience_status: DbExperienceStatus;
      constraint_type: DbConstraintType;
      constraint_scope: DbConstraintScope;
      rule_severity: DbRuleSeverity;
      rule_scope: DbRuleScope;
      rule_category: DbRuleCategory;
      review_kind: DbReviewKind;
      review_decision: DbReviewDecision;
      audio_asset_status: DbAudioAssetStatus;
      audio_asset_origin: DbAudioAssetOrigin;
      audio_track_kind: DbAudioTrackKind;
      generation_status: DbGenerationStatus;
      generation_capability: DbGenerationCapability;
      experiment_status: DbExperimentStatus;
      experiment_variable: DbExperimentVariable;
      studio_role: DbStudioRole;
      section_kind: DbSectionKind;
    };
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
