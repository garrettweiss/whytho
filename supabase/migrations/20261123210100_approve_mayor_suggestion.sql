BEGIN;

CREATE FUNCTION public.approve_mayor_suggestion(
  p_feedback_id uuid,
  p_reviewer_id uuid DEFAULT NULL,
  p_government_email_domain text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  suggestion public.chatbot_feedback%ROWTYPE;
  lines text[];
  mayor_name text;
  location_parts text[];
  official_url text;
  published_id uuid;
BEGIN
  SELECT * INTO suggestion
  FROM public.chatbot_feedback
  WHERE id = p_feedback_id AND category = 'mayor_request'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mayor suggestion not found' USING ERRCODE = 'P0002';
  END IF;
  IF suggestion.status NOT IN ('new', 'reviewed') THEN
    RAISE EXCEPTION 'Mayor suggestion was already resolved' USING ERRCODE = '55000';
  END IF;

  lines := pg_catalog.string_to_array(suggestion.raw_message, E'\n');
  mayor_name := pg_catalog.substring(lines[1], '^Mayor: ([^[:cntrl:]]+)$');
  location_parts := pg_catalog.regexp_match(lines[2], '^City: ([^[:cntrl:]]+), ([A-Z]{2})$');
  official_url := pg_catalog.substring(lines[3], '^Official source: (https://[^[:space:][:cntrl:]]+)$');
  IF pg_catalog.cardinality(lines) <> 3 OR mayor_name IS NULL OR location_parts IS NULL OR official_url IS NULL THEN
    RAISE EXCEPTION 'Mayor suggestion is incomplete' USING ERRCODE = '22023';
  END IF;

  published_id := public.publish_reviewed_mayor(
    mayor_name, location_parts[1], location_parts[2], official_url, NULL, p_reviewer_id, p_government_email_domain
  );
  IF published_id IS NULL THEN
    RAISE EXCEPTION 'Mayor publication did not return a profile' USING ERRCODE = '55000';
  END IF;

  UPDATE public.chatbot_feedback SET status = 'actioned' WHERE id = p_feedback_id;
  RETURN published_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_mayor_suggestion(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_mayor_suggestion(uuid, uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
