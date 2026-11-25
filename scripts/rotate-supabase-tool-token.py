"""Run interactively by the account owner. Never prints the credential."""
import getpass
import json
import os
from pathlib import Path
import re
import tomllib
import urllib.request
import urllib.error


def main():
    codex = Path.home() / '.codex/config.toml'
    claude = Path.home() / '.claude/settings.json'
    before = {p: p.read_text() for p in (codex, claude)}
    config = tomllib.loads(before[codex])
    settings = json.loads(before[claude])
    servers = [config['mcp_servers']['supabase'], settings['mcpServers']['supabase']]
    for server in servers:
        args = server.get('args', [])
        if args.count('--access-token') != 1:
            raise RuntimeError('Unexpected token configuration; no files changed.')
        index = args.index('--access-token')
        if index + 1 >= len(args):
            raise RuntimeError('Incomplete token configuration; no files changed.')
    token = getpass.getpass('Paste the NEW Supabase token (input hidden), then press Return: ').strip()
    if not re.fullmatch(r'sbp_[A-Za-z0-9_\-]+', token):
        raise RuntimeError('Unexpected token format; no files changed.')
    req = urllib.request.Request('https://api.supabase.com/v1/projects',
                                 headers={'Authorization': 'Bearer ' + token})
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            projects = json.load(response)
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f'Token check failed (HTTP {exc.code}); no files changed.') from None
    if not isinstance(projects, list) or not any(p.get('id') == 'jjwdxjqsnwieksubkkkf' for p in projects):
        raise RuntimeError('Token could not confirm WhyTho project access; no files changed.')
    for server in servers:
        index = server['args'].index('--access-token')
        server['args'] = server['args'][:index] + server['args'][index + 2:]
        server.setdefault('env', {})['SUPABASE_ACCESS_TOKEN'] = token
    # Replace only the Supabase TOML section, preserving other configuration.
    pattern = r'(?ms)^\[mcp_servers\.supabase\]\s*\n.*?(?=^\[|\Z)'
    match = re.search(pattern, before[codex])
    if not match:
        raise RuntimeError('Supabase section not found; no files changed.')
    section = match.group()
    section, count = re.subn(r'(?m)^args\s*=\s*\[[^\n]*\]',
                             lambda _: 'args = ' + json.dumps(servers[0]['args']), section)
    if count != 1 or '[mcp_servers.supabase.env]' in before[codex]:
        raise RuntimeError('Unexpected multiline or environment configuration; no files changed.')
    section = section.rstrip() + '\n\n[mcp_servers.supabase.env]\nSUPABASE_ACCESS_TOKEN = ' + json.dumps(token) + '\n\n'
    updated = {codex: before[codex][:match.start()] + section + before[codex][match.end():],
               claude: json.dumps(settings, indent=2) + '\n'}
    parsed = tomllib.loads(updated[codex])['mcp_servers']['supabase']
    if parsed['env']['SUPABASE_ACCESS_TOKEN'] != token or '--access-token' in parsed['args']:
        raise RuntimeError('Configuration validation failed; no files changed.')
    for p in updated:
        if p.read_text() != before[p]:
            raise RuntimeError('Configuration changed during setup; no files changed.')
    for p, text in updated.items():
        fd = os.open(p, os.O_WRONLY | os.O_TRUNC)
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, 'w') as stream:
            stream.write(text)
    print('Verified WhyTho access. Updated Codex and Claude with owner-only permissions.')
    print('Token is now supplied through environment configuration, not command arguments.')
    print('Restart/reconnect the Supabase tools, verify access, then revoke the old WhyTho token.')


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        # Do not print arbitrary exception text which could contain credentials.
        if isinstance(exc, RuntimeError):
            print(str(exc))
        else:
            print('Setup did not finish. Error type: ' + type(exc).__name__)
        raise SystemExit(1)
