# Disposable Linux rehearsal. Keep this image free of production configuration.
FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS auth-deps
WORKDIR /auth-deps
COPY scripts/nexus_migration/rehearsal/package.json scripts/nexus_migration/rehearsal/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

FROM python:3.12.11-slim-bookworm@sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7 AS python-deps
WORKDIR /deps
COPY pyproject.toml README.md LICENSE ./
COPY backend/*.py ./backend/
RUN python -m pip install --no-cache-dir . "psycopg[binary,pool]~=3.3.9"

FROM postgres:17.12-bookworm@sha256:40865bc877a289da75963d97d72b59633f639fc5af7a4e856bfa3714cae5b536
WORKDIR /nexus
COPY --from=python-deps /usr/local/ /usr/local/
COPY --from=auth-deps /usr/local/bin/node /usr/local/bin/node
COPY --from=auth-deps /auth-deps/node_modules/ ./scripts/nexus_migration/rehearsal/node_modules/
COPY scripts/nexus_migration/*.py ./scripts/nexus_migration/
COPY scripts/nexus_migration/rehearsal/*.py scripts/nexus_migration/rehearsal/auth.mjs ./scripts/nexus_migration/rehearsal/
COPY supabase/migrations/*.sql ./supabase/migrations/
RUN python -c "import httpx, litestar, psycopg" && node --version
USER postgres
ENTRYPOINT ["/usr/local/bin/python", "-m", "scripts.nexus_migration.rehearsal"]
CMD ["--pg-bin", "/usr/lib/postgresql/17/bin"]
