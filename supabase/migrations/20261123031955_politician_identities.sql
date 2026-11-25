-- Additive identity foundation. No identities are linked by this migration.
BEGIN;

ALTER TABLE public.politicians ADD COLUMN canonical_politician_id uuid
  REFERENCES public.politicians(id) ON DELETE RESTRICT;
ALTER TABLE public.politicians ADD CONSTRAINT politicians_identity_not_self
  CHECK (canonical_politician_id IS DISTINCT FROM id);
CREATE INDEX politicians_canonical_identity_idx ON public.politicians(canonical_politician_id)
  WHERE canonical_politician_id IS NOT NULL;

CREATE TABLE public.politician_identity_decisions (
 id uuid PRIMARY KEY,
 source_id uuid NOT NULL REFERENCES public.politicians(id),
 canonical_id uuid NOT NULL REFERENCES public.politicians(id),
 reviewed_by text NOT NULL CHECK(length(trim(reviewed_by)) BETWEEN 2 AND 200),
 evidence jsonb NOT NULL,
 fields jsonb NOT NULL,
 before_state jsonb NOT NULL,
 dependency_counts jsonb NOT NULL,
 transaction_id bigint NOT NULL DEFAULT txid_current(),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_id)
);
CREATE TABLE public.politician_external_identifiers (
 namespace text NOT NULL CHECK(namespace IN ('congress.bioguide','openstates.person','fec.candidate','reviewed.governor','govtrack.person','votesmart.person')),
 external_id text NOT NULL CHECK(length(trim(external_id)) BETWEEN 1 AND 300 AND external_id=trim(external_id)),
 canonical_id uuid NOT NULL REFERENCES public.politicians(id),
 source_profile_id uuid NOT NULL REFERENCES public.politicians(id),
 source_url text,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(namespace,external_id)
);
CREATE INDEX politician_external_identifiers_canonical_idx ON public.politician_external_identifiers(canonical_id);
CREATE TABLE public.politician_identity_observations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 namespace text NOT NULL,
 external_id text NOT NULL,
 canonical_id uuid REFERENCES public.politicians(id),
 source_profile_id uuid REFERENCES public.politicians(id),
 source_url text,
 record jsonb NOT NULL,
 record_hash text NOT NULL,
 review_required_fields text[] NOT NULL DEFAULT '{}' CHECK(review_required_fields <@ ARRAY['photo']::text[]),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(namespace,external_id,record_hash)
);
ALTER TABLE public.politician_identity_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.politician_external_identifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.politician_identity_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.politician_identity_decisions,public.politician_external_identifiers,public.politician_identity_observations FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.politician_identity_decisions,public.politician_external_identifiers,public.politician_identity_observations TO service_role;

CREATE FUNCTION public.canonical_politician_id(p_id uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT coalesce(p.canonical_politician_id,p.id) FROM public.politicians p WHERE p.id=p_id
$$;
CREATE FUNCTION public.resolve_politician_identity(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE root public.politicians; members uuid[];
BEGIN
 SELECT p.* INTO root FROM public.politicians p WHERE p.id=public.canonical_politician_id(p_id);
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF root.canonical_politician_id IS NOT NULL THEN RAISE EXCEPTION 'Invalid chained identity' USING ERRCODE='23514'; END IF;
 SELECT array_agg(p.id ORDER BY p.id) INTO members FROM public.politicians p WHERE p.id=root.id OR p.canonical_politician_id=root.id;
 IF cardinality(members)>200 THEN RAISE EXCEPTION 'Identity group exceeds public bound' USING ERRCODE='54000'; END IF;
 RETURN jsonb_build_object('canonical_id',root.id,'canonical_slug',root.slug,'member_ids',to_jsonb(members));
END $$;
REVOKE ALL ON FUNCTION public.canonical_politician_id(uuid),public.resolve_politician_identity(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.canonical_politician_id(uuid),public.resolve_politician_identity(uuid) TO anon,authenticated,service_role;

-- Only an audited link transaction can change an existing identity relationship.
CREATE FUNCTION public.guard_politician_identity_link() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target public.politicians;
BEGIN
 IF TG_OP='UPDATE' AND NEW.canonical_politician_id IS NOT DISTINCT FROM OLD.canonical_politician_id THEN RETURN NEW; END IF;
 IF NEW.canonical_politician_id IS NULL AND TG_OP='INSERT' THEN RETURN NEW; END IF;
 IF NEW.canonical_politician_id IS NULL OR (TG_OP='UPDATE' AND OLD.canonical_politician_id IS NOT NULL) THEN
  RAISE EXCEPTION 'Identity reversal requires a separate reviewed operation' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.politician_identity_decisions d WHERE d.source_id=NEW.id
   AND d.canonical_id=NEW.canonical_politician_id AND d.transaction_id=txid_current()) THEN
  RAISE EXCEPTION 'Reviewed identity decision required' USING ERRCODE='42501';
 END IF;
 SELECT * INTO target FROM public.politicians WHERE id=NEW.canonical_politician_id FOR UPDATE;
 IF NOT FOUND OR target.canonical_politician_id IS NOT NULL OR target.id=NEW.id
   OR target.is_test OR NEW.is_test OR EXISTS(SELECT 1 FROM public.politicians WHERE canonical_politician_id=NEW.id) THEN
  RAISE EXCEPTION 'Invalid identity root or test profile' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_politician_identity_link() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER politicians_guard_identity BEFORE INSERT OR UPDATE OF canonical_politician_id ON public.politicians
 FOR EACH ROW EXECUTE FUNCTION public.guard_politician_identity_link();

-- Before the existing quota trigger, bind only NEW questions to the current root.
CREATE FUNCTION public.bind_new_question_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target uuid;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('whytho:politician-identities',0));
 SELECT coalesce(p.canonical_politician_id,p.id) INTO target FROM public.politicians p WHERE p.id=NEW.politician_id FOR SHARE;
 IF target IS NULL THEN RAISE EXCEPTION 'Politician not found' USING ERRCODE='23503'; END IF;
 PERFORM 1 FROM public.politicians WHERE id=target AND canonical_politician_id IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invalid canonical politician' USING ERRCODE='23514'; END IF;
 NEW.politician_id:=target;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.bind_new_question_identity() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER a_questions_canonical_identity BEFORE INSERT ON public.questions
 FOR EACH ROW EXECUTE FUNCTION public.bind_new_question_identity();

-- Identity equivalence never authorizes a new claim or proof on an old alias.
CREATE FUNCTION public.reject_alias_authority_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE linked uuid;
BEGIN
 SELECT canonical_politician_id INTO linked FROM public.politicians WHERE id=NEW.politician_id FOR SHARE;
 IF linked IS NOT NULL THEN RAISE EXCEPTION 'Use the canonical profile for new authority' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.reject_alias_authority_write() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER politician_team_canonical_authority BEFORE INSERT OR UPDATE OF politician_id ON public.politician_team
 FOR EACH ROW EXECUTE FUNCTION public.reject_alias_authority_write();
CREATE TRIGGER politician_verifications_canonical_authority BEFORE INSERT OR UPDATE OF politician_id ON public.politician_verifications
 FOR EACH ROW EXECUTE FUNCTION public.reject_alias_authority_write();

CREATE FUNCTION public.politician_identity_dependency_counts(p_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb; relation text; tally bigint;
BEGIN
 IF p_ids IS NULL OR cardinality(p_ids)>200 THEN RAISE EXCEPTION 'Invalid dependency scope' USING ERRCODE='22023'; END IF;
 SELECT jsonb_build_object(
 'questions',(SELECT count(*) FROM public.questions WHERE politician_id=ANY(p_ids)),
 'answers',(SELECT count(*) FROM public.answers WHERE politician_id=ANY(p_ids)),
 'votes',(SELECT count(*) FROM public.votes v JOIN public.questions q ON q.id=v.question_id WHERE q.politician_id=ANY(p_ids)),
 'snapshots',(SELECT count(*) FROM public.weekly_snapshots WHERE politician_id=ANY(p_ids)),
 'team',(SELECT count(*) FROM public.politician_team WHERE politician_id=ANY(p_ids)),
 'verifications',(SELECT count(*) FROM public.politician_verifications WHERE politician_id=ANY(p_ids)),
 'x_posts',(SELECT count(*) FROM public.x_posts WHERE politician_id=ANY(p_ids)),
 'outreach',(SELECT count(*) FROM public.x_outreach_log WHERE politician_id=ANY(p_ids))) INTO result;
 -- Fixed relation names cover additional ledgers when their candidate migrations exist.
 FOREACH relation IN ARRAY ARRAY['politician_aliases','politician_verification_sources','politician_photo_history',
  'politician_account_audit','race_candidates','answer_media','question_notification_events',
  'politician_notification_preferences','politician_notification_consent_audit'] LOOP
  IF to_regclass('public.'||relation) IS NOT NULL THEN
   EXECUTE format('SELECT count(*) FROM public.%I WHERE politician_id=ANY($1)',relation) INTO tally USING p_ids;
   result:=result||jsonb_build_object(relation,tally);
  END IF;
 END LOOP;
 IF to_regclass('public.answer_corrections') IS NOT NULL THEN
  EXECUTE 'SELECT count(*) FROM public.answer_corrections c JOIN public.answers a ON a.id=c.answer_id WHERE a.politician_id=ANY($1)' INTO tally USING p_ids;
  result:=result||jsonb_build_object('answer_corrections',tally);
 END IF;
 IF to_regclass('public.question_reports') IS NOT NULL THEN
  EXECUTE 'SELECT count(*) FROM public.question_reports r JOIN public.questions q ON q.id=r.question_id WHERE q.politician_id=ANY($1)' INTO tally USING p_ids;
  result:=result||jsonb_build_object('question_reports',tally);
 END IF;
 IF to_regclass('public.races') IS NOT NULL THEN
  EXECUTE 'SELECT count(*) FROM public.races WHERE incumbent_id=ANY($1)' INTO tally USING p_ids;
  result:=result||jsonb_build_object('incumbent_races',tally);
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.politician_identity_dependency_counts(uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.politician_identity_dependency_counts(uuid[]) TO service_role;

CREATE FUNCTION public.link_politician_identity(
 p_source_id uuid,p_canonical_id uuid,p_source_updated_at timestamptz,p_canonical_updated_at timestamptz,
 p_expected_counts jsonb,p_decision_id uuid,p_reviewed_by text,p_evidence jsonb,p_fields jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE source public.politicians; target public.politicians; members uuid[]; counts jsonb; identifier record; decision record; value text;
BEGIN
 IF p_source_id IS NULL OR p_canonical_id IS NULL OR p_source_id=p_canonical_id OR p_decision_id IS NULL
   OR p_evidence IS NULL OR jsonb_typeof(p_evidence)<>'object' OR p_evidence->'approved_to_apply' IS DISTINCT FROM 'true'::jsonb
   OR pg_column_size(p_evidence)>65536
   OR jsonb_typeof(p_evidence->'source_urls') IS DISTINCT FROM 'array' OR jsonb_array_length(p_evidence->'source_urls') NOT BETWEEN 1 AND 20
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_evidence->'source_urls') u WHERE jsonb_typeof(u)<>'string' OR length(u#>>'{}')>2000 OR (u#>>'{}') !~ '^https://')
   OR p_reviewed_by IS NULL OR length(trim(p_reviewed_by)) NOT BETWEEN 2 AND 200
   OR p_fields IS NULL OR jsonb_typeof(p_fields)<>'object'
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_fields) k WHERE k NOT IN ('party','aliases')) THEN
  RAISE EXCEPTION 'Explicit reviewed identity evidence and supported fields required' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('whytho:politician-identities',0));
 SELECT * INTO decision FROM public.politician_identity_decisions WHERE id=p_decision_id;
 IF FOUND THEN
  IF decision.source_id<>p_source_id OR decision.canonical_id<>p_canonical_id OR decision.fields<>p_fields OR decision.evidence<>p_evidence THEN
   RAISE EXCEPTION 'Decision key already used' USING ERRCODE='23505';
  END IF;
  RETURN public.resolve_politician_identity(p_canonical_id);
 END IF;
 -- Lock the entire resulting group in a consistent order before checking claims.
 SELECT array_agg(id ORDER BY id) INTO members FROM public.politicians
 WHERE id IN(p_source_id,p_canonical_id) OR canonical_politician_id IN(p_source_id,p_canonical_id);
 PERFORM 1 FROM public.politicians WHERE id=ANY(members) ORDER BY id FOR UPDATE;
 SELECT * INTO source FROM public.politicians WHERE id=p_source_id;
 SELECT * INTO target FROM public.politicians WHERE id=p_canonical_id;
 IF source.id IS NULL OR target.id IS NULL THEN RAISE EXCEPTION 'Profile missing' USING ERRCODE='P0002'; END IF;
 IF source.canonical_politician_id IS NOT NULL OR target.canonical_politician_id IS NOT NULL
   OR EXISTS(SELECT 1 FROM public.politicians WHERE canonical_politician_id=p_source_id)
   OR cardinality(members)>200 THEN RAISE EXCEPTION 'Link must join an unlinked source to one bounded root' USING ERRCODE='23514'; END IF;
 IF source.updated_at IS DISTINCT FROM p_source_updated_at OR target.updated_at IS DISTINCT FROM p_canonical_updated_at THEN
  RAISE EXCEPTION 'Profiles changed since review' USING ERRCODE='40001';
 END IF;
 counts:=public.politician_identity_dependency_counts(members);
 IF p_expected_counts IS DISTINCT FROM counts THEN RAISE EXCEPTION 'Dependencies changed since review' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM public.politicians WHERE id=ANY(members) AND (is_test OR NOT is_active OR verification_tier::text<>'0'))
   OR (counts->>'team')::bigint<>0 OR (counts->>'verifications')::bigint<>0
   OR EXISTS(SELECT 1 FROM public.answers WHERE politician_id=ANY(members) AND NOT is_ai_generated)
   OR EXISTS(SELECT 1 FROM public.politician_verification_sources WHERE politician_id=ANY(members)) THEN
  RAISE EXCEPTION 'Authority or inactive-profile review requires a separate operation' USING ERRCODE='42501';
 END IF;
 IF (source.bioguide_id IS NOT NULL AND target.bioguide_id IS NOT NULL AND source.bioguide_id<>target.bioguide_id)
 OR (source.openstates_id IS NOT NULL AND target.openstates_id IS NOT NULL AND source.openstates_id<>target.openstates_id)
 OR (source.govtrack_id IS NOT NULL AND target.govtrack_id IS NOT NULL AND source.govtrack_id<>target.govtrack_id)
 OR (source.votesmart_id IS NOT NULL AND target.votesmart_id IS NOT NULL AND source.votesmart_id<>target.votesmart_id)
 OR EXISTS(SELECT namespace FROM public.politician_external_identifiers WHERE canonical_id=ANY(members)
   AND namespace NOT IN('fec.candidate','reviewed.governor') GROUP BY namespace HAVING count(DISTINCT external_id)>1)
 OR EXISTS(SELECT all_ids.namespace FROM (
  SELECT v.namespace,v.external_id FROM public.politicians p CROSS JOIN LATERAL (VALUES
   ('congress.bioguide',p.bioguide_id),('openstates.person',p.openstates_id),
   ('govtrack.person',p.govtrack_id),('votesmart.person',p.votesmart_id)) v(namespace,external_id)
   WHERE p.id=ANY(members) AND nullif(trim(v.external_id),'') IS NOT NULL
  UNION ALL SELECT namespace,external_id FROM public.politician_external_identifiers
   WHERE canonical_id=ANY(members) AND namespace NOT IN('fec.candidate','reviewed.governor')
 ) all_ids GROUP BY all_ids.namespace HAVING count(DISTINCT all_ids.external_id)>1) THEN
  RAISE EXCEPTION 'Conflicting stable identities require review' USING ERRCODE='23514';
 END IF;
 IF p_fields ? 'party' AND (jsonb_typeof(p_fields->'party')<>'string' OR length(trim(p_fields->>'party')) NOT BETWEEN 1 AND 100
   OR (target.party IS NOT NULL AND target.party<>p_fields->>'party')) THEN
  RAISE EXCEPTION 'Party selection may only fill a reviewed missing value' USING ERRCODE='22023';
 END IF;
 IF p_fields ? 'aliases' AND (jsonb_typeof(p_fields->'aliases')<>'array'
   OR jsonb_array_length(p_fields->'aliases')>200 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_fields->'aliases') a WHERE jsonb_typeof(a)<>'string' OR length(a#>>'{}') NOT BETWEEN 1 AND 200)) THEN
  RAISE EXCEPTION 'Invalid reviewed aliases' USING ERRCODE='22023';
 END IF;
 -- Registry owns identifiers; original unique/raw columns are never cleared or moved.
 FOR identifier IN
  SELECT DISTINCT p.id AS source_id,v.namespace,v.external_id FROM public.politicians p
  CROSS JOIN LATERAL (VALUES
   ('congress.bioguide',p.bioguide_id),('openstates.person',p.openstates_id),
   ('govtrack.person',p.govtrack_id),('votesmart.person',p.votesmart_id),
   ('fec.candidate',p.candidate_fec_id),('fec.candidate',p.fec_candidate_id),
   ('fec.candidate',CASE WHEN p.fec_id ~ '^[HSP][0-9A-Z]{8}$' THEN p.fec_id END)
  ) v(namespace,external_id) WHERE p.id=ANY(members) AND nullif(trim(v.external_id),'') IS NOT NULL
 LOOP
  IF EXISTS(SELECT 1 FROM public.politician_external_identifiers i WHERE i.namespace=identifier.namespace
    AND i.external_id=identifier.external_id AND NOT i.canonical_id=ANY(members)) THEN
   RAISE EXCEPTION 'Provider identifier belongs to another identity' USING ERRCODE='23505';
  END IF;
  IF EXISTS(SELECT 1 FROM public.politicians p WHERE NOT p.id=ANY(members) AND
    CASE identifier.namespace
     WHEN 'congress.bioguide' THEN p.bioguide_id=identifier.external_id
     WHEN 'openstates.person' THEN p.openstates_id=identifier.external_id
     WHEN 'govtrack.person' THEN p.govtrack_id=identifier.external_id
     WHEN 'votesmart.person' THEN p.votesmart_id=identifier.external_id
     WHEN 'fec.candidate' THEN identifier.external_id IN(p.candidate_fec_id,p.fec_candidate_id,p.fec_id)
     ELSE false END) THEN
   RAISE EXCEPTION 'Unreviewed profile shares provider identifier' USING ERRCODE='23505';
  END IF;
  INSERT INTO public.politician_external_identifiers(namespace,external_id,canonical_id,source_profile_id)
   VALUES(identifier.namespace,identifier.external_id,target.id,identifier.source_id)
   ON CONFLICT(namespace,external_id) DO UPDATE SET canonical_id=excluded.canonical_id;
 END LOOP;
 UPDATE public.politician_external_identifiers SET canonical_id=target.id WHERE canonical_id=source.id;
 INSERT INTO public.politician_identity_decisions(id,source_id,canonical_id,reviewed_by,evidence,fields,before_state,dependency_counts)
 VALUES(p_decision_id,source.id,target.id,trim(p_reviewed_by),p_evidence,p_fields,
  jsonb_build_object('source',to_jsonb(source),'canonical',to_jsonb(target),
   'aliases',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.politician_id,a.alias,a.id),'[]') FROM public.politician_aliases a WHERE a.politician_id=ANY(members))),counts);
 INSERT INTO public.politician_identity_observations(namespace,external_id,canonical_id,source_profile_id,record,record_hash)
 VALUES('legacy.profile',source.id::text,target.id,source.id,to_jsonb(source),md5(to_jsonb(source)::text))
 ON CONFLICT(namespace,external_id,record_hash) DO NOTHING;
 UPDATE public.politicians SET
  party=CASE WHEN p_fields ? 'party' THEN p_fields->>'party' ELSE party END,
  aliases=ARRAY(SELECT DISTINCT a FROM unnest(target.aliases||source.aliases||ARRAY[source.full_name]||
   ARRAY(SELECT jsonb_array_elements_text(coalesce(p_fields->'aliases','[]')))) a WHERE nullif(trim(a),'') IS NOT NULL ORDER BY a)
 WHERE id=target.id;
 INSERT INTO public.politician_aliases(politician_id,alias,alias_type)
  SELECT target.id,a.alias,a.alias_type FROM public.politician_aliases a WHERE a.politician_id=source.id
  ON CONFLICT(politician_id,alias) DO NOTHING;
 INSERT INTO public.politician_aliases(politician_id,alias,alias_type)
  SELECT target.id,a,'nickname' FROM unnest(source.aliases||ARRAY[source.full_name]||
   ARRAY(SELECT jsonb_array_elements_text(coalesce(p_fields->'aliases','[]')))) a
  WHERE nullif(trim(a),'') IS NOT NULL ON CONFLICT(politician_id,alias) DO NOTHING;
 UPDATE public.politicians SET canonical_politician_id=target.id WHERE id=source.id;
 RETURN public.resolve_politician_identity(target.id);
END $$;
REVOKE ALL ON FUNCTION public.link_politician_identity(uuid,uuid,timestamptz,timestamptz,jsonb,uuid,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.link_politician_identity(uuid,uuid,timestamptz,timestamptz,jsonb,uuid,text,jsonb,jsonb) TO service_role;

-- Name matching discovers review candidates; it does not approve an identity link.
CREATE FUNCTION public.identity_name_key(p_name text) RETURNS text
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT lower(regexp_replace(normalize(coalesce(p_name,''),NFKD),'[^[:alnum:]]','','g'))
$$;
CREATE FUNCTION public.identity_state_code(p_state text) RETURNS text
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT code FROM (VALUES
 ('AL','Alabama'),('AK','Alaska'),('AZ','Arizona'),('AR','Arkansas'),('CA','California'),('CO','Colorado'),
 ('CT','Connecticut'),('DE','Delaware'),('FL','Florida'),('GA','Georgia'),('HI','Hawaii'),('ID','Idaho'),
 ('IL','Illinois'),('IN','Indiana'),('IA','Iowa'),('KS','Kansas'),('KY','Kentucky'),('LA','Louisiana'),
 ('ME','Maine'),('MD','Maryland'),('MA','Massachusetts'),('MI','Michigan'),('MN','Minnesota'),('MS','Mississippi'),
 ('MO','Missouri'),('MT','Montana'),('NE','Nebraska'),('NV','Nevada'),('NH','New Hampshire'),('NJ','New Jersey'),
 ('NM','New Mexico'),('NY','New York'),('NC','North Carolina'),('ND','North Dakota'),('OH','Ohio'),('OK','Oklahoma'),
 ('OR','Oregon'),('PA','Pennsylvania'),('RI','Rhode Island'),('SC','South Carolina'),('SD','South Dakota'),
 ('TN','Tennessee'),('TX','Texas'),('UT','Utah'),('VT','Vermont'),('VA','Virginia'),('WA','Washington'),
 ('WV','West Virginia'),('WI','Wisconsin'),('WY','Wyoming'),('DC','District of Columbia'),('PR','Puerto Rico'),
 ('VI','Virgin Islands'),('GU','Guam'),('AS','American Samoa'),('MP','Northern Mariana Islands')
 ) s(code,name) WHERE lower(trim(p_state)) IN(lower(code),lower(name),replace(lower(name),' ','-'))
 OR (code='DC' AND lower(trim(p_state)) IN('washington d.c.','washington dc','washington-dc'))
$$;
REVOKE ALL ON FUNCTION public.identity_name_key(text),public.identity_state_code(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.identity_name_key(text),public.identity_state_code(text) TO service_role;

CREATE FUNCTION public.ingest_politician_identity(p_namespace text,p_external_id text,p_record jsonb,p_source_url text DEFAULT NULL,p_apply boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE matches uuid[]; candidates uuid[]; root_id uuid; source_id uuid; person public.politicians; result jsonb;
 state_code text; name text; slug_base text; new_id uuid; status text; observation_hash text; candidate boolean; year integer; photo_status text:='not_provided';
BEGIN
 IF p_namespace IS NULL OR p_namespace NOT IN('congress.bioguide','openstates.person','fec.candidate','reviewed.governor')
  OR p_external_id IS NULL OR length(trim(p_external_id)) NOT BETWEEN 1 AND 300 OR p_external_id<>trim(p_external_id)
  OR p_record IS NULL OR jsonb_typeof(p_record)<>'object' OR pg_column_size(p_record)>65536
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_record) k WHERE k NOT IN(
   'full_name','state','office','district','party','bio','website_url','aliases','is_candidate','candidate_election_year',
   'candidate_office','incumbent_challenge','candidate_status','election_date','race_id','bioguide_id',
   'photo_url','photo_source_url','photo_credit','photo_rights_basis')) THEN
  RAISE EXCEPTION 'Invalid identity import observation' USING ERRCODE='22023';
 END IF;
 name:=trim(regexp_replace(p_record->>'full_name','[[:space:]]+',' ','g'));
 state_code:=public.identity_state_code(p_record->>'state');
 IF name IS NULL OR length(name) NOT BETWEEN 1 AND 200 OR state_code IS NULL
  OR (p_record->>'office' IS NOT NULL AND length(p_record->>'office')>200)
  OR (p_record ? 'aliases' AND (jsonb_typeof(p_record->'aliases')<>'array' OR jsonb_array_length(p_record->'aliases')>200
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_record->'aliases') a WHERE jsonb_typeof(a)<>'string' OR length(a#>>'{}') NOT BETWEEN 1 AND 200)))
  OR (p_source_url IS NOT NULL AND (length(p_source_url)>2000 OR p_source_url !~ '^https://'))
  OR (p_namespace='fec.candidate' AND p_external_id !~ '^[HSP][A-Z0-9]{8}$')
  OR (p_namespace='congress.bioguide' AND p_external_id !~ '^[A-Z][0-9]{6}$') THEN
  RAISE EXCEPTION 'Invalid provider identity or name/state' USING ERRCODE='22023';
 END IF;
 IF nullif(trim(p_record->>'photo_url'),'') IS NOT NULL THEN photo_status:='review_required'; END IF;
 candidate:=coalesce((p_record->>'is_candidate')::boolean,false);
 year:=(p_record->>'candidate_election_year')::integer;
 IF year IS NOT NULL AND year NOT BETWEEN 1900 AND 2200 THEN RAISE EXCEPTION 'Invalid election year' USING ERRCODE='22023'; END IF;
 IF p_apply THEN PERFORM pg_advisory_xact_lock(hashtextextended('whytho:politician-identities',0)); END IF;
 SELECT array_agg(DISTINCT candidate_id) INTO matches FROM (
  SELECT i.canonical_id AS candidate_id FROM public.politician_external_identifiers i WHERE i.namespace=p_namespace AND i.external_id=p_external_id
  UNION ALL
  SELECT coalesce(p.canonical_politician_id,p.id) FROM public.politicians p WHERE
   CASE p_namespace
    WHEN 'congress.bioguide' THEN p.bioguide_id=p_external_id
    WHEN 'openstates.person' THEN p.openstates_id=p_external_id
    WHEN 'fec.candidate' THEN p.candidate_fec_id=p_external_id OR p.fec_candidate_id=p_external_id OR p.fec_id=p_external_id
    ELSE false END
 ) exact;
 IF cardinality(matches)>1 THEN
  RETURN jsonb_build_object('status','review_required','canonical_id',NULL,'canonical_slug',NULL,'member_ids','[]'::jsonb,'candidate_ids',to_jsonb(matches),'reason','conflicting_provider_identity','applied',false,'photo_status',photo_status);
 END IF;
 root_id:=matches[1];
 IF root_id IS NULL THEN
  SELECT array_agg(DISTINCT coalesce(p.canonical_politician_id,p.id)) INTO candidates FROM public.politicians p
  WHERE NOT p.is_test AND (
   public.identity_name_key(p.full_name)=public.identity_name_key(name)
   OR EXISTS(SELECT 1 FROM unnest(p.aliases) a WHERE public.identity_name_key(a)=public.identity_name_key(name))
   OR EXISTS(SELECT 1 FROM public.politician_aliases a WHERE a.politician_id=p.id AND public.identity_name_key(a.alias)=public.identity_name_key(name))
   OR (p_record->>'bioguide_id' IS NOT NULL AND p.bioguide_id=p_record->>'bioguide_id')
   OR (public.identity_state_code(p.state)=state_code AND lower(coalesce(p.office,''))=lower(coalesce(p_record->>'office',''))
    AND public.identity_name_key(regexp_replace(p.full_name,'^.*[[:space:]]',''))=public.identity_name_key(regexp_replace(name,'^.*[[:space:]]','')))
  );
  IF cardinality(candidates)>0 OR p_namespace='reviewed.governor' THEN
   RETURN jsonb_build_object('status','review_required','canonical_id',NULL,'canonical_slug',NULL,'member_ids','[]'::jsonb,
    'candidate_ids',to_jsonb(coalesce(candidates,'{}'::uuid[])),'reason','identity_evidence_required','applied',false,'photo_status',photo_status);
  END IF;
  IF NOT p_apply THEN
   RETURN jsonb_build_object('status','would_create','canonical_id',NULL,'canonical_slug',NULL,'member_ids','[]'::jsonb,'candidate_ids','[]'::jsonb,'reason',NULL,'applied',false,'photo_status',photo_status);
  END IF;
  new_id:=gen_random_uuid();
  slug_base:=trim(both '-' from regexp_replace(lower(name||'-'||state_code),'[^a-z0-9]+','-','g'));
  -- A fresh provider identity gets an immutable collision-safe URL.
  INSERT INTO public.politicians(id,slug,full_name,state,office,district,party,bio,website_url,aliases,bioguide_id,openstates_id,candidate_fec_id,
   is_candidate,politician_type,candidate_election_year,candidate_office,incumbent_challenge,candidate_status,election_date,race_id)
  VALUES(new_id,left(slug_base,110)||'-'||left(replace(new_id::text,'-',''),12),name,state_code,p_record->>'office',p_record->>'district',
   p_record->>'party',p_record->>'bio',p_record->>'website_url',ARRAY(SELECT jsonb_array_elements_text(coalesce(p_record->'aliases','[]'))),
   CASE WHEN p_namespace='congress.bioguide' THEN p_external_id END,CASE WHEN p_namespace='openstates.person' THEN p_external_id END,
   CASE WHEN p_namespace='fec.candidate' THEN p_external_id END,candidate,CASE WHEN candidate THEN 'candidate' ELSE 'elected' END,year,p_record->>'candidate_office',p_record->>'incumbent_challenge',
   CASE WHEN p_record->>'candidate_status' IN('active','won','lost','withdrew','withdrawn') THEN p_record->>'candidate_status' END,(p_record->>'election_date')::date,(p_record->>'race_id')::uuid);
  root_id:=new_id; source_id:=new_id; status:='created';
 ELSE
  IF p_apply THEN PERFORM 1 FROM public.politicians WHERE id=root_id FOR UPDATE; END IF;
  SELECT * INTO person FROM public.politicians WHERE id=root_id;
  IF person.id IS NULL OR person.is_test OR person.canonical_politician_id IS NOT NULL OR NOT person.is_active THEN
   RETURN jsonb_build_object('status','review_required','canonical_id',NULL,'canonical_slug',NULL,'member_ids','[]'::jsonb,'candidate_ids',to_jsonb(matches),'reason','unavailable_identity','applied',false,'photo_status',photo_status);
  END IF;
  SELECT i.source_profile_id INTO source_id FROM public.politician_external_identifiers i
   WHERE i.namespace=p_namespace AND i.external_id=p_external_id;
  IF source_id IS NULL THEN
   SELECT p.id INTO source_id FROM public.politicians p WHERE coalesce(p.canonical_politician_id,p.id)=root_id
    AND CASE p_namespace WHEN 'congress.bioguide' THEN p.bioguide_id=p_external_id
    WHEN 'openstates.person' THEN p.openstates_id=p_external_id
    WHEN 'fec.candidate' THEN p_external_id IN(p.candidate_fec_id,p.fec_candidate_id,p.fec_id) ELSE false END ORDER BY p.id LIMIT 1;
  END IF;
  source_id:=coalesce(source_id,root_id); status:='matched';
  IF photo_status='review_required' AND nullif(trim(person.photo_url),'') IS NOT NULL THEN photo_status:='preserved'; END IF;
  IF p_apply AND person.verification_tier::text='0' AND NOT EXISTS(SELECT 1 FROM public.politician_team WHERE politician_id=root_id) THEN
   UPDATE public.politicians SET
    party=coalesce(nullif(party,''),nullif(p_record->>'party','')),
    bio=coalesce(nullif(bio,''),nullif(p_record->>'bio','')),
    website_url=coalesce(nullif(website_url,''),nullif(p_record->>'website_url','')),
    aliases=ARRAY(SELECT DISTINCT a FROM unnest(person.aliases||ARRAY(SELECT jsonb_array_elements_text(coalesce(p_record->'aliases','[]')))) a ORDER BY a)
   WHERE id=root_id;
  END IF;
 END IF;
 IF p_apply THEN
  INSERT INTO public.politician_external_identifiers(namespace,external_id,canonical_id,source_profile_id,source_url)
   VALUES(p_namespace,p_external_id,root_id,source_id,p_source_url)
   ON CONFLICT(namespace,external_id) DO NOTHING;
  observation_hash:=md5(jsonb_build_object('record',p_record,'source_url',p_source_url)::text);
  INSERT INTO public.politician_identity_observations(namespace,external_id,canonical_id,source_profile_id,source_url,record,record_hash,review_required_fields)
   VALUES(p_namespace,p_external_id,root_id,source_id,p_source_url,p_record,observation_hash,CASE WHEN photo_status='review_required' THEN ARRAY['photo'] ELSE '{}'::text[] END)
   ON CONFLICT(namespace,external_id,record_hash) DO NOTHING;
 END IF;
 result:=public.resolve_politician_identity(root_id);
 RETURN result||jsonb_build_object('status',status,'candidate_ids','[]'::jsonb,'reason',NULL,'applied',coalesce(p_apply,false),'photo_status',photo_status);
END $$;
REVOKE ALL ON FUNCTION public.ingest_politician_identity(text,text,jsonb,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_politician_identity(text,text,jsonb,text,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.search_politicians(query text,result_limit integer DEFAULT 8)
RETURNS TABLE(id uuid,slug text,full_name text,office text,state text,party text,photo_url text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 WITH matched AS (
  SELECT coalesce(p.canonical_politician_id,p.id) root_id,
    greatest(public.word_similarity(query,p.full_name),
      coalesce((SELECT max(public.word_similarity(query,a.alias)) FROM public.politician_aliases a WHERE a.politician_id=p.id),0),
      coalesce((SELECT max(public.word_similarity(query,a)) FROM unnest(p.aliases) a),0)) score
  FROM public.politicians p WHERE NOT p.is_test AND length(trim(query)) BETWEEN 2 AND 100
 ), ranked AS (SELECT root_id,max(score) score FROM matched GROUP BY root_id HAVING max(score)>0.3)
 SELECT p.id,p.slug,p.full_name,p.office,p.state,p.party,p.photo_url
 FROM ranked r JOIN public.politicians p ON p.id=r.root_id
 WHERE p.is_active AND NOT p.is_test AND p.canonical_politician_id IS NULL
 ORDER BY r.score DESC,p.full_name,p.id LIMIT least(greatest(coalesce(result_limit,8),1),50)
$$;
REVOKE ALL ON FUNCTION public.search_politicians(text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_politicians(text,integer) TO anon,authenticated,service_role;

-- Counts join answers to their original question owner, never just the identity root.
CREATE FUNCTION public.identity_profile_summary(p_id uuid,p_period text,p_week integer,p_cutoff timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE identity jsonb; members uuid[]; result jsonb; history jsonb; cutoff timestamptz;
BEGIN
 IF p_period IS NULL OR p_period NOT IN('week','month','year','all') OR p_week IS NULL THEN
  RAISE EXCEPTION 'Invalid identity summary period' USING ERRCODE='22023';
 END IF;
 identity:=public.resolve_politician_identity(p_id);
 IF identity IS NULL THEN RETURN NULL; END IF;
 SELECT array_agg(x::uuid) INTO members FROM jsonb_array_elements_text(identity->'member_ids') x;
 cutoff:=CASE p_period WHEN 'month' THEN coalesce(p_cutoff,now()-interval '28 days')
  WHEN 'year' THEN coalesce(p_cutoff,now()-interval '365 days') ELSE NULL END;
 WITH counted AS (
  SELECT q.id,q.net_upvotes,EXISTS(SELECT 1 FROM public.answers a WHERE a.question_id=q.id
   AND a.politician_id=q.politician_id AND NOT a.is_draft AND NOT a.is_ai_generated
   AND a.answer_type IN('direct','team_statement')) answered
  FROM public.questions q WHERE q.politician_id=ANY(members) AND q.status='active'
   AND (p_period<>'week' OR q.week_number=p_week) AND (cutoff IS NULL OR q.created_at>=cutoff)
 ), totals AS (SELECT count(*) total,count(*) FILTER(WHERE net_upvotes>=10) qualified,
  count(*) FILTER(WHERE answered) answered,count(*) FILTER(WHERE answered AND net_upvotes>=10) responded FROM counted)
 SELECT jsonb_build_object('total_questions',total,'qualifying_questions',qualified,'answered_questions',answered,
  'answered_qualifying',responded,'participation_rate',round(100.0*responded/nullif(qualified,0),2)) INTO result FROM totals;
 WITH weeks AS (
  SELECT week_number,sum(total_questions) total,sum(qualifying_questions) qualified,sum(answered_qualifying) responded
  FROM public.weekly_snapshots WHERE politician_id=ANY(members) AND week_number<public.current_week_number()
  GROUP BY week_number ORDER BY week_number DESC LIMIT 8
 ) SELECT coalesce(jsonb_agg(jsonb_build_object('week_number',week_number,'total_questions',total,
   'qualifying_questions',qualified,'answered_qualifying',responded,
   'participation_rate',round(100.0*responded/nullif(qualified,0),2)) ORDER BY week_number DESC),'[]') INTO history FROM weeks;
 RETURN result||jsonb_build_object('history',history);
END $$;
REVOKE ALL ON FUNCTION public.identity_profile_summary(uuid,text,integer,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.identity_profile_summary(uuid,text,integer,timestamptz) TO anon,authenticated,service_role;

CREATE FUNCTION public.identity_profile_question_ids(p_id uuid,p_period text,p_week integer,p_cutoff timestamptz DEFAULT NULL,p_sort text DEFAULT 'votes',p_limit integer DEFAULT 50)
RETURNS uuid[] LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE identity jsonb; members uuid[]; result uuid[]; cutoff timestamptz;
BEGIN
 IF p_period IS NULL OR p_period NOT IN('week','month','year','all') OR p_week IS NULL
  OR p_sort IS NULL OR p_sort NOT IN('votes','newest','unanswered') OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 THEN
  RAISE EXCEPTION 'Invalid question listing parameters' USING ERRCODE='22023';
 END IF;
 identity:=public.resolve_politician_identity(p_id);
 IF identity IS NULL THEN RETURN NULL; END IF;
 SELECT array_agg(x::uuid) INTO members FROM jsonb_array_elements_text(identity->'member_ids') x;
 cutoff:=CASE p_period WHEN 'month' THEN coalesce(p_cutoff,now()-interval '28 days')
  WHEN 'year' THEN coalesce(p_cutoff,now()-interval '365 days') ELSE NULL END;
 SELECT coalesce(array_agg(id),'{}') INTO result FROM (
  SELECT q.id FROM public.questions q WHERE q.politician_id=ANY(members) AND q.status='active'
   AND (p_period<>'week' OR q.week_number=p_week) AND (cutoff IS NULL OR q.created_at>=cutoff)
   AND (p_sort<>'unanswered' OR NOT EXISTS(SELECT 1 FROM public.answers a WHERE a.question_id=q.id
    AND a.politician_id=q.politician_id AND NOT a.is_draft AND NOT a.is_ai_generated AND a.answer_type IN('direct','team_statement')))
  ORDER BY CASE WHEN p_sort='newest' THEN q.created_at END DESC,
   CASE WHEN p_sort<>'newest' THEN q.net_upvotes END DESC,q.created_at DESC,q.id LIMIT p_limit
 ) ordered_questions;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.identity_profile_question_ids(uuid,text,integer,timestamptz,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.identity_profile_question_ids(uuid,text,integer,timestamptz,text,integer) TO anon,authenticated,service_role;

CREATE FUNCTION public.identity_directory_counts(p_ids uuid[],p_week integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 IF p_ids IS NULL OR cardinality(p_ids)>50 OR p_week IS NULL THEN
  RAISE EXCEPTION 'Directory count batch must contain at most 50 IDs' USING ERRCODE='22023';
 END IF;
 WITH roots AS (SELECT id FROM public.politicians WHERE id=ANY(p_ids) AND canonical_politician_id IS NULL AND is_active AND NOT is_test),
 counts AS (SELECT root.id,count(q.id) questions,count(q.id) FILTER(WHERE EXISTS(
  SELECT 1 FROM public.answers a WHERE a.question_id=q.id AND a.politician_id=q.politician_id
   AND NOT a.is_draft AND NOT a.is_ai_generated AND a.answer_type IN('direct','team_statement'))) replies
  FROM roots root LEFT JOIN public.politicians member ON member.id=root.id OR member.canonical_politician_id=root.id
  LEFT JOIN public.questions q ON q.politician_id=member.id AND q.status='active' AND q.week_number=p_week GROUP BY root.id)
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'questions',questions,'replies',replies) ORDER BY id),'[]') INTO result FROM counts;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.identity_directory_counts(uuid[],integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.identity_directory_counts(uuid[],integer) TO anon,authenticated,service_role;

-- The per-person quota includes historical source IDs after canonical activation.
CREATE OR REPLACE FUNCTION public.enforce_question_submission_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.is_seeded OR NEW.submitted_by IS NULL THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('question-quota:'||NEW.submitted_by::text,0));
 IF (SELECT count(*) FROM public.questions WHERE submitted_by=NEW.submitted_by AND NOT is_seeded AND created_at>now()-interval '24 hours')>=5
 OR (SELECT count(*) FROM public.questions q JOIN public.politicians p ON p.id=q.politician_id
   WHERE q.submitted_by=NEW.submitted_by AND coalesce(p.canonical_politician_id,p.id)=NEW.politician_id
    AND NOT q.is_seeded AND q.created_at>now()-interval '24 hours')>=3 THEN
  RAISE EXCEPTION 'Question submission limit reached' USING ERRCODE='P0001';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_question_submission_limit() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_question_submission_limit() TO service_role;

COMMENT ON COLUMN public.politicians.canonical_politician_id IS 'Reviewed public identity only; historical authority remains bound to each original profile.';
COMMENT ON TABLE public.politician_identity_observations IS 'Private immutable source observations, including dated candidacies and unreviewed portrait provenance. Missing public portraits are marked review_required_fields={photo}; publish only through the reviewed portrait pipeline. Not a sending queue.';
NOTIFY pgrst,'reload schema';
COMMIT;

