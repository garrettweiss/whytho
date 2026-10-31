"""Exercise real PostgreSQL counters and quota triggers using synthetic local rows."""
import concurrent.futures
import subprocess
import sys
pg_bin, socket_dir = sys.argv[1:]
base = [pg_bin + '/psql', '-X', '-At', '-h', socket_dir, '-p', '55441', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
def query(sql):
    return subprocess.run(base + ['-c', sql], capture_output=True, text=True)
def expect(value, label):
    if not value: raise RuntimeError(label)
    print('PASS: ' + label)
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
    results = list(pool.map(query, ["SET ROLE service_role; SELECT public.consume_security_rate_limit('concurrent:security',3,300)"] * 10))
expect(all(item.returncode == 0 for item in results), 'concurrent quota requests complete')
expect(sum(item.stdout.strip().endswith('t') for item in results) == 3, 'only three of ten concurrent shared-counter requests accepted')
setup = query("INSERT INTO auth.users(id,email) VALUES ('00000000-0000-4000-8000-000000000004','concurrency@example.test')")
expect(setup.returncode == 0, 'local concurrency actor created')
sql = "SET ROLE service_role; INSERT INTO public.questions(politician_id,submitted_by,week_number) VALUES('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000004',public.current_week_number())"
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    results = list(pool.map(query, [sql] * 8))
expect(sum(item.returncode == 0 for item in results) == 3, 'only three of eight concurrent questions for a profile accepted')
expect(all(item.returncode == 0 or 'Question submission limit reached' in item.stderr for item in results), 'quota rejects fail with the expected boundary')
