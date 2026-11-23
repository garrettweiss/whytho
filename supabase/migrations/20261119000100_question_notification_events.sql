-- Local candidate only: recording an event does not authorize sending a message.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS questions_notification_binding_idx
  ON public.questions(id,politician_id);

CREATE TABLE IF NOT EXISTS public.question_notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL UNIQUE,
  politician_id uuid NOT NULL,
  event_key text GENERATED ALWAYS AS ('question-created:' || question_id::text) STORED UNIQUE,
  question_created_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  schema_version integer NOT NULL DEFAULT 1 CHECK(schema_version=1),
  CONSTRAINT question_notification_binding FOREIGN KEY(question_id,politician_id)
    REFERENCES public.questions(id,politician_id)
);
ALTER TABLE public.question_notification_events OWNER TO postgres;
ALTER TABLE public.question_notification_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.question_notification_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.question_notification_events TO service_role;

CREATE OR REPLACE FUNCTION public.record_question_notification_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  -- Only initial publication or a nonpublic-to-active transition is a new event.
  IF TG_OP='UPDATE' THEN
    IF OLD.status='active' OR NEW.status<>'active' THEN RETURN NEW; END IF;
  END IF;
  IF NEW.status<>'active' OR NEW.source<>'user' OR NEW.is_seeded
    OR NEW.submitted_by IS NULL OR NEW.x_post_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.politicians p
      WHERE p.id=NEW.politician_id AND p.is_active AND NOT p.is_test) THEN RETURN NEW; END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=NEW.submitted_by
      AND NOT coalesce(u.is_anonymous,false) AND u.email_confirmed_at IS NOT NULL)
    THEN RETURN NEW; END IF;
  INSERT INTO public.question_notification_events(question_id,politician_id,question_created_at)
    VALUES(NEW.id,NEW.politician_id,NEW.created_at)
    ON CONFLICT(question_id) DO NOTHING;
  RETURN NEW;
END;
$$;
ALTER FUNCTION public.record_question_notification_event() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.record_question_notification_event() FROM PUBLIC,anon,authenticated,service_role;

-- Do not drop/recreate an existing trigger or backfill historical questions.
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.questions'::regclass
      AND tgname='question_notification_event_after_publication' AND NOT tgisinternal) THEN
    CREATE TRIGGER question_notification_event_after_publication
      AFTER INSERT OR UPDATE OF status ON public.questions
      FOR EACH ROW EXECUTE FUNCTION public.record_question_notification_event();
  END IF;
END $$;
COMMENT ON TABLE public.question_notification_events IS
  'Private append-only publication ledger. No recipient, worker, provider call, or sending authorization.';
COMMIT;
