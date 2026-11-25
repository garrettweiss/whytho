\set ON_ERROR_STOP on
-- Synthetic local-only database. No production credentials or destructive cleanup.
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; END IF; END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
CREATE EXTENSION pg_trgm WITH SCHEMA public;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,is_anonymous boolean DEFAULT false);
CREATE TYPE public.politician_team_role AS ENUM('admin','editor','responder');
CREATE TYPE public.alias_type AS ENUM('nickname','title','informal','misspelling','former_title');
CREATE TYPE public.answer_type AS ENUM('direct','team_statement','ai_analysis');
CREATE TABLE public.politicians(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),slug text NOT NULL UNIQUE,full_name text NOT NULL,
 state text,office text,district text,party text,bio text,website_url text,aliases text[] NOT NULL DEFAULT '{}',
 bioguide_id text,openstates_id text,govtrack_id text,votesmart_id text,fec_id text,fec_candidate_id text UNIQUE,candidate_fec_id text,
 is_candidate boolean NOT NULL DEFAULT false,candidate_election_year integer,candidate_office text,incumbent_challenge text,candidate_status text,election_date date,race_id uuid,
 photo_url text,photo_source_url text,photo_credit text,photo_rights_basis text,social_handles jsonb DEFAULT '{}',politician_type text DEFAULT 'elected',
 verification_tier text NOT NULL DEFAULT '0',is_test boolean NOT NULL DEFAULT false,is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION public.test_update_timestamp() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at:=clock_timestamp(); RETURN NEW; END $$;
CREATE TRIGGER politicians_updated_at BEFORE UPDATE ON public.politicians FOR EACH ROW EXECUTE FUNCTION public.test_update_timestamp();
CREATE TABLE public.politician_aliases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),politician_id uuid REFERENCES public.politicians,alias text,alias_type public.alias_type,created_at timestamptz DEFAULT now(),UNIQUE(politician_id,alias));
CREATE TABLE public.politician_team(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),politician_id uuid REFERENCES public.politicians,user_id uuid REFERENCES auth.users,role public.politician_team_role,invited_by uuid,created_at timestamptz DEFAULT now(),UNIQUE(politician_id,user_id));
CREATE TABLE public.politician_verifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),politician_id uuid REFERENCES public.politicians,user_id uuid REFERENCES auth.users,status text);
CREATE TABLE public.politician_verification_sources(politician_id uuid PRIMARY KEY REFERENCES public.politicians,reviewed_by uuid);
CREATE TABLE public.questions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),politician_id uuid REFERENCES public.politicians,body text DEFAULT 'Synthetic question for local validation only',status text DEFAULT 'active',week_number int DEFAULT 202648,net_upvotes int DEFAULT 0,source text DEFAULT 'user',is_seeded boolean DEFAULT false,submitted_by uuid REFERENCES auth.users,x_post_id uuid,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE TABLE public.answers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),question_id uuid REFERENCES public.questions,politician_id uuid REFERENCES public.politicians,week_number int,body text,sources jsonb DEFAULT '[]',answer_type public.answer_type,is_draft boolean DEFAULT false,is_ai_generated boolean DEFAULT false,is_disputed boolean DEFAULT false,published_by uuid,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE TABLE public.votes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),question_id uuid REFERENCES public.questions,user_id uuid REFERENCES auth.users,week_number int,UNIQUE(question_id,user_id,week_number));
CREATE TABLE public.weekly_snapshots(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),politician_id uuid REFERENCES public.politicians,week_number int,total_questions int DEFAULT 0,qualifying_questions int DEFAULT 0,answered_qualifying int DEFAULT 0,participation_rate numeric,UNIQUE(politician_id,week_number));
CREATE TABLE public.x_posts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),politician_id uuid REFERENCES public.politicians,tweet_id text UNIQUE,status text,whytho_question_id uuid REFERENCES public.questions,updated_at timestamptz DEFAULT now());
CREATE TABLE public.x_outreach_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),politician_id uuid REFERENCES public.politicians);
-- Match public read access while private authority remains inaccessible.
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['politicians','politician_aliases','questions','answers','weekly_snapshots'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('CREATE POLICY test_public_read ON public.%I FOR SELECT TO anon,authenticated USING(true)',tab);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',tab);
  EXECUTE format('GRANT SELECT ON public.%I TO anon,authenticated',tab);
 END LOOP;
END $$;
GRANT USAGE ON SCHEMA public,auth TO service_role;
\ir ../migrations/20261031205615_account_transitions.sql
