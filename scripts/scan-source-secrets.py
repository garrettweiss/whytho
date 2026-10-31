"""Scan repository source without printing secret values or reading ignored env files."""
import base64
import datetime
import json
import pathlib
import re
import subprocess
paths = subprocess.check_output(['git','ls-files','-co','--exclude-standard','-z']).decode().split('\0')
patterns = {
    'private_key': re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    'anthropic_secret': re.compile(r'sk-ant-[A-Za-z0-9_-]{30,}'),
    'openai_secret': re.compile(r'sk-proj-[A-Za-z0-9_-]{30,}'),
    'aws_access_key': re.compile(r'AKIA[A-Z0-9]{16}'),
    'resend_secret': re.compile(r'\bre_[A-Za-z0-9]{30,}\b'),
}
findings=[]
scanned=0
for item in paths:
    path=pathlib.Path(item)
    if not item or not path.is_file() or path.stat().st_size>2_000_000 or path.suffix.lower() not in {'.ts','.tsx','.js','.mjs','.py','.sql','.json','.md','.yml','.yaml','.sh'}: continue
    text=path.read_text(errors='replace');scanned+=1
    for number,line in enumerate(text.splitlines(),1):
        for kind,pattern in patterns.items():
            if pattern.search(line): findings.append({'file':item,'line':number,'kind':kind})
        for token in re.findall(r'eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+',line):
            try:
                claims=json.loads(base64.urlsafe_b64decode(token+'='*((4-len(token)%4)%4)))
                if claims.get('role')=='service_role': findings.append({'file':item,'line':number,'kind':'supabase_service_role'})
            except (ValueError,UnicodeDecodeError): pass
result={'checked_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'tracked and non-ignored current source; not git history or ignored environment files','files_scanned':scanned,'findings':findings}
pathlib.Path('docs/launch/evidence/source-secret-scan.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'files_scanned':scanned,'possible_secret_locations':findings}))
