-- Local PostgreSQL 17 only. Minimal schema reproduces audited production policies.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE SCHEMA storage;
GRANT USAGE ON SCHEMA auth, storage, public TO anon, authenticated, service_role;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt()->>'role' $$;
CREATE TYPE public.politician_team_role AS ENUM ('admin','editor','responder');
CREATE TYPE public.question_status AS ENUM ('active','removed','pending');
CREATE TYPE public.answer_type AS ENUM ('direct','team_statement','ai_analysis');
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE public.politicians(id uuid PRIMARY KEY,verification_tier text NOT NULL DEFAULT '0');
CREATE TABLE public.questions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), politician_id uuid NOT NULL REFERENCES public.politicians,
 week_number integer NOT NULL, status public.question_status NOT NULL DEFAULT 'active',
 submitted_by uuid REFERENCES auth.users, net_upvotes integer NOT NULL DEFAULT 0,
 body text NOT NULL DEFAULT 'Local policy fixture question'
);
CREATE TABLE public.votes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users,
 question_id uuid NOT NULL REFERENCES public.questions, week_number integer NOT NULL,
 value smallint NOT NULL DEFAULT 1 CHECK(value IN(-1,1)),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id, question_id, week_number)
);
CREATE TABLE public.politician_team(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), politician_id uuid NOT NULL REFERENCES public.politicians,
 user_id uuid NOT NULL REFERENCES auth.users,role public.politician_team_role NOT NULL,UNIQUE(politician_id,user_id)
);
CREATE TABLE public.answers(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),question_id uuid NOT NULL REFERENCES public.questions,
 politician_id uuid NOT NULL REFERENCES public.politicians, is_draft boolean NOT NULL DEFAULT false,
 is_ai_generated boolean NOT NULL DEFAULT false,answer_type public.answer_type NOT NULL DEFAULT 'direct',
 published_by uuid REFERENCES auth.users, body text NOT NULL DEFAULT 'Local policy fixture answer'
);
CREATE TABLE public.answer_media(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),answer_id uuid NOT NULL REFERENCES public.answers,
 politician_id uuid NOT NULL REFERENCES public.politicians,storage_path text NOT NULL,media_type text,public_url text,file_name text,file_size_bytes integer,mime_type text
);
CREATE TABLE storage.buckets(id text PRIMARY KEY,name text NOT NULL,public boolean NOT NULL DEFAULT false,file_size_limit bigint,allowed_mime_types text[]);
CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text NOT NULL,name text NOT NULL,owner uuid);
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.politician_team ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answer_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT ALL ON ALL TABLES IN SCHEMA public,storage TO anon,authenticated,service_role;
CREATE POLICY questions_public_read ON public.questions FOR SELECT USING(status='active');
CREATE POLICY questions_anon_insert ON public.questions FOR INSERT WITH CHECK(auth.uid() IS NOT NULL);
CREATE POLICY questions_owner_update ON public.questions FOR UPDATE USING(submitted_by=auth.uid());
CREATE POLICY questions_service_all ON public.questions FOR ALL USING(auth.role()='service_role');
CREATE POLICY votes_own_read ON public.votes FOR SELECT USING(user_id=auth.uid());
CREATE POLICY votes_own_insert ON public.votes FOR INSERT WITH CHECK(user_id=auth.uid());
CREATE POLICY votes_own_update ON public.votes FOR UPDATE USING(user_id=auth.uid());
CREATE POLICY votes_own_delete ON public.votes FOR DELETE USING(user_id=auth.uid());
CREATE POLICY votes_service_all ON public.votes FOR ALL USING(auth.role()='service_role');
CREATE POLICY team_own_read ON public.politician_team FOR SELECT USING(user_id=auth.uid());
CREATE POLICY team_service_all ON public.politician_team FOR ALL USING(auth.role()='service_role');
CREATE POLICY answers_public_read ON public.answers FOR SELECT USING(true);
CREATE POLICY answers_service_all ON public.answers FOR ALL USING(auth.role()='service_role');
CREATE POLICY answer_media_public_read ON public.answer_media FOR SELECT USING(true);
CREATE POLICY answer_media_team_insert ON public.answer_media FOR INSERT WITH CHECK(EXISTS(SELECT 1 FROM public.politician_team WHERE politician_id=answer_media.politician_id AND user_id=auth.uid()));
CREATE POLICY answer_media_team_delete ON public.answer_media FOR DELETE USING(EXISTS(SELECT 1 FROM public.politician_team WHERE politician_id=answer_media.politician_id AND user_id=auth.uid()));
CREATE POLICY answer_media_public_read ON storage.objects FOR SELECT USING(bucket_id='answer-media');
CREATE POLICY answer_media_auth_insert ON storage.objects FOR INSERT WITH CHECK(bucket_id='answer-media' AND auth.role()='authenticated' AND (auth.jwt()->>'is_anonymous')::boolean IS NOT TRUE);
CREATE POLICY answer_media_auth_delete ON storage.objects FOR DELETE USING(bucket_id='answer-media' AND auth.uid()=owner);
CREATE FUNCTION public.current_week_number() RETURNS integer LANGUAGE sql STABLE AS $$ SELECT extract(isoyear FROM now())::int*100+extract(week FROM now())::int $$;
CREATE FUNCTION public.update_question_net_upvotes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN UPDATE questions SET net_upvotes=net_upvotes+NEW.value WHERE id=NEW.question_id;
 ELSIF TG_OP='DELETE' THEN UPDATE questions SET net_upvotes=net_upvotes-OLD.value WHERE id=OLD.question_id;
 ELSIF TG_OP='UPDATE' THEN UPDATE questions SET net_upvotes=net_upvotes-OLD.value+NEW.value WHERE id=NEW.question_id;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER votes_update_net_upvotes AFTER INSERT OR UPDATE OR DELETE ON public.votes FOR EACH ROW EXECUTE FUNCTION public.update_question_net_upvotes();
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public,auth TO anon,authenticated,service_role;

CREATE TABLE public.politician_verifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),politician_id uuid NOT NULL REFERENCES public.politicians,user_id uuid NOT NULL REFERENCES auth.users,method text NOT NULL,status text NOT NULL,verification_code text,code_expires_at timestamptz,verified_at timestamptz,metadata jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.politician_verifications ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.politician_verifications TO anon,authenticated,service_role;
CREATE POLICY own_verifications_read ON public.politician_verifications FOR SELECT USING(auth.uid()=user_id);
CREATE POLICY own_verifications_insert ON public.politician_verifications FOR INSERT WITH CHECK(auth.uid()=user_id);
CREATE POLICY own_verifications_update ON public.politician_verifications FOR UPDATE USING(auth.uid()=user_id);
CREATE POLICY verifications_service_all ON public.politician_verifications FOR ALL USING(auth.role()='service_role');
ALTER TABLE public.politicians ENABLE ROW LEVEL SECURITY;
CREATE POLICY politicians_public_read ON public.politicians FOR SELECT USING(true);
CREATE POLICY politicians_service_write ON public.politicians FOR ALL USING(auth.role()='service_role');
