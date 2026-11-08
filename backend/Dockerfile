# Backend API image. Build from the repository root:
#   docker build -f backend/Dockerfile -t nexus-os-backend .
#
# Base image is pinned to a tag. Pin a digest once one is resolved with
# `docker buildx imagetools inspect python:3.12.11-slim` and bump it on a
# schedule and record each digest change in CHANGELOG.md.
FROM python:3.12.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Packaging inputs only. LICENSE is required because pyproject.toml declares
# it through project.license-files; setuptools fails the build without it.
COPY pyproject.toml README.md LICENSE ./
# Copy only the package's Python modules. A directory copy would also bring in
# backend/.env.local (loaded by config.py in development), a host backend/venv
# and __pycache__. A new subpackage must be copied here and listed in
# [tool.setuptools] packages in pyproject.toml.
COPY backend/*.py ./backend/

RUN pip install --upgrade pip && \
    pip install .

# Application code stays root-owned and read-only to the runtime user.
# Runtime writes would land in the container's writable layer and vanish on
# recreate, so the app is not expected to write under /app.
RUN useradd --uid 10001 --create-home --shell /usr/sbin/nologin appuser
USER 10001

EXPOSE 8000

# Probe /healthz on loopback with the Host set to the first ALLOWED_ORIGINS
# hostname. config.py adds 'localhost' to the Host allowlist only in development,
# so a fixed 'localhost' Host returns 400 in production. Every origin's hostname
# is in the allowlist in every environment (config._derive_allowed_hosts).
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD ["python", "-c", "import os,sys,urllib.parse as p,urllib.request as u; o=(os.environ.get('ALLOWED_ORIGINS') or 'http://localhost:5173').split(',')[0].strip(); h=p.urlparse(o).hostname or 'localhost'; r=u.Request('http://127.0.0.1:'+os.environ.get('PORT','8000')+'/healthz', headers={'Host': h}); sys.exit(0 if u.urlopen(r, timeout=4).status==200 else 1)"]

# Single worker by design: the email poller starts in each worker process
# (backend/app.py on_startup) and the rate limiter is in-memory per process,
# so WEB_CONCURRENCY>1 would duplicate polling and weaken rate limits. The
# guard refuses to boot instead of silently running duplicate pollers.
#
# exec makes uvicorn PID 1 so `docker stop` SIGTERM reaches it. The graceful
# drain (8s) fits inside Docker's default 10s stop grace period; SIGKILL
# follows after that. A container that runs several replicas also runs several
# pollers; scale out only after the poller gets a single-leader gate.
#
# --no-access-log: uvicorn's access log writes the full request target, so the
# OAuth callback's code and state query parameters would land in container logs.
# The app logs request paths at most (never query strings), and uvicorn still
# logs startup, shutdown and errors. Re-enable only with a filter
# that redacts code and state.
CMD ["sh", "-c", "if [ \"${WEB_CONCURRENCY:-1}\" != \"1\" ]; then echo 'WEB_CONCURRENCY must be 1: the email poller and in-memory rate limiter are per process' >&2; exit 1; fi; exec uvicorn backend.app:app --host 0.0.0.0 --port \"${PORT:-8000}\" --workers 1 --timeout-keep-alive 30 --timeout-graceful-shutdown 8 --no-access-log"]
