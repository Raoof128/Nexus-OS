#!/usr/bin/env bash
# Run from a private release directory on the Nexus host. Stages a new database
# and an API on loopback port 18000 without touching the serving deployment.
set -euo pipefail
umask 077
[[ -s mailer-secrets.json && -s /opt/nexus/.env.production ]]
if docker inspect nexus-standalone-db >/dev/null 2>&1; then
    printf '%s\n' 'The standalone database already exists. Inspect it before proceeding.' >&2
    exit 1
fi
python3 - <<'PY'
import json
import secrets
from pathlib import Path

base = Path.cwd()
passwords = {name: secrets.token_hex(24) for name in ('postgres', 'nexus_auth', 'nexus_api', 'nexus_mail')}
key = json.loads((base / 'mailer-secrets.json').read_text())['NEXUS_ACCOUNT_MAIL_KEY']

def dsn(role):
    return f"postgresql://{role}:{passwords[role]}@nexus-standalone-db:5432/nexus"

def write(filename, values):
    (base / filename).write_text(''.join(f'{key}={value}\n' for key, value in values.items()))

write('db.env', {'POSTGRES_DB': 'nexus', 'POSTGRES_PASSWORD': passwords['postgres']})
write('auth.env', {
    'NEXUS_AUTH_INTERNAL_ORIGIN': 'http://nexus-standalone-auth:3000',
    'NEXUS_PUBLIC_ORIGIN': 'https://home-notes-app.uk',
    'NEXUS_AUTH_DATABASE_URL': dsn('nexus_auth'),
    'BETTER_AUTH_SECRET': secrets.token_hex(32),
    'NEXUS_ACCOUNT_MAIL_URL': 'https://nexus-account-mail.raoof-r12.workers.dev/send',
    'NEXUS_ACCOUNT_MAIL_KEY': key,
})
original = Path('/opt/nexus/.env.production').read_text().splitlines()
(base / 'api.env').write_text('\n'.join(
    line for line in original if not line.startswith(('SUPABASE_', 'NEXUS_'))
) + '\n')
with (base / 'api.env').open('a') as output:
    output.write(f'NEXUS_DATABASE_URL={dsn("nexus_api")}\n')
    output.write(f'NEXUS_MAIL_DATABASE_URL={dsn("nexus_mail")}\n')
    output.write('NEXUS_AUTH_URL=http://nexus-standalone-auth:3000\n')
(base / 'role-secrets.sql').write_text(
    'CREATE ROLE authenticated NOLOGIN;\nCREATE ROLE anon NOLOGIN;\n' +
    ''.join(f"CREATE ROLE {role} LOGIN PASSWORD '{passwords[role]}';\n"
            for role in ('nexus_auth', 'nexus_api', 'nexus_mail')) +
    'GRANT authenticated TO nexus_api;\n'
)
PY

docker build -q -t nexus-standalone-auth:release ops/nexus-auth
docker build -q -f backend/Dockerfile -t nexus-standalone-api:release .

docker network inspect nexus-standalone >/dev/null 2>&1 || docker network create nexus-standalone >/dev/null
docker volume create nexus-standalone-pgdata >/dev/null
docker run -d --name nexus-standalone-db --network nexus-standalone \
    --restart unless-stopped --memory 320m --shm-size 128m --env-file db.env \
    --mount source=nexus-standalone-pgdata,target=/var/lib/postgresql/data \
    postgres:17.12-bookworm@sha256:40865bc877a289da75963d97d72b59633f639fc5af7a4e856bfa3714cae5b536 \
    -c shared_buffers=48MB -c max_connections=28 >/dev/null
pg() { docker exec -i nexus-standalone-db psql -X -q -v ON_ERROR_STOP=1 -U postgres -d nexus "$@"; }
for _ in {1..30}; do
    if docker exec nexus-standalone-db pg_isready -h 127.0.0.1 -U postgres -d nexus >/dev/null 2>&1; then break; fi
    sleep 1
done
pg < role-secrets.sql
pg < ops/nexus-auth/roles.sql

docker run --rm --network nexus-standalone --env-file auth.env nexus-standalone-auth:release node auth.mjs --migrate
for migration in supabase/migrations/*.sql; do pg < "$migration"; done
pg < ops/nexus-auth/grants.sql

docker run -d --name nexus-standalone-auth --network nexus-standalone \
    --restart unless-stopped --memory 288m --env-file auth.env nexus-standalone-auth:release >/dev/null
docker run -d --name nexus-standalone-stage --network nexus-standalone \
    --publish 127.0.0.1:18000:8000 --memory 224m --env-file api.env nexus-standalone-api:release >/dev/null
for _ in {1..30}; do
    if curl --fail --silent --max-time 2 -H 'Host: home-notes-app.uk' http://127.0.0.1:18000/healthz; then exit 0; fi
    sleep 1
done
printf '%s\n' 'The standalone stage failed its health check.' >&2
exit 1
