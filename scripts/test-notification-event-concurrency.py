"""Concurrent inserts in the retained synthetic notification cluster only."""
import concurrent.futures
import subprocess
import sys

pg_bin, socket_dir = sys.argv[1:]
base = [f"{pg_bin}/psql", "-X", "-v", "ON_ERROR_STOP=1", "-h", socket_dir,
        "-p", "55449", "-U", "postgres", "-d", "postgres", "-At", "-c"]
statement = """INSERT INTO public.questions(id,politician_id,submitted_by)
VALUES('20000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001')
ON CONFLICT(id) DO NOTHING;"""
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
    results = list(executor.map(lambda _: subprocess.run(base + [statement], capture_output=True, text=True), range(4)))
for result in results:
    assert result.returncode == 0, result.stderr
result = subprocess.run(base + ["SELECT count(*) FROM public.question_notification_events WHERE question_id='20000000-0000-4000-8000-000000000099'"], capture_output=True, text=True, check=True)
assert result.stdout.strip() == "1", result.stdout
print("PASS: four simultaneous duplicate publication attempts retain exactly one event")
