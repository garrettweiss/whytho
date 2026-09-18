


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."ai_confidence" AS ENUM (
    'high',
    'medium',
    'low',
    'insufficient'
);


ALTER TYPE "public"."ai_confidence" OWNER TO "postgres";


CREATE TYPE "public"."alias_type" AS ENUM (
    'nickname',
    'title',
    'informal',
    'misspelling',
    'former_title'
);


ALTER TYPE "public"."alias_type" OWNER TO "postgres";


CREATE TYPE "public"."answer_type" AS ENUM (
    'direct',
    'ai_analysis',
    'team_statement'
);


ALTER TYPE "public"."answer_type" OWNER TO "postgres";


CREATE TYPE "public"."politician_team_role" AS ENUM (
    'admin',
    'editor',
    'responder'
);


ALTER TYPE "public"."politician_team_role" OWNER TO "postgres";


CREATE TYPE "public"."question_status" AS ENUM (
    'active',
    'removed',
    'merged'
);


ALTER TYPE "public"."question_status" OWNER TO "postgres";


CREATE TYPE "public"."verification_method" AS ENUM (
    'gov_email',
    'fec_id',
    'social_code',
    'stripe_identity',
    'meta_tag'
);


ALTER TYPE "public"."verification_method" OWNER TO "postgres";


CREATE TYPE "public"."verification_status" AS ENUM (
    'pending',
    'completed',
    'expired',
    'failed'
);


ALTER TYPE "public"."verification_status" OWNER TO "postgres";


CREATE TYPE "public"."verification_tier" AS ENUM (
    '0',
    '1',
    '2',
    '3'
);


ALTER TYPE "public"."verification_tier" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_report_threshold"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM question_reports
  WHERE question_id = NEW.question_id;

  IF v_count >= 3 THEN
    UPDATE questions
    SET status = 'removed'
    WHERE id = NEW.question_id AND status = 'active';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_report_threshold"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_week_number"() RETURNS integer
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
  RETURN EXTRACT(ISOYEAR FROM now())::INT * 100 + EXTRACT(WEEK FROM now())::INT;
END;
$$;


ALTER FUNCTION "public"."current_week_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_slug"("p_full_name" "text", "p_state" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_base TEXT;
  v_slug TEXT;
  v_counter INT := 0;
BEGIN
  v_base := lower(regexp_replace(
    regexp_replace(trim(p_full_name), '[^a-zA-Z0-9\s-]', '', 'g'),
    '\s+', '-', 'g'
  ));

  IF p_state IS NOT NULL THEN
    v_base := v_base || '-' || lower(p_state);
  END IF;

  v_slug := v_base;
  WHILE EXISTS (SELECT 1 FROM politicians WHERE slug = v_slug) LOOP
    v_counter := v_counter + 1;
    v_slug := v_base || '-' || v_counter;
  END LOOP;

  RETURN v_slug;
END;
$$;


ALTER FUNCTION "public"."generate_slug"("p_full_name" "text", "p_state" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.user_profiles (id, is_anonymous)
  VALUES (
    NEW.id,
    (NEW.raw_app_meta_data->>'provider' = 'anonymous')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."participation_rate"("p_politician_id" "uuid", "p_week_number" integer) RETURNS numeric
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  v_total INT;
  v_answered INT;
BEGIN
  SELECT COUNT(*) INTO v_total
  FROM questions
  WHERE politician_id = p_politician_id
    AND week_number = p_week_number
    AND status = 'active'
    AND net_upvotes >= 10;

  SELECT COUNT(DISTINCT q.id) INTO v_answered
  FROM questions q
  JOIN answers a ON a.question_id = q.id AND a.week_number = p_week_number
  WHERE q.politician_id = p_politician_id
    AND q.week_number = p_week_number
    AND q.status = 'active'
    AND q.net_upvotes >= 10;

  RETURN CASE WHEN v_total = 0 THEN NULL
              ELSE ROUND(v_answered::NUMERIC / v_total * 100, 2)
         END;
END;
$$;


ALTER FUNCTION "public"."participation_rate"("p_politician_id" "uuid", "p_week_number" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."participation_rate_period"("p_politician_id" "uuid", "p_period" "text") RETURNS numeric
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  v_target_n INTEGER;
  v_total    INTEGER;
  v_answered INTEGER;
BEGIN
  -- Count all active questions in the requested period
  SELECT COUNT(*) INTO v_total
  FROM questions q
  WHERE q.politician_id = p_politician_id
    AND q.status = 'active'
    AND CASE p_period
      WHEN 'week'  THEN q.week_number = current_week_number()
      WHEN 'month' THEN q.created_at >= now() - interval '28 days'
      WHEN 'year'  THEN q.created_at >= now() - interval '365 days'
      ELSE TRUE  -- 'all': no date filter
    END;

  -- Apply denominator cap (All Time = no cap)
  v_target_n := CASE p_period
    WHEN 'week'  THEN 10
    WHEN 'month' THEN 20
    WHEN 'year'  THEN 40
    ELSE NULL
  END;

  IF v_target_n IS NOT NULL THEN
    v_total := LEAST(v_total, v_target_n);
  END IF;

  IF v_total = 0 THEN RETURN NULL; END IF;

  -- Count questions with at least one direct or team answer (not AI-analysis-only)
  SELECT COUNT(*) INTO v_answered
  FROM questions q
  WHERE q.politician_id = p_politician_id
    AND q.status = 'active'
    AND CASE p_period
      WHEN 'week'  THEN q.week_number = current_week_number()
      WHEN 'month' THEN q.created_at >= now() - interval '28 days'
      WHEN 'year'  THEN q.created_at >= now() - interval '365 days'
      ELSE TRUE
    END
    AND EXISTS (
      SELECT 1 FROM answers a
      WHERE a.question_id = q.id
        AND a.answer_type IN ('direct', 'team_statement')
    );

  RETURN (LEAST(v_answered, v_total)::NUMERIC / v_total) * 100;
END;
$$;


ALTER FUNCTION "public"."participation_rate_period"("p_politician_id" "uuid", "p_period" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."publish_forwarded_to_knowledge"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.published = TRUE AND OLD.published = FALSE AND NEW.team_answer IS NOT NULL THEN
    INSERT INTO chatbot_knowledge (question, answer, category, source)
    VALUES (NEW.question, NEW.team_answer, 'team_answer', 'team_response');
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."publish_forwarded_to_knowledge"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_politicians"("query" "text", "result_limit" integer DEFAULT 8) RETURNS TABLE("id" "uuid", "slug" "text", "full_name" "text", "office" "text", "state" "text", "party" "text", "photo_url" "text")
    LANGUAGE "sql" STABLE
    AS $$
  SELECT
    p.id, p.slug, p.full_name, p.office, p.state, p.party, p.photo_url
  FROM politicians p
  WHERE
    p.is_active = true
    AND (
      word_similarity(query, p.full_name) > 0.3
      OR EXISTS (
        SELECT 1 FROM politician_aliases pa
        WHERE pa.politician_id = p.id
          AND word_similarity(query, pa.alias) > 0.3
      )
    )
  ORDER BY
    word_similarity(query, p.full_name) DESC,
    p.full_name ASC
  LIMIT result_limit;
$$;


ALTER FUNCTION "public"."search_politicians"("query" "text", "result_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_politician_verification_tier"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_completed_count INT;
  v_current_tier TEXT;
BEGIN
  IF NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(DISTINCT method) INTO v_completed_count
  FROM politician_verifications
  WHERE politician_id = NEW.politician_id
    AND user_id = NEW.user_id
    AND status = 'completed';

  SELECT verification_tier::text INTO v_current_tier
  FROM politicians WHERE id = NEW.politician_id;

  -- Upgrade to Tier 2 when 2+ distinct methods completed (never downgrade)
  IF v_completed_count >= 2 AND v_current_tier IN ('0', '1') THEN
    UPDATE politicians SET verification_tier = '2' WHERE id = NEW.politician_id;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_politician_verification_tier"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_question_net_upvotes"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE questions SET net_upvotes = net_upvotes + NEW.value WHERE id = NEW.question_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE questions SET net_upvotes = net_upvotes - OLD.value WHERE id = OLD.question_id;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE questions SET net_upvotes = net_upvotes - OLD.value + NEW.value WHERE id = NEW.question_id;
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."update_question_net_upvotes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."weekly_reset"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_week INT := current_week_number();
  v_prev_week INT;
  r RECORD;
BEGIN
  -- Previous week = last Monday's week number
  v_prev_week := EXTRACT(ISOYEAR FROM (now() - INTERVAL '7 days'))::INT * 100 +
                 EXTRACT(WEEK FROM (now() - INTERVAL '7 days'))::INT;

  -- Snapshot every politician who had questions last week
  FOR r IN
    SELECT DISTINCT politician_id FROM questions WHERE week_number = v_prev_week
  LOOP
    INSERT INTO weekly_snapshots (
      politician_id,
      week_number,
      total_questions,
      qualifying_questions,
      answered_qualifying,
      participation_rate,
      top_question_id
    )
    SELECT
      r.politician_id,
      v_prev_week,
      COUNT(*) FILTER (WHERE status = 'active'),
      COUNT(*) FILTER (WHERE status = 'active' AND net_upvotes >= 10),
      (
        SELECT COUNT(DISTINCT q2.id)
        FROM questions q2
        JOIN answers a ON a.question_id = q2.id AND a.week_number = v_prev_week
        WHERE q2.politician_id = r.politician_id
          AND q2.week_number = v_prev_week
          AND q2.status = 'active'
          AND q2.net_upvotes >= 10
      ),
      participation_rate(r.politician_id, v_prev_week),
      (
        SELECT id FROM questions
        WHERE politician_id = r.politician_id
          AND week_number = v_prev_week
          AND status = 'active'
        ORDER BY net_upvotes DESC
        LIMIT 1
      )
    FROM questions
    WHERE politician_id = r.politician_id AND week_number = v_prev_week
    ON CONFLICT (politician_id, week_number) DO NOTHING;
  END LOOP;

  -- Notify app layer to trigger seeded question generation
  PERFORM pg_notify('weekly_reset', json_build_object(
    'new_week', v_week,
    'prev_week', v_prev_week,
    'timestamp', now()
  )::text);

  RAISE LOG 'Weekly reset complete: prev_week=%, new_week=%', v_prev_week, v_week;
END;
$$;


ALTER FUNCTION "public"."weekly_reset"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."ai_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "model" "text" NOT NULL,
    "operation" "text" NOT NULL,
    "input_tokens" integer,
    "output_tokens" integer,
    "prompt_hash" "text",
    "related_id" "uuid",
    "related_type" "text",
    "result_summary" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ai_audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."anon_session_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ip_address" "text" NOT NULL,
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."anon_session_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."answer_media" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "answer_id" "uuid" NOT NULL,
    "politician_id" "uuid" NOT NULL,
    "media_type" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "public_url" "text" NOT NULL,
    "file_name" "text",
    "file_size_bytes" integer,
    "mime_type" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "answer_media_media_type_check" CHECK (("media_type" = ANY (ARRAY['image'::"text", 'video'::"text", 'audio'::"text"])))
);


ALTER TABLE "public"."answer_media" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."answers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "question_id" "uuid" NOT NULL,
    "politician_id" "uuid" NOT NULL,
    "week_number" integer NOT NULL,
    "answer_type" "public"."answer_type" NOT NULL,
    "body" "text" NOT NULL,
    "is_ai_generated" boolean DEFAULT false NOT NULL,
    "ai_confidence" "public"."ai_confidence",
    "sources" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "is_disputed" boolean DEFAULT false NOT NULL,
    "disputed_at" timestamp with time zone,
    "published_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_draft" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."answers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chatbot_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "raw_message" "text" NOT NULL,
    "category" "text",
    "priority" integer,
    "recommendation" "text",
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "chatbot_feedback_priority_check" CHECK ((("priority" >= 1) AND ("priority" <= 5)))
);


ALTER TABLE "public"."chatbot_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chatbot_forwarded" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "user_email" "text",
    "question" "text" NOT NULL,
    "team_answer" "text",
    "published" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."chatbot_forwarded" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chatbot_knowledge" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "question" "text" NOT NULL,
    "answer" "text" NOT NULL,
    "category" "text" DEFAULT 'faq'::"text" NOT NULL,
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."chatbot_knowledge" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chatbot_question_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "question_text" "text" NOT NULL,
    "politician_ids" "uuid"[] NOT NULL,
    "question_ids" "uuid"[],
    "politician_count" integer GENERATED ALWAYS AS ("array_length"("politician_ids", 1)) STORED,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."chatbot_question_posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jack_config" (
    "key" "text" NOT NULL,
    "value" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."jack_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jack_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "week_number" integer NOT NULL,
    "report" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."jack_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."politician_aliases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "politician_id" "uuid" NOT NULL,
    "alias" "text" NOT NULL,
    "alias_type" "public"."alias_type" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."politician_aliases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."politician_team" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "politician_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."politician_team_role" DEFAULT 'responder'::"public"."politician_team_role" NOT NULL,
    "invited_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."politician_team" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."politician_verifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "politician_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "method" "public"."verification_method" NOT NULL,
    "status" "public"."verification_status" DEFAULT 'pending'::"public"."verification_status" NOT NULL,
    "verification_code" "text",
    "code_expires_at" timestamp with time zone,
    "verified_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."politician_verifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."politicians" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "full_name" "text" NOT NULL,
    "aliases" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "office" "text",
    "state" "text",
    "district" "text",
    "party" "text",
    "bio" "text",
    "photo_url" "text",
    "social_handles" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "verification_tier" "public"."verification_tier" DEFAULT '0'::"public"."verification_tier" NOT NULL,
    "fec_id" "text",
    "bioguide_id" "text",
    "openstates_id" "text",
    "votesmart_id" "text",
    "govtrack_id" "text",
    "website_url" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "politician_type" "text" DEFAULT 'elected'::"text" NOT NULL,
    "candidate_status" "text",
    "fec_candidate_id" "text",
    "race_id" "uuid",
    "election_date" "date",
    "is_test" boolean DEFAULT false NOT NULL,
    "is_candidate" boolean DEFAULT false NOT NULL,
    "candidate_election_year" integer,
    "candidate_office" "text",
    "candidate_fec_id" "text",
    "incumbent_challenge" "text",
    CONSTRAINT "politicians_incumbent_challenge_check" CHECK (("incumbent_challenge" = ANY (ARRAY['I'::"text", 'C'::"text", 'O'::"text"])))
);


ALTER TABLE "public"."politicians" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."question_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "question_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "question_reports_reason_check" CHECK (("reason" = ANY (ARRAY['spam'::"text", 'offensive'::"text", 'off_topic'::"text", 'duplicate'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."question_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "politician_id" "uuid" NOT NULL,
    "week_number" integer NOT NULL,
    "body" "text" NOT NULL,
    "is_seeded" boolean DEFAULT false NOT NULL,
    "net_upvotes" integer DEFAULT 0 NOT NULL,
    "status" "public"."question_status" DEFAULT 'active'::"public"."question_status" NOT NULL,
    "submitted_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "parent_question_id" "uuid",
    "source" "text" DEFAULT 'user'::"text" NOT NULL,
    "x_post_id" "uuid",
    CONSTRAINT "questions_body_length" CHECK ((("char_length"("body") >= 10) AND ("char_length"("body") <= 500)))
);


ALTER TABLE "public"."questions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."race_candidates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "race_id" "uuid" NOT NULL,
    "politician_id" "uuid" NOT NULL,
    "party" "text",
    "incumbent_challenge" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "race_candidates_incumbent_challenge_check" CHECK (("incumbent_challenge" = ANY (ARRAY['I'::"text", 'C'::"text", 'O'::"text"])))
);


ALTER TABLE "public"."race_candidates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."races" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "office" "text" NOT NULL,
    "state" "text" NOT NULL,
    "district" "text",
    "election_date" "date" NOT NULL,
    "election_type" "text" DEFAULT 'primary'::"text" NOT NULL,
    "party" "text",
    "incumbent_id" "uuid",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."races" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" NOT NULL,
    "display_name" "text",
    "is_anonymous" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notify_answer" boolean DEFAULT true NOT NULL,
    "notify_digest" boolean DEFAULT true NOT NULL,
    "city" "text",
    "county" "text",
    "state_code" "text",
    "political_affiliation" "text",
    "is_admin" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."votes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "question_id" "uuid" NOT NULL,
    "week_number" integer NOT NULL,
    "value" smallint DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "votes_value_check" CHECK (("value" = ANY (ARRAY['-1'::integer, 1])))
);


ALTER TABLE "public"."votes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weekly_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "politician_id" "uuid" NOT NULL,
    "week_number" integer NOT NULL,
    "total_questions" integer DEFAULT 0 NOT NULL,
    "qualifying_questions" integer DEFAULT 0 NOT NULL,
    "answered_qualifying" integer DEFAULT 0 NOT NULL,
    "participation_rate" numeric(5,2),
    "top_question_id" "uuid",
    "snapshot_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."weekly_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."x_credit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "run_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "agent" "text" NOT NULL,
    "credits_used" numeric(10,4) DEFAULT 0,
    "politicians_covered" integer DEFAULT 0,
    "tweets_collected" integer DEFAULT 0,
    "tweets_approved" integer DEFAULT 0,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."x_credit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."x_outreach_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "target_type" "text" NOT NULL,
    "target_handle" "text",
    "politician_id" "uuid",
    "x_post_id" "uuid",
    "channel" "text" NOT NULL,
    "message" "text",
    "sent_at" timestamp with time zone DEFAULT "now"(),
    "engagement" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."x_outreach_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."x_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tweet_id" "text" NOT NULL,
    "politician_id" "uuid",
    "author_handle" "text" NOT NULL,
    "author_name" "text",
    "tweet_url" "text" NOT NULL,
    "likes" integer DEFAULT 0,
    "retweets" integer DEFAULT 0,
    "reply_count" integer DEFAULT 0,
    "tweet_date" timestamp with time zone,
    "collected_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "curator_score" numeric(3,1),
    "rejection_reason" "text",
    "theme_tags" "text"[] DEFAULT '{}'::"text"[],
    "whytho_question_id" "uuid",
    "oembed_cache" "text",
    "oembed_cached_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "body" "text",
    "curator_notes" "text"
);


ALTER TABLE "public"."x_posts" OWNER TO "postgres";


ALTER TABLE ONLY "public"."ai_audit_log"
    ADD CONSTRAINT "ai_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."anon_session_log"
    ADD CONSTRAINT "anon_session_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."answer_media"
    ADD CONSTRAINT "answer_media_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."answers"
    ADD CONSTRAINT "answers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chatbot_feedback"
    ADD CONSTRAINT "chatbot_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chatbot_forwarded"
    ADD CONSTRAINT "chatbot_forwarded_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chatbot_knowledge"
    ADD CONSTRAINT "chatbot_knowledge_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chatbot_question_posts"
    ADD CONSTRAINT "chatbot_question_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jack_config"
    ADD CONSTRAINT "jack_config_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."jack_reports"
    ADD CONSTRAINT "jack_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."politician_aliases"
    ADD CONSTRAINT "politician_aliases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."politician_aliases"
    ADD CONSTRAINT "politician_aliases_politician_id_alias_key" UNIQUE ("politician_id", "alias");



ALTER TABLE ONLY "public"."politician_team"
    ADD CONSTRAINT "politician_team_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."politician_team"
    ADD CONSTRAINT "politician_team_politician_id_user_id_key" UNIQUE ("politician_id", "user_id");



ALTER TABLE ONLY "public"."politician_verifications"
    ADD CONSTRAINT "politician_verifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."politicians"
    ADD CONSTRAINT "politicians_fec_candidate_id_key" UNIQUE ("fec_candidate_id");



ALTER TABLE ONLY "public"."politicians"
    ADD CONSTRAINT "politicians_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."politicians"
    ADD CONSTRAINT "politicians_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."question_reports"
    ADD CONSTRAINT "question_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."question_reports"
    ADD CONSTRAINT "question_reports_question_id_user_id_key" UNIQUE ("question_id", "user_id");



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."race_candidates"
    ADD CONSTRAINT "race_candidates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."race_candidates"
    ADD CONSTRAINT "race_candidates_race_id_politician_id_key" UNIQUE ("race_id", "politician_id");



ALTER TABLE ONLY "public"."races"
    ADD CONSTRAINT "races_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."races"
    ADD CONSTRAINT "races_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."votes"
    ADD CONSTRAINT "votes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."votes"
    ADD CONSTRAINT "votes_user_id_question_id_week_number_key" UNIQUE ("user_id", "question_id", "week_number");



ALTER TABLE ONLY "public"."weekly_snapshots"
    ADD CONSTRAINT "weekly_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weekly_snapshots"
    ADD CONSTRAINT "weekly_snapshots_politician_id_week_number_key" UNIQUE ("politician_id", "week_number");



ALTER TABLE ONLY "public"."x_credit_log"
    ADD CONSTRAINT "x_credit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."x_outreach_log"
    ADD CONSTRAINT "x_outreach_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."x_posts"
    ADD CONSTRAINT "x_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."x_posts"
    ADD CONSTRAINT "x_posts_tweet_id_key" UNIQUE ("tweet_id");



CREATE INDEX "chatbot_knowledge_answer_trgm" ON "public"."chatbot_knowledge" USING "gin" ("answer" "public"."gin_trgm_ops");



CREATE INDEX "chatbot_knowledge_question_trgm" ON "public"."chatbot_knowledge" USING "gin" ("question" "public"."gin_trgm_ops");



CREATE INDEX "idx_ai_audit_created" ON "public"."ai_audit_log" USING "btree" ("created_at");



CREATE INDEX "idx_ai_audit_related" ON "public"."ai_audit_log" USING "btree" ("related_id", "related_type");



CREATE INDEX "idx_anon_session_log_ip_created" ON "public"."anon_session_log" USING "btree" ("ip_address", "created_at" DESC);



CREATE INDEX "idx_answers_politician_week" ON "public"."answers" USING "btree" ("politician_id", "week_number");



CREATE INDEX "idx_answers_question" ON "public"."answers" USING "btree" ("question_id");



CREATE INDEX "idx_politician_aliases_alias_trgm" ON "public"."politician_aliases" USING "gin" ("alias" "public"."gin_trgm_ops");



CREATE INDEX "idx_politician_aliases_politician" ON "public"."politician_aliases" USING "btree" ("politician_id");



CREATE INDEX "idx_politician_team_politician" ON "public"."politician_team" USING "btree" ("politician_id");



CREATE INDEX "idx_politician_team_user" ON "public"."politician_team" USING "btree" ("user_id");



CREATE INDEX "idx_politicians_aliases_gin" ON "public"."politicians" USING "gin" ("aliases");



CREATE INDEX "idx_politicians_full_name_trgm" ON "public"."politicians" USING "gin" ("full_name" "public"."gin_trgm_ops");



CREATE INDEX "idx_politicians_party" ON "public"."politicians" USING "btree" ("party");



CREATE INDEX "idx_politicians_race" ON "public"."politicians" USING "btree" ("race_id");



CREATE INDEX "idx_politicians_slug" ON "public"."politicians" USING "btree" ("slug");



CREATE INDEX "idx_politicians_state" ON "public"."politicians" USING "btree" ("state");



CREATE INDEX "idx_politicians_status" ON "public"."politicians" USING "btree" ("candidate_status");



CREATE INDEX "idx_politicians_type" ON "public"."politicians" USING "btree" ("politician_type");



CREATE INDEX "idx_questions_net_upvotes" ON "public"."questions" USING "btree" ("net_upvotes" DESC);



CREATE INDEX "idx_questions_politician_week" ON "public"."questions" USING "btree" ("politician_id", "week_number");



CREATE INDEX "idx_questions_status" ON "public"."questions" USING "btree" ("status");



CREATE INDEX "idx_questions_week" ON "public"."questions" USING "btree" ("week_number");



CREATE INDEX "idx_races_election_date" ON "public"."races" USING "btree" ("election_date");



CREATE INDEX "idx_races_state" ON "public"."races" USING "btree" ("state");



CREATE INDEX "idx_races_status" ON "public"."races" USING "btree" ("status");



CREATE INDEX "idx_user_profiles_notify_digest" ON "public"."user_profiles" USING "btree" ("notify_digest", "is_anonymous") WHERE (("notify_digest" = true) AND ("is_anonymous" = false));



CREATE INDEX "idx_votes_question" ON "public"."votes" USING "btree" ("question_id");



CREATE INDEX "idx_votes_user" ON "public"."votes" USING "btree" ("user_id");



CREATE INDEX "idx_weekly_snapshots_politician" ON "public"."weekly_snapshots" USING "btree" ("politician_id");



CREATE INDEX "idx_weekly_snapshots_rate" ON "public"."weekly_snapshots" USING "btree" ("participation_rate" DESC NULLS LAST);



CREATE INDEX "idx_weekly_snapshots_week" ON "public"."weekly_snapshots" USING "btree" ("week_number");



CREATE UNIQUE INDEX "politicians_candidate_fec_id_idx" ON "public"."politicians" USING "btree" ("candidate_fec_id") WHERE ("candidate_fec_id" IS NOT NULL);



CREATE INDEX "politicians_is_test_idx" ON "public"."politicians" USING "btree" ("is_test") WHERE ("is_test" = true);



CREATE INDEX "questions_politician_period_idx" ON "public"."questions" USING "btree" ("politician_id", "status", "created_at" DESC);



CREATE INDEX "questions_source_idx" ON "public"."questions" USING "btree" ("source");



CREATE INDEX "race_candidates_politician_id_idx" ON "public"."race_candidates" USING "btree" ("politician_id");



CREATE INDEX "race_candidates_race_id_idx" ON "public"."race_candidates" USING "btree" ("race_id");



CREATE INDEX "x_credit_log_run_date_idx" ON "public"."x_credit_log" USING "btree" ("run_date" DESC);



CREATE INDEX "x_outreach_log_politician_id_idx" ON "public"."x_outreach_log" USING "btree" ("politician_id");



CREATE INDEX "x_outreach_log_target_handle_idx" ON "public"."x_outreach_log" USING "btree" ("target_handle");



CREATE INDEX "x_posts_collected_at_idx" ON "public"."x_posts" USING "btree" ("collected_at" DESC);



CREATE INDEX "x_posts_politician_id_idx" ON "public"."x_posts" USING "btree" ("politician_id");



CREATE INDEX "x_posts_status_idx" ON "public"."x_posts" USING "btree" ("status");



CREATE INDEX "x_posts_tweet_id_idx" ON "public"."x_posts" USING "btree" ("tweet_id");



CREATE OR REPLACE TRIGGER "answers_updated_at" BEFORE UPDATE ON "public"."answers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "on_forwarded_published" AFTER UPDATE ON "public"."chatbot_forwarded" FOR EACH ROW EXECUTE FUNCTION "public"."publish_forwarded_to_knowledge"();



CREATE OR REPLACE TRIGGER "politicians_updated_at" BEFORE UPDATE ON "public"."politicians" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "questions_updated_at" BEFORE UPDATE ON "public"."questions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_report_threshold" AFTER INSERT ON "public"."question_reports" FOR EACH ROW EXECUTE FUNCTION "public"."check_report_threshold"();



CREATE OR REPLACE TRIGGER "trg_verification_tier" AFTER INSERT OR UPDATE OF "status" ON "public"."politician_verifications" FOR EACH ROW EXECUTE FUNCTION "public"."update_politician_verification_tier"();



CREATE OR REPLACE TRIGGER "user_profiles_updated_at" BEFORE UPDATE ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "votes_update_net_upvotes" AFTER INSERT OR DELETE OR UPDATE ON "public"."votes" FOR EACH ROW EXECUTE FUNCTION "public"."update_question_net_upvotes"();



ALTER TABLE ONLY "public"."answer_media"
    ADD CONSTRAINT "answer_media_answer_id_fkey" FOREIGN KEY ("answer_id") REFERENCES "public"."answers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."answer_media"
    ADD CONSTRAINT "answer_media_politician_id_fkey" FOREIGN KEY ("politician_id") REFERENCES "public"."politicians"("id");



ALTER TABLE ONLY "public"."answers"
    ADD CONSTRAINT "answers_politician_id_fkey" FOREIGN KEY ("politician_id") REFERENCES "public"."politicians"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."answers"
    ADD CONSTRAINT "answers_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."answers"
    ADD CONSTRAINT "answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chatbot_feedback"
    ADD CONSTRAINT "chatbot_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chatbot_forwarded"
    ADD CONSTRAINT "chatbot_forwarded_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chatbot_question_posts"
    ADD CONSTRAINT "chatbot_question_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."politician_aliases"
    ADD CONSTRAINT "politician_aliases_politician_id_fkey" FOREIGN KEY ("politician_id") REFERENCES "public"."politicians"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."politician_team"
    ADD CONSTRAINT "politician_team_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."politician_team"
    ADD CONSTRAINT "politician_team_politician_id_fkey" FOREIGN KEY ("politician_id") REFERENCES "public"."politicians"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."politician_team"
    ADD CONSTRAINT "politician_team_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."politician_verifications"
    ADD CONSTRAINT "politician_verifications_politician_id_fkey" FOREIGN KEY ("politician_id") REFERENCES "public"."politicians"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."politician_verifications"
    ADD CONSTRAINT "politician_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."politicians"
    ADD CONSTRAINT "politicians_race_id_fkey" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."question_reports"
    ADD CONSTRAINT "question_reports_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."question_reports"
    ADD CONSTRAINT "question_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_parent_question_id_fkey" FOREIGN KEY ("parent_question_id") REFERENCES "public"."questions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_politician_id_fkey" FOREIGN KEY ("politician_id") REFERENCES "public"."politicians"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_x_post_id_fkey" FOREIGN KEY ("x_post_id") REFERENCES "public"."x_posts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."race_candidates"
    ADD CONSTRAINT "race_candidates_politician_id_fkey" FOREIGN KEY ("politician_id") REFERENCES "public"."politicians"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."race_candidates"
    ADD CONSTRAINT "race_candidates_race_id_fkey" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."races"
    ADD CONSTRAINT "races_incumbent_id_fkey" FOREIGN KEY ("incumbent_id") REFERENCES "public"."politicians"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."votes"
    ADD CONSTRAINT "votes_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."votes"
    ADD CONSTRAINT "votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weekly_snapshots"
    ADD CONSTRAINT "weekly_snapshots_politician_id_fkey" FOREIGN KEY ("politician_id") REFERENCES "public"."politicians"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weekly_snapshots"
    ADD CONSTRAINT "weekly_snapshots_top_question_id_fkey" FOREIGN KEY ("top_question_id") REFERENCES "public"."questions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."x_outreach_log"
    ADD CONSTRAINT "x_outreach_log_politician_id_fkey" FOREIGN KEY ("politician_id") REFERENCES "public"."politicians"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."x_outreach_log"
    ADD CONSTRAINT "x_outreach_log_x_post_id_fkey" FOREIGN KEY ("x_post_id") REFERENCES "public"."x_posts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."x_posts"
    ADD CONSTRAINT "x_posts_politician_id_fkey" FOREIGN KEY ("politician_id") REFERENCES "public"."politicians"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."x_posts"
    ADD CONSTRAINT "x_posts_whytho_question_id_fkey" FOREIGN KEY ("whytho_question_id") REFERENCES "public"."questions"("id") ON DELETE SET NULL;



CREATE POLICY "Admins can manage jack_config" ON "public"."jack_config" USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."is_admin" = true)))));



CREATE POLICY "Admins can manage jack_reports" ON "public"."jack_reports" USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."is_admin" = true)))));



CREATE POLICY "Admins can manage x_credit_log" ON "public"."x_credit_log" USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."is_admin" = true)))));



CREATE POLICY "Admins can manage x_outreach_log" ON "public"."x_outreach_log" USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."is_admin" = true)))));



CREATE POLICY "Admins can manage x_posts" ON "public"."x_posts" USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."is_admin" = true)))));



ALTER TABLE "public"."ai_audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_audit_service_all" ON "public"."ai_audit_log" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "aliases_public_read" ON "public"."politician_aliases" FOR SELECT USING (true);



CREATE POLICY "aliases_service_write" ON "public"."politician_aliases" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "anon_log_service_only" ON "public"."anon_session_log" USING (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."anon_session_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."answer_media" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "answer_media_public_read" ON "public"."answer_media" FOR SELECT USING (true);



CREATE POLICY "answer_media_team_delete" ON "public"."answer_media" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."politician_team"
  WHERE (("politician_team"."politician_id" = "answer_media"."politician_id") AND ("politician_team"."user_id" = "auth"."uid"())))));



CREATE POLICY "answer_media_team_insert" ON "public"."answer_media" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."politician_team"
  WHERE (("politician_team"."politician_id" = "answer_media"."politician_id") AND ("politician_team"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."answers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "answers_public_read" ON "public"."answers" FOR SELECT USING (true);



CREATE POLICY "answers_service_all" ON "public"."answers" USING (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."chatbot_feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chatbot_forwarded" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chatbot_knowledge" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chatbot_question_posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."jack_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."jack_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "own_reports_insert" ON "public"."question_reports" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "own_reports_read" ON "public"."question_reports" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "own_verifications_insert" ON "public"."politician_verifications" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "own_verifications_read" ON "public"."politician_verifications" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "own_verifications_update" ON "public"."politician_verifications" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."politician_aliases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."politician_team" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."politician_verifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."politicians" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "politicians_public_read" ON "public"."politicians" FOR SELECT USING (true);



CREATE POLICY "politicians_service_write" ON "public"."politicians" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "profiles_own_read" ON "public"."user_profiles" FOR SELECT USING (("id" = "auth"."uid"()));



CREATE POLICY "profiles_own_update" ON "public"."user_profiles" FOR UPDATE USING (("id" = "auth"."uid"()));



CREATE POLICY "profiles_service_all" ON "public"."user_profiles" USING (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."question_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."questions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "questions_anon_insert" ON "public"."questions" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "questions_owner_update" ON "public"."questions" FOR UPDATE USING (("submitted_by" = "auth"."uid"()));



CREATE POLICY "questions_public_read" ON "public"."questions" FOR SELECT USING (("status" = 'active'::"public"."question_status"));



CREATE POLICY "questions_service_all" ON "public"."questions" USING (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."race_candidates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "race_candidates_public_read" ON "public"."race_candidates" FOR SELECT USING (true);



ALTER TABLE "public"."races" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "races_public_read" ON "public"."races" FOR SELECT USING (true);



CREATE POLICY "races_service_write" ON "public"."races" TO "service_role" USING (true);



CREATE POLICY "reports_service_all" ON "public"."question_reports" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "snapshots_public_read" ON "public"."weekly_snapshots" FOR SELECT USING (true);



CREATE POLICY "snapshots_service_all" ON "public"."weekly_snapshots" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "team_own_read" ON "public"."politician_team" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "team_service_all" ON "public"."politician_team" USING (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "verifications_service_all" ON "public"."politician_verifications" USING (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."votes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "votes_own_delete" ON "public"."votes" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "votes_own_insert" ON "public"."votes" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "votes_own_read" ON "public"."votes" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "votes_own_update" ON "public"."votes" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "votes_service_all" ON "public"."votes" USING (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."weekly_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."x_credit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."x_outreach_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."x_posts" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";









GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";











































































































































































GRANT ALL ON FUNCTION "public"."check_report_threshold"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_report_threshold"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_report_threshold"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_week_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_week_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_week_number"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_slug"("p_full_name" "text", "p_state" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_slug"("p_full_name" "text", "p_state" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_slug"("p_full_name" "text", "p_state" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."participation_rate"("p_politician_id" "uuid", "p_week_number" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."participation_rate"("p_politician_id" "uuid", "p_week_number" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."participation_rate"("p_politician_id" "uuid", "p_week_number" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."participation_rate_period"("p_politician_id" "uuid", "p_period" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."participation_rate_period"("p_politician_id" "uuid", "p_period" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."participation_rate_period"("p_politician_id" "uuid", "p_period" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."publish_forwarded_to_knowledge"() TO "anon";
GRANT ALL ON FUNCTION "public"."publish_forwarded_to_knowledge"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."publish_forwarded_to_knowledge"() TO "service_role";



GRANT ALL ON FUNCTION "public"."search_politicians"("query" "text", "result_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."search_politicians"("query" "text", "result_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_politicians"("query" "text", "result_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "postgres";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "service_role";



GRANT ALL ON FUNCTION "public"."show_limit"() TO "postgres";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_politician_verification_tier"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_politician_verification_tier"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_politician_verification_tier"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_question_net_upvotes"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_question_net_upvotes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_question_net_upvotes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."weekly_reset"() TO "anon";
GRANT ALL ON FUNCTION "public"."weekly_reset"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."weekly_reset"() TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "service_role";
























GRANT ALL ON TABLE "public"."ai_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."ai_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."anon_session_log" TO "anon";
GRANT ALL ON TABLE "public"."anon_session_log" TO "authenticated";
GRANT ALL ON TABLE "public"."anon_session_log" TO "service_role";



GRANT ALL ON TABLE "public"."answer_media" TO "anon";
GRANT ALL ON TABLE "public"."answer_media" TO "authenticated";
GRANT ALL ON TABLE "public"."answer_media" TO "service_role";



GRANT ALL ON TABLE "public"."answers" TO "anon";
GRANT ALL ON TABLE "public"."answers" TO "authenticated";
GRANT ALL ON TABLE "public"."answers" TO "service_role";



GRANT ALL ON TABLE "public"."chatbot_feedback" TO "anon";
GRANT ALL ON TABLE "public"."chatbot_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."chatbot_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."chatbot_forwarded" TO "anon";
GRANT ALL ON TABLE "public"."chatbot_forwarded" TO "authenticated";
GRANT ALL ON TABLE "public"."chatbot_forwarded" TO "service_role";



GRANT ALL ON TABLE "public"."chatbot_knowledge" TO "anon";
GRANT ALL ON TABLE "public"."chatbot_knowledge" TO "authenticated";
GRANT ALL ON TABLE "public"."chatbot_knowledge" TO "service_role";



GRANT ALL ON TABLE "public"."chatbot_question_posts" TO "anon";
GRANT ALL ON TABLE "public"."chatbot_question_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."chatbot_question_posts" TO "service_role";



GRANT ALL ON TABLE "public"."jack_config" TO "anon";
GRANT ALL ON TABLE "public"."jack_config" TO "authenticated";
GRANT ALL ON TABLE "public"."jack_config" TO "service_role";



GRANT ALL ON TABLE "public"."jack_reports" TO "anon";
GRANT ALL ON TABLE "public"."jack_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."jack_reports" TO "service_role";



GRANT ALL ON TABLE "public"."politician_aliases" TO "anon";
GRANT ALL ON TABLE "public"."politician_aliases" TO "authenticated";
GRANT ALL ON TABLE "public"."politician_aliases" TO "service_role";



GRANT ALL ON TABLE "public"."politician_team" TO "anon";
GRANT ALL ON TABLE "public"."politician_team" TO "authenticated";
GRANT ALL ON TABLE "public"."politician_team" TO "service_role";



GRANT ALL ON TABLE "public"."politician_verifications" TO "anon";
GRANT ALL ON TABLE "public"."politician_verifications" TO "authenticated";
GRANT ALL ON TABLE "public"."politician_verifications" TO "service_role";



GRANT ALL ON TABLE "public"."politicians" TO "anon";
GRANT ALL ON TABLE "public"."politicians" TO "authenticated";
GRANT ALL ON TABLE "public"."politicians" TO "service_role";



GRANT ALL ON TABLE "public"."question_reports" TO "anon";
GRANT ALL ON TABLE "public"."question_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."question_reports" TO "service_role";



GRANT ALL ON TABLE "public"."questions" TO "anon";
GRANT ALL ON TABLE "public"."questions" TO "authenticated";
GRANT ALL ON TABLE "public"."questions" TO "service_role";



GRANT ALL ON TABLE "public"."race_candidates" TO "anon";
GRANT ALL ON TABLE "public"."race_candidates" TO "authenticated";
GRANT ALL ON TABLE "public"."race_candidates" TO "service_role";



GRANT ALL ON TABLE "public"."races" TO "anon";
GRANT ALL ON TABLE "public"."races" TO "authenticated";
GRANT ALL ON TABLE "public"."races" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."votes" TO "anon";
GRANT ALL ON TABLE "public"."votes" TO "authenticated";
GRANT ALL ON TABLE "public"."votes" TO "service_role";



GRANT ALL ON TABLE "public"."weekly_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."weekly_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."weekly_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."x_credit_log" TO "anon";
GRANT ALL ON TABLE "public"."x_credit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."x_credit_log" TO "service_role";



GRANT ALL ON TABLE "public"."x_outreach_log" TO "anon";
GRANT ALL ON TABLE "public"."x_outreach_log" TO "authenticated";
GRANT ALL ON TABLE "public"."x_outreach_log" TO "service_role";



GRANT ALL ON TABLE "public"."x_posts" TO "anon";
GRANT ALL ON TABLE "public"."x_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."x_posts" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































