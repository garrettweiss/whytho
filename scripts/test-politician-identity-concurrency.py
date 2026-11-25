"""Real local PostgreSQL races. Synthetic data retained, no outbound requests."""
import concurrent.futures
import subprocess
import sys
import time

pg_bin, socket_dir = sys.argv[1:]
base = [pg_bin + '/psql', '-X', '-At', '-h', socket_dir, '-p', '55479', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']

def query(sql):
    return subprocess.run(base + ['-c', sql], capture_output=True, text=True, timeout=15)

def expect(value, label, results=()):
    if not value:
        raise RuntimeError(label + '\n' + '\n'.join(r.stdout + r.stderr for r in results))
    print('PASS: ' + label)

def race(first, second):
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        one = pool.submit(query, first)
        time.sleep(.15)
        two = pool.submit(query, second)
        return one.result(), two.result()

sql = "SELECT public.ingest_politician_identity('congress.bioguide','Q999998','{\"full_name\":\"Concurrent New Provider\",\"state\":\"NY\",\"office\":\"Senator\"}',NULL,true)"
a, b = race('BEGIN; SET ROLE service_role; ' + sql + '; SELECT pg_sleep(.6); COMMIT;', 'SET ROLE service_role; ' + sql)
expect(a.returncode == b.returncode == 0, 'concurrent provider imports complete without deadlock', (a,b))
r = query("SELECT count(*) FROM public.politicians WHERE bioguide_id='Q999998'")
expect(r.stdout.strip() == '1', 'concurrent exact provider import creates one person', (r,))
expect('"status": "created"' in a.stdout and '"status": "matched"' in b.stdout, 'second provider transaction observes first committed mapping', (a,b))

source = '10000000-0000-4000-8000-000000000008'
target = '10000000-0000-4000-8000-000000000007'
actor = '00000000-0000-4000-8000-000000000001'
claim = f"SELECT public.claim_politician_profile('{actor}','{source}')"
link = f"SELECT public.test_link('{source}','{target}')"
a,b = race(f"BEGIN; SET ROLE service_role; {claim}; SELECT pg_sleep(.6); COMMIT;", 'SET ROLE service_role; ' + link)
expect(a.returncode == 0 and b.returncode != 0 and ('Profiles changed' in b.stderr or 'Authority' in b.stderr), 'claim that wins the row lock blocks identity activation', (a,b))
r = query(f"SELECT canonical_politician_id IS NULL AND verification_tier='1' FROM public.politicians WHERE id='{source}'")
expect(r.stdout.strip() == 't', 'concurrent claim preserves source authority', (r,))

source = '10000000-0000-4000-8000-000000000010'
target = '10000000-0000-4000-8000-000000000009'
a,b = race(f"BEGIN; SET ROLE service_role; SELECT public.test_link('{source}','{target}'); SELECT pg_sleep(.6); COMMIT;", f"SET ROLE service_role; SELECT public.claim_politician_profile('{actor}','{source}')")
expect(a.returncode == 0 and b.returncode != 0 and 'canonical profile' in b.stderr, 'activation that wins the row lock rejects stale source claim', (a,b))

source = '10000000-0000-4000-8000-000000000012'
target = '10000000-0000-4000-8000-000000000011'
a,b = race(f"BEGIN; SET ROLE service_role; SELECT public.test_link('{source}','{target}'); SELECT pg_sleep(.6); COMMIT;", f"SET ROLE service_role; INSERT INTO public.questions(politician_id,body) VALUES('{source}','Concurrent question binds canonical') RETURNING politician_id")
expect(a.returncode == b.returncode == 0 and target in b.stdout, 'new question waiting on activation binds committed canonical root', (a,b))

source = '10000000-0000-4000-8000-000000000014'
target = '10000000-0000-4000-8000-000000000013'
post = '60000000-0000-4000-8000-000000000014'
r = query(f"INSERT INTO public.x_posts(id,politician_id,tweet_id,status) VALUES('{post}','{source}','identity-concurrency-x','approved')")
expect(r.returncode == 0, 'synthetic approved X source created', (r,))
a,b = race(f"BEGIN; SET ROLE service_role; SELECT public.test_link('{source}','{target}'); SELECT pg_sleep(.6); COMMIT;", f"SET ROLE service_role; SELECT public.publish_x_post('{post}','Concurrent approved publication body',202648)")
expect(a.returncode == b.returncode == 0 and target in b.stdout, 'atomic publisher shares identity lock order without deadlock', (a,b))
r = query(f"SELECT q.politician_id='{target}' AND x.politician_id='{source}' FROM public.x_posts x JOIN public.questions q ON q.id=x.whytho_question_id WHERE x.id='{post}'")
expect(r.stdout.strip() == 't', 'concurrent X publication preserves original collection owner', (r,))

politician = '10000000-0000-4000-8000-000000000015'
sql = f"SET ROLE service_role; INSERT INTO public.questions(politician_id,submitted_by) VALUES('{politician}','{actor}')"
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    results = list(pool.map(query, [sql] * 8))
expect(sum(result.returncode == 0 for result in results) == 5,
       'only five of eight concurrent questions for one politician are accepted', results)
expect(all(result.returncode == 0 or 'Question submission limit reached' in result.stderr for result in results),
       'concurrent quota rejects return the expected error', results)
