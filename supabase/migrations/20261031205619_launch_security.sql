-- Launch security. Additive schema and privilege corrections, no rows deleted.
-- Apply after release_rls_hardening and account_transitions, before deploying routes.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity)
  THEN RAISE EXCEPTION 'Launch preflight: public table lacks RLS'; END IF;
END $$;

-- Settings routes already use the service role and explicit user/field allowlists.
-- An owner policy alone did not protect the is_admin column from self-promotion.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.user_profiles FROM PUBLIC, anon, authenticated;
DO $$
DECLARE col record;
BEGIN
  FOR col IN SELECT attname FROM pg_attribute WHERE attrelid='public.user_profiles'::regclass AND attnum>0 AND NOT attisdropped LOOP
    EXECUTE format('REVOKE INSERT (%I), UPDATE (%I) ON public.user_profiles FROM PUBLIC, anon, authenticated', col.attname,col.attname);
  END LOOP;
END $$;
-- Jack policies must trust server-managed auth claims, never editable profile data.
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT schemaname,tablename,policyname FROM pg_policies
    WHERE schemaname='public' AND tablename IN ('jack_config','jack_reports','x_posts','x_credit_log','x_outreach_log')
      AND qual LIKE '%user_profiles.is_admin%'
  LOOP
    EXECUTE format('ALTER POLICY %I ON %I.%I USING ((auth.jwt()->''app_metadata''->>''is_admin'') = ''true'') WITH CHECK ((auth.jwt()->''app_metadata''->>''is_admin'') = ''true'')',pol.policyname,pol.schemaname,pol.tablename);
  END LOOP;
END $$;

-- Authority anchors are populated only after a human/source review. Never copy
-- a claimant-editable website_url into this table as proof of authority.
CREATE TABLE IF NOT EXISTS public.politician_verification_sources (
  politician_id uuid PRIMARY KEY REFERENCES public.politicians(id),
  official_website_url text NOT NULL CHECK (official_website_url ~ '^https://'),
  government_email_domains text[] NOT NULL DEFAULT '{}',
  evidence_url text NOT NULL CHECK (evidence_url ~ '^https://'),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES auth.users(id)
);
ALTER TABLE public.politician_verification_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.politician_verification_sources FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.politician_verification_sources TO service_role;

CREATE TABLE IF NOT EXISTS public.security_rate_limits (
  key text PRIMARY KEY CHECK (length(key)<=200),
  hits integer NOT NULL,
  resets_at timestamptz NOT NULL
);
ALTER TABLE public.security_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.security_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.security_rate_limits TO service_role;
CREATE OR REPLACE FUNCTION public.consume_security_rate_limit(p_key text,p_limit integer,p_window_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE current_hits integer;
BEGIN
  IF length(p_key)>200 OR p_limit<1 OR p_limit>10000 OR p_window_seconds<1 OR p_window_seconds>86400 THEN
    RAISE EXCEPTION 'Invalid rate limit parameters';
  END IF;
  INSERT INTO public.security_rate_limits(key,hits,resets_at)
    VALUES (p_key,1,clock_timestamp()+make_interval(secs=>p_window_seconds))
    ON CONFLICT(key) DO UPDATE SET
      hits=CASE WHEN security_rate_limits.resets_at<=clock_timestamp() THEN 1 ELSE least(security_rate_limits.hits+1,p_limit+1) END,
      resets_at=CASE WHEN security_rate_limits.resets_at<=clock_timestamp() THEN clock_timestamp()+make_interval(secs=>p_window_seconds) ELSE security_rate_limits.resets_at END
    RETURNING hits INTO current_hits;
  RETURN current_hits<=p_limit;
END $$;
REVOKE EXECUTE ON FUNCTION public.consume_security_rate_limit(text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consume_security_rate_limit(text,integer,integer) TO service_role;

-- Serialize per-user question quotas so simultaneous requests cannot overrun them.
CREATE OR REPLACE FUNCTION public.enforce_question_submission_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.is_seeded OR NEW.submitted_by IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('question-quota:'||NEW.submitted_by::text,0));
  IF (SELECT count(*) FROM public.questions WHERE submitted_by=NEW.submitted_by AND NOT is_seeded AND created_at>now()-interval '24 hours')>=5
    OR (SELECT count(*) FROM public.questions WHERE submitted_by=NEW.submitted_by AND politician_id=NEW.politician_id AND NOT is_seeded AND created_at>now()-interval '24 hours')>=3
  THEN RAISE EXCEPTION 'Question submission limit reached' USING ERRCODE='P0001'; END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.enforce_question_submission_limit() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_question_submission_limit() TO service_role;
CREATE OR REPLACE TRIGGER questions_enforce_submission_limit BEFORE INSERT ON public.questions FOR EACH ROW EXECUTE FUNCTION public.enforce_question_submission_limit();

-- OTP completion and tier upgrade retain the current owner binding and source.
CREATE OR REPLACE FUNCTION public.update_politician_verification_tier()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE completed_count integer; source public.politician_verification_sources;
BEGIN
  IF NEW.status <> 'completed' THEN RETURN NEW; END IF;
  PERFORM 1 FROM public.politicians WHERE id=NEW.politician_id FOR UPDATE;
  PERFORM 1 FROM public.politician_team WHERE politician_id=NEW.politician_id AND user_id=NEW.user_id AND role='admin' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Verification requires the current profile admin' USING ERRCODE='42501'; END IF;
  SELECT * INTO source FROM public.politician_verification_sources WHERE politician_id=NEW.politician_id FOR SHARE;
  IF NEW.method::text IN ('gov_email','meta_tag') AND (
    source.politician_id IS NULL OR NEW.metadata->>'assurance' IS DISTINCT FROM 'reviewed_source_v1'
    OR NEW.metadata->>'source_url' IS DISTINCT FROM source.evidence_url
    OR (NEW.method::text='meta_tag' AND NEW.metadata->>'website_url' IS DISTINCT FROM source.official_website_url)
    OR (NEW.method::text='gov_email' AND NOT coalesce(lower(split_part(NEW.metadata->>'email','@',2)) = ANY(source.government_email_domains),false))
  ) THEN RAISE EXCEPTION 'Reviewed official source required' USING ERRCODE='42501'; END IF;
  SELECT count(DISTINCT v.method) INTO completed_count FROM public.politician_verifications v
    WHERE v.politician_id=NEW.politician_id AND v.user_id=NEW.user_id AND v.status='completed'
    AND (v.method::text NOT IN ('gov_email','meta_tag') OR (
      v.metadata->>'assurance'='reviewed_source_v1' AND v.metadata->>'source_url'=source.evidence_url
      AND ((v.method::text='meta_tag' AND v.metadata->>'website_url'=source.official_website_url)
        OR (v.method::text='gov_email' AND lower(split_part(v.metadata->>'email','@',2))=ANY(source.government_email_domains)))
    ));
  IF completed_count>=2 THEN UPDATE public.politicians SET verification_tier='2' WHERE id=NEW.politician_id AND verification_tier IN ('0','1'); END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.update_politician_verification_tier() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_politician_verification_tier() TO service_role;

-- Pin legacy routines to trusted schemas. Trigger functions need no browser RPC grant.
DO $$
DECLARE fn record;
BEGIN
  FOR fn IN SELECT p.oid::regprocedure signature,p.prorettype='trigger'::regtype AS trigger_function
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('check_report_threshold','publish_forwarded_to_knowledge','participation_rate_period','update_updated_at','current_week_number','participation_rate','generate_slug','weekly_reset','handle_new_user','search_politicians')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = pg_catalog, public',fn.signature);
    IF fn.trigger_function THEN EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC,anon,authenticated',fn.signature); END IF;
  END LOOP;
END $$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC,anon,authenticated;
-- PostgREST never needs these SQL maintenance privileges on browser roles.
DO $$
DECLARE tab record;
BEGIN
  FOR tab IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM PUBLIC,anon,authenticated',tab.tablename);
  END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
