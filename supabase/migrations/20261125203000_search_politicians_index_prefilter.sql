-- Search latency fix. The 20261123031955 rewrite of search_politicians scored every
-- politician row (11.5k word_similarity calls plus a correlated alias lookup per row,
-- ~67k buffer reads) before applying the > 0.3 threshold, so each keystroke cost a full
-- scan regardless of the query. Prefilter candidates with the pg_trgm word-similarity
-- operator (<%), which the existing GIN trigram indexes on politicians.full_name and
-- politician_aliases.alias support, plus a new expression index over the aliases[] array.
-- Scoring, threshold, canonical dedupe, ordering and limits are unchanged; results are
-- identical to the previous version (verified on a full production data copy).

-- array_to_string is only STABLE, so an IMMUTABLE wrapper is required for the index.
CREATE OR REPLACE FUNCTION public.politician_alias_search_text(aliases text[])
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT SET search_path=pg_catalog AS $$
 SELECT pg_catalog.array_to_string(aliases, ' ')
$$;
REVOKE ALL ON FUNCTION public.politician_alias_search_text(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.politician_alias_search_text(text[]) TO anon,authenticated,service_role;

CREATE INDEX IF NOT EXISTS idx_politicians_alias_text_trgm
 ON public.politicians USING gin (public.politician_alias_search_text(aliases) public.gin_trgm_ops);

-- word_similarity threshold is pinned to the same 0.3 the HAVING clause uses, so the
-- index prefilter is a superset of the final result set and semantics do not change.
CREATE OR REPLACE FUNCTION public.search_politicians(query text,result_limit integer DEFAULT 8)
RETURNS TABLE(id uuid,slug text,full_name text,office text,state text,party text,photo_url text)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog
SET pg_trgm.word_similarity_threshold=0.3
AS $$
 WITH candidates AS (
  SELECT p.id FROM public.politicians p WHERE query OPERATOR(public.<%) p.full_name
  UNION
  SELECT a.politician_id FROM public.politician_aliases a WHERE query OPERATOR(public.<%) a.alias
  UNION
  SELECT p.id FROM public.politicians p WHERE query OPERATOR(public.<%) public.politician_alias_search_text(p.aliases)
 ), matched AS (
  SELECT coalesce(p.canonical_politician_id,p.id) root_id,
    greatest(public.word_similarity(query,p.full_name),
      coalesce((SELECT max(public.word_similarity(query,a.alias)) FROM public.politician_aliases a WHERE a.politician_id=p.id),0),
      coalesce((SELECT max(public.word_similarity(query,a)) FROM unnest(p.aliases) a),0)) score
  FROM public.politicians p JOIN candidates c ON c.id=p.id
  WHERE NOT p.is_test AND length(trim(query)) BETWEEN 2 AND 100
 ), ranked AS (SELECT root_id,max(score) score FROM matched GROUP BY root_id HAVING max(score)>0.3)
 SELECT p.id,p.slug,p.full_name,p.office,p.state,p.party,p.photo_url
 FROM ranked r JOIN public.politicians p ON p.id=r.root_id
 WHERE p.is_active AND NOT p.is_test AND p.canonical_politician_id IS NULL
 ORDER BY r.score DESC,p.full_name,p.id LIMIT least(greatest(coalesce(result_limit,8),1),50)
$$;
REVOKE ALL ON FUNCTION public.search_politicians(text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_politicians(text,integer) TO anon,authenticated,service_role;
ANALYZE public.politicians;
