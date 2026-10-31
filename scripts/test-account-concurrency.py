"""Run concurrent transactions against the synthetic local account test cluster."""
import concurrent.futures
import subprocess
import sys

pg_bin, socket = sys.argv[1:]
base = [f"{pg_bin}/psql", "-X", "-v", "ON_ERROR_STOP=1", "-h", socket, "-p", "55439", "-U", "postgres", "-d", "postgres", "-Atc"]
def query(sql):
    return subprocess.run(base + [sql], text=True, capture_output=True)
def must(sql):
    result = query(sql)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()

pol = "10000000-0000-4000-8000-000000000004"
users = ["00000000-0000-4000-8000-000000000004", "00000000-0000-4000-8000-000000000006"]
must(f"INSERT INTO politicians VALUES('{pol}','Concurrent','concurrent','0',true)")
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    results = list(pool.map(query, [f"BEGIN; SET ROLE service_role; SELECT claim_politician_profile('{user}','{pol}'); SELECT pg_sleep(0.2); COMMIT" for user in users]))
assert sum(result.returncode == 0 for result in results) == 1, [(r.returncode, r.stderr) for r in results]
assert must(f"SELECT count(*) FROM politician_team WHERE politician_id='{pol}' AND role='admin'") == "1"
print("PASS: simultaneous claims produce exactly one administrator")

pol = "10000000-0000-4000-8000-000000000001"
admin = "00000000-0000-4000-8000-000000000001"
second = "00000000-0000-4000-8000-000000000008"
must(f"UPDATE politician_team SET role='admin' WHERE politician_id='{pol}' AND user_id='{second}'")
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    results = list(pool.map(query, [f"BEGIN; SET ROLE service_role; SELECT manage_politician_team('{user}','{pol}','disconnect'); SELECT pg_sleep(0.2); COMMIT" for user in [admin, second]]))
assert sum(result.returncode == 0 for result in results) == 1, [(r.returncode, r.stderr) for r in results]
assert must(f"SELECT count(*) FROM politician_team WHERE politician_id='{pol}' AND role='admin'") == "1"
print("PASS: simultaneous admin disconnects preserve one administrator")

remaining = must(f"SELECT user_id FROM politician_team WHERE politician_id='{pol}' AND role='admin'")
question = "20000000-0000-4000-8000-000000000005"
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    results = list(pool.map(query, [f"BEGIN; SET ROLE service_role; SELECT save_politician_answer('{remaining}','create','{question}',NULL,'Concurrent official answer {n}'); SELECT pg_sleep(0.2); COMMIT" for n in range(2)]))
assert sum(result.returncode == 0 for result in results) == 1, [(r.returncode, r.stderr) for r in results]
assert must(f"SELECT count(*) FROM answers WHERE question_id='{question}' AND is_draft=false") == "1"
print("PASS: simultaneous publication produces one official answer")

# Hold the profile lock through revocation, then start publication while it waits.
# The publisher must reread current membership after the revocation commits.
import time
revoked = "00000000-0000-4000-8000-000000000003"
race_question = "20000000-0000-4000-8000-000000000006"
must(f"INSERT INTO politician_team(politician_id,user_id,role) VALUES('{pol}','{revoked}','editor'); INSERT INTO questions VALUES('{race_question}','{pol}','active',202644)")
member = must(f"SELECT id FROM politician_team WHERE politician_id='{pol}' AND user_id='{revoked}'")
revoke_sql = f"BEGIN; SET LOCAL application_name='account_revoke_race'; SET ROLE service_role; SELECT manage_politician_team('{remaining}','{pol}','remove','{member}'); SELECT pg_sleep(0.8); COMMIT"
revoker = subprocess.Popen(base + [revoke_sql], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
for _ in range(50):
    if must("SELECT count(*) FROM pg_stat_activity WHERE application_name='account_revoke_race' AND wait_event='PgSleep'") == "1":
        break
    time.sleep(0.02)
else:
    raise AssertionError("Revocation transaction did not acquire its profile lock")
publish = query(f"SET ROLE service_role; SELECT save_politician_answer('{revoked}','create','{race_question}',NULL,'Response after revoked access')")
_, revoke_error = revoker.communicate(timeout=5)
assert revoker.returncode == 0, revoke_error
assert publish.returncode != 0 and "Not authorized" in publish.stderr, publish.stderr
assert must(f"SELECT count(*) FROM answers WHERE question_id='{race_question}'") == "0"
print("PASS: publication racing committed membership revocation is denied")
