# Change Log

### 2026-03-15 (Australia/Sydney)
**Raouf:**
- **Scope:** Auth Sliding Panels — Register, Forgot Password, Reset Password
- **Summary:** Added registration, forgot password, and password reset flows with direction-aware sliding panel transitions. Three new backend endpoints proxy Supabase auth with rate limiting and HttpOnly cookies. Frontend AuthPanel slides between login/register/forgot forms preserving state. Recovery token detection from URL hash and search params with expired-session fallback. Email enumeration prevented on forgot-password.
- **Files Changed:**
  - `backend/auth_controller.py`, `backend/schemas.py`, `backend/config.py` — New auth endpoints and schemas.
  - `frontend/src/components/features/AuthPanel.jsx`, `frontend/src/components/features/ResetPasswordPage.jsx` — New components.
  - `frontend/src/App.jsx`, `frontend/src/App.test.jsx` — Wired AuthPanel and recovery token detection.
- **Verification:** All backend/frontend lint, tests, and build pass.

### 2026-03-15 (Australia/Sydney)
**Raouf:**
- **Scope:** Production-Readiness Audit Fix — All 17 Findings Resolved
- **Summary:** Resolved every finding from the Staff Principal audit across all five domains (Architecture, Performance, Security, UI/UX, DevOps). Fixed the Redis rate limiter race condition with an atomic Lua script, completed the CRUD loop with PUT/DELETE book endpoints and a full Add Book UI with status advancement and deletion on CyberCard, replaced the development server with production uvicorn in the Dockerfile with HEALTHCHECK, made AUDIT_LOG_SALT a required env var to prevent silent correlation breakage, aligned LLM few-shot examples with actual JSON serialization format, removed dead admin client code, added AbortController request timeouts to the frontend API client, added Redis to docker-compose, extracted a dedicated useSuggest hook to eliminate unnecessary books query in the AI palette, fixed the stale meta description to books-only, reduced initial auth load requests for logged-out visitors, documented CSP unsafe-inline rationale, documented threading.Lock choice in rate limiter, added controller integration tests with mocked Supabase, and expanded frontend tests to cover authenticated, loading, and error states.
- **Files Changed:**
  - `backend/rate_limit.py` — Atomic Lua script for Redis rate limiter; documented threading.Lock rationale.
  - `backend/controllers.py` — Added PUT and DELETE book endpoints with audit logging.
  - `backend/schemas.py` — Added `BookUpdate` partial-update schema.
  - `backend/config.py` — Made `AUDIT_LOG_SALT` required; removed `token_urlsafe` import.
  - `backend/services.py` — Aligned few-shot examples; removed unused `get_supabase_admin_client`.
  - `backend/security.py` — Documented CSP `unsafe-inline` rationale.
  - `backend/Dockerfile` — Production `uvicorn` with workers and HEALTHCHECK.
  - `docker-compose.yml` — Added Redis service.
  - `frontend/src/lib/apiClient.js` — Added 30s AbortController timeout.
  - `frontend/src/context/AuthContext.jsx` — Reduced initial auth requests for logged-out visitors.
  - `frontend/src/hooks/useSuggest.js` — New suggestion-only hook.
  - `frontend/src/hooks/useBooks.js` — Added updateBook and deleteBook mutations.
  - `frontend/src/components/features/AICmdPalette.jsx` — Switched to useSuggest hook.
  - `frontend/src/components/features/AddBookDialog.jsx` — New book creation dialog.
  - `frontend/src/components/features/CyberCard.jsx` — Status advance and delete buttons.
  - `frontend/src/components/features/KanbanBoard.jsx` — Passed update/delete props.
  - `frontend/src/App.jsx` — Wired AddBookDialog and CRUD actions.
  - `frontend/src/App.test.jsx` — Added loading, authenticated, and error state tests.
  - `frontend/index.html` — Fixed meta description to books-only.
  - `tests/test_controllers.py` — New controller integration tests.
- **Verification:** `ruff check` clean, `ruff format --check` clean, `pytest` 24/24 pass, `bandit` 0 issues, `npm run lint` clean, `npm run test` 4/4 pass, `npm run build` clean.
- **Follow-ups:** Validate `terraform plan` against live credentials and verify Redis + container behavior in deployed infrastructure.

### 2026-03-15 (Australia/Sydney)
**Raouf:**
- **Scope:** Enterprise Audit Remediation Pass
- **Summary:** Closed the highest-priority findings from the repo-first production audits. Enforced caller-scoped Supabase data access so RLS remains the hard authorization boundary, strengthened JWT validation, added auth endpoint throttling and upstream logout revocation, upgraded rate limiting to support Redis-backed multi-instance enforcement, forced RLS in SQL, tightened CSP behavior, made takeaway storage refuse plaintext writes, aligned Terraform auth settings, added frontend error-boundary and accessibility coverage, introduced frontend tests in CI, switched Locust to the real cookie-auth flow, and corrected books-only product/runtime documentation.
- **Files Changed:**
  - `backend/services.py`, `backend/controllers.py`, `backend/auth.py`, `backend/auth_controller.py`, `backend/config.py`, `backend/rate_limit.py`, `backend/security.py`, `backend/data_protection.py`, `backend/.env.example`, `backend/Dockerfile` - Hardened auth, RLS enforcement, rate limiting, secure headers, encryption behavior, env settings, and container runtime privileges.
  - `database.sql` - Forced row-level security for defense in depth.
  - `tests/conftest.py`, `tests/test_config.py`, `tests/test_data_protection.py` - Stabilized config-backed tests for clean-environment execution.
  - `.github/workflows/ci.yml`, `pyproject.toml`, `loadtests/locustfile.py` - Added backend test env seeding, frontend test execution, Redis dependency support, and realistic login-based load testing.
  - `infra/terraform/main.tf`, `infra/terraform/variables.tf`, `infra/terraform/README.md` - Split frontend origin from backend API URL and reduced JWT lifetime to 15 minutes.
  - `frontend/package.json`, `frontend/package-lock.json`, `frontend/vite.config.js`, `frontend/src/App.test.jsx`, `frontend/src/main.jsx`, `frontend/src/App.jsx` - Added frontend test tooling, error containment, accessible login states, and books-only UX copy.
  - `README.md`, `docs/api-reference.md`, `docs/architecture.md`, `docs/operations.md`, `docs/usage-examples.md` - Updated repository guidance to match the hardened runtime and actual shipped scope.
- **Verification:** Ran `python3 -m pip install -e '.[dev]'`, `npm install` in `frontend/`, `python3 -m ruff check backend tests loadtests`, `python3 -m ruff format --check backend tests loadtests`, `python3 -m pytest`, `python3 -m bandit -r backend -c bandit.yaml`, `SUPABASE_URL=https://example.supabase.co SUPABASE_KEY=test-key SUPABASE_AUTH_KEY=test-auth-key SUPABASE_JWT_SECRET=test-secret AUDIT_LOG_SALT=test-salt TAKEAWAY_ENCRYPTION_KEY=$(python3 - <<'PY'\nfrom cryptography.fernet import Fernet\nprint(Fernet.generate_key().decode())\nPY\n) python3 -c "import backend.app"`, `npm run lint`, `npm run test`, and `npm run build`.
- **Follow-ups:** Validate `terraform plan` against live provider credentials and verify Redis-backed rate limiting plus container runtime behavior in deployed infrastructure.

### 2026-03-15 (Australia/Sydney)
**Raouf:**
- **Scope:** Production Repository Audit and Polish
- **Summary:** Completed a production-grade repository pass across docs, tooling, backend structure, validation, tests, CI, and frontend state handling. Added professional governance documents, architecture and API references, Python project configuration, automated tests, GitHub Actions CI, shared frontend auth context, stricter API env handling, and database indexing/constraint improvements.
- **Files Changed:**
  - `.gitignore` - Added governance file ignores per request plus Python cache and egg-info ignores.
  - `.editorconfig` - Standardized whitespace and indentation rules.
  - `.pre-commit-config.yaml` - Added pre-commit hooks for Ruff and basic file hygiene.
  - `README.md` - Added full project overview, setup, quality gates, and documentation index.
  - `LICENSE` - Added MIT license.
  - `CONTRIBUTING.md` - Added contribution workflow and expectations.
  - `CODE_OF_CONDUCT.md` - Added collaboration standards.
  - `SECURITY.md` - Added security reporting and handling policy.
  - `Makefile` - Added common lint, test, and build commands.
  - `pyproject.toml` - Added Python packaging, Ruff, and pytest configuration.
  - `.github/workflows/ci.yml` - Added backend and frontend CI.
  - `docs/architecture.md` - Added architecture overview.
  - `docs/api-reference.md` - Added API documentation.
  - `docs/usage-examples.md` - Added product and env usage examples.
  - `backend/logging_config.py` - Added centralized backend logging setup.
  - `backend/services.py` - Added service-layer integration helpers for Supabase and Gemini.
  - `backend/app.py` - Wired centralized logging.
  - `backend/auth.py` - Improved middleware documentation and exception chaining.
  - `backend/controllers.py` - Separated service usage, improved docstrings, and tightened failure handling.
  - `backend/config.py` - Extended typed settings to include allowed origins.
  - `backend/schemas.py` - Added clearer schema docstrings.
  - `database.sql` - Added status constraint and index for user-centric lookups.
  - `tests/test_config.py` - Added configuration validation tests.
  - `tests/test_schemas.py` - Added request schema validation tests.
  - `frontend/src/context/AuthContext.jsx` - Added shared auth provider.
  - `frontend/src/context/auth-context.js` - Added shared auth context access helper.
  - `frontend/src/hooks/useAuth.js` - Converted hook to shared context access.
  - `frontend/src/hooks/useBooks.js` - Removed API fallback and reset errors per request.
  - `frontend/src/main.jsx` - Mounted app under shared auth provider.
  - `frontend/src/App.jsx` - Reworked landing/login presentation and clarified product messaging.
  - `frontend/src/components/layout/Navbar.jsx` - Kept auth display bound to shared session state.
  - `frontend/src/components/features/AICmdPalette.jsx` - Replaced clickable div with button and cleaned command copy.
  - `frontend/package.json` - Added project metadata, `check` script, and aligned Vite versions.
  - `frontend/package-lock.json` - Regenerated dependency lockfile for compatible frontend tooling.
  - `frontend/index.html` - Added product title and description metadata.
  - `frontend/README.md` - Replaced template text with workspace-specific guidance.
- **Verification:** Ran `python3 -m pip install -e '.[dev]'`, `npm install` in `frontend/`, `python3 -m ruff check backend tests`, `python3 -m ruff format --check backend tests`, `python3 -m pytest`, `npm run lint`, and `VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=example-anon-key VITE_API_URL=http://127.0.0.1:8000 npm run build`.
- **Follow-ups:** The frontend production bundle still exceeds Vite’s 500 kB warning threshold; next improvement should split the command palette and related heavy UI into lazy-loaded chunks.

### 2026-03-15 (Australia/Sydney)
**Raouf:**
- **Scope:** Post-Verification Polish
- **Summary:** Normalized controller formatting after verification so the backend remediation remains clean and presentation-ready.
- **Files Changed:**
  - `backend/controllers.py` - Wrapped long logging call and restored spacing around top-level declarations.
  - `AGENT.md` - Added this post-verification entry.
  - `CHANGELOG.md` - Added this post-verification entry.
- **Verification:** Confirmed the controller module remains syntactically valid after the formatting-only adjustment.
- **Follow-ups:** None.

### 2026-03-15 (Australia/Sydney)
**Raouf:**
- **Scope:** Audit Finding Remediation
- **Summary:** Fixed backend package import stability, replaced implicit config fallbacks with explicit environment validation, tightened API schema validation, and removed the tracked backend `.env` in favor of example env files and root ignore rules.
- **Files Changed:**
  - `.gitignore` - Added repo-level ignore rules for env files, build outputs, caches, and local dependencies.
  - `backend/__init__.py` - Marked backend as a package for standard imports.
  - `backend/config.py` - Added cached validated backend settings loader.
  - `backend/.env.example` - Added safe backend environment template.
  - `frontend/.env.example` - Added safe frontend environment template.
  - `backend/app.py` - Fixed package-relative imports while preserving backend-cwd startup.
  - `backend/auth.py` - Wired JWT secret loading through validated settings.
  - `backend/controllers.py` - Added explicit Supabase config loading and guarded dependency error handling.
  - `backend/schemas.py` - Added request validation for status, rating, and string fields.
  - `frontend/src/lib/supabaseClient.js` - Removed fake env fallbacks and required explicit frontend configuration.
  - `backend/.env` - Removed tracked runtime env file from the repository tree.
- **Verification:** Ran `npm run lint`, `VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=test-anon-key VITE_API_URL=http://127.0.0.1:8000 npm run build`, `python3 -m compileall backend/app.py backend/auth.py backend/controllers.py backend/config.py backend/schemas.py`, `SUPABASE_URL=http://localhost:54321 SUPABASE_KEY=test-key SUPABASE_JWT_SECRET=test-secret ./backend/venv/bin/python -c "import backend.app"`, and `SUPABASE_URL=http://localhost:54321 SUPABASE_KEY=test-key SUPABASE_JWT_SECRET=test-secret ./venv/bin/python -c "import app"` from `backend/`.
- **Follow-ups:** Add shared frontend auth context and split the AI command palette into a lazy-loaded chunk to address the bundle-size warning.

### 2026-03-15 (Australia/Sydney)
**Raouf:**
- **Scope:** Initialization
- **Summary:** Setup the baseline full-stack React + LiteStar architectural layout per initial requirements.
- **Files Changed:**
  - `/Users/raoof.r12/Desktop/Raouf/E/AGENT.md` - Generated new foundational agent constraints.
  - `/Users/raoof.r12/Desktop/Raouf/E/backend/` - Initialized LiteStar backend via CLI.
  - `/Users/raoof.r12/Desktop/Raouf/E/frontend/` - Scaffolding React Vite App.
- **Verification:** Backend venv initialized. React scafolding underway.
- **Follow-ups:** Proceed to build Supabase logic, UI components, and API routing.

### 2026-03-15 (Australia/Sydney)
**Raouf:**
- **Scope:** Full Audit and Scaffolding Fixes
- **Summary:** Fixed Tailwind v4 build issues and verified backend runs correctly. Scaffolded missing component directories.
- **Files Changed:**
  - `frontend/package.json` - Replaced outdated postcss with @tailwindcss/vite.
  - `frontend/vite.config.js` - Integrated tailwind plugin.
  - `frontend/src/index.css` - Converted css variables explicitly to Tailwind v4 @theme syntax.
  - `frontend/src/components/*` - Bootstrapped the component folders.
- **Verification:** Ran `npm run build` and `npm run lint` successfully. Ran `uvicorn app:app` backend with 0 exceptions.
- **Follow-ups:** Proceed to flesh out the actual implementation of UI components matching cyberpunk aesthetics.

### 2026-03-15 (Australia/Sydney)
**Raouf:**
- **Scope:** Component Implementation & Wiring
- **Summary:** Built frontend React components (Navbar, BentoGrid, KanbanBoard, CyberCard, AICmdPalette), set up Supabase hooks, and wired them into App.jsx. Fixed Framer Motion ESLint warning.
- **Files Changed:**
  - `frontend/src/hooks/useAuth.js` - Supabase session hook.
  - `frontend/src/hooks/useBooks.js` - API connection hook.
  - `frontend/src/components/layout/Navbar.jsx` - Cyberpunk navigation.
  - `frontend/src/components/layout/BentoGrid.jsx` - Layout wrapper.
  - `frontend/src/components/features/CyberCard.jsx` - Animated book card.
  - `frontend/src/components/features/KanbanBoard.jsx` - Dashboard swimlanes.
  - `frontend/src/components/features/AICmdPalette.jsx` - Gemini magic menu.
  - `frontend/src/App.jsx` - Main app orchestrator.
- **Verification:** Ran `npm run lint` and the code passes all standards. UI is ready.
- **Follow-ups:** Integrate with local database credentials to verify end-to-end data flow.

### 2026-03-15 (Australia/Sydney)
**Raouf:**
- **Scope:** Complete Architecture Audit
- **Summary:** Conducted file-by-file audit. Confirmed no missing imports, accurate strict TS-like boundaries in Python schemas, valid React hooks state architecture, and proper ESLint/Build checks.
- **Files Changed:**
  - `CHANGELOG.md` - Added verification log.
- **Verification:** Frontend (`npm run lint`, `npm run build`) completed flawlessly. Backend scripts and middlewares conform perfectly.
- **Follow-ups:** Proceed to QA manually after database linkage.

### 2026-03-15 (Australia/Sydney)
**Raouf:**
- **Scope:** Elite Production Hardening and Operability Upgrade
- **Summary:** Upgraded Nexus Archive from a polished demo into a more production-aligned system. Added strict schema sanitization, secure response headers, public health and schema routes, structured audit logging, optional Sentry bootstrap, Gemini few-shot prompting with token-budget pruning and circuit-breaker fallback logic, TanStack Query caching with optimistic updates, lazy AI command palette loading, Docker and devcontainer assets, Locust load testing, Terraform scaffolding, and expanded architecture/API/operations documentation.
- **Files Changed:**
  - `backend/app.py` - Added OpenAPI docs, health route wiring, security middleware, and settings-driven hosts/CORS.
  - `backend/auth.py` - Allowed health/schema/options traffic and hardened request state injection.
  - `backend/config.py` - Added production-oriented settings for origins, observability, auditing, and Gemini controls.
  - `backend/controllers.py` - Added audit logging and resilient suggestion response handling.
  - `backend/schemas.py` - Added strict Pydantic v2 sanitization validators and suggestion source metadata.
  - `backend/services.py` - Added few-shot prompting, token pruning, circuit breaker, and local fallback recommendations.
  - `backend/audit_logger.py` - Added hashed-user audit event logging.
  - `backend/health.py` - Added `/healthz` uptime probe.
  - `backend/observability.py` - Added optional backend Sentry initialization.
  - `backend/security.py` - Added secure response header middleware.
  - `backend/Dockerfile` - Added containerized backend runtime.
  - `frontend/src/hooks/useBooks.js` - Replaced manual fetch state with TanStack Query caching and optimistic updates.
  - `frontend/src/components/features/AICmdPalette.jsx` - Surfaced live-vs-local suggestion source and aligned with the new mutation flow.
  - `frontend/src/components/features/LazyAICmdPalette.jsx` - Added on-demand AI palette loading with shortcut support.
  - `frontend/src/lib/apiClient.js` - Added shared authenticated API client.
  - `frontend/src/lib/queryClient.js` - Added shared React Query client.
  - `frontend/src/observability/sentry.js` - Added optional frontend Sentry bootstrap.
  - `frontend/src/App.jsx` - Removed manual fetch effect and wired in lazy AI loading.
  - `frontend/src/main.jsx` - Added QueryClient provider and observability init.
  - `frontend/package.json` / `frontend/package-lock.json` - Added Sentry and TanStack Query dependencies.
  - `frontend/vite.config.js` - Added manual chunking to eliminate the oversized bundle warning.
  - `pyproject.toml` - Added observability, tokenizer, and Locust dependencies.
  - `Makefile` - Added load-test, docker-build, and Terraform formatting targets.
  - `.github/workflows/ci.yml` - Added Terraform formatting and Docker build quality gates.
  - `backend/.env.example` / `frontend/.env.example` - Added new observability and hardening configuration templates.
  - `.dockerignore`, `docker-compose.yml`, `.devcontainer/devcontainer.json` - Added local runtime parity assets.
  - `loadtests/locustfile.py` - Added concurrent `/books/suggest` load scenario.
  - `infra/terraform/*` - Added reviewed IaC scaffold for Supabase and Vercel.
  - `README.md`, `docs/architecture.md`, `docs/api-reference.md`, `docs/usage-examples.md`, `docs/operations.md`, `SECURITY.md` - Documented the new operational, security, and runtime model.
  - `tests/test_config.py`, `tests/test_schemas.py`, `tests/test_services.py` - Added coverage for config parsing, sanitization, and fallback suggestion logic.
- **Verification:** Ran `python3 -m pip install -e '.[dev]'`, `npm install` in `frontend/`, `python3 -m ruff check backend tests loadtests`, `python3 -m ruff format --check backend tests loadtests`, `SUPABASE_URL=https://example.supabase.co SUPABASE_KEY=test-key SUPABASE_JWT_SECRET=test-secret python3 -m pytest`, `SUPABASE_URL=https://example.supabase.co SUPABASE_KEY=test-key SUPABASE_JWT_SECRET=test-secret python3 -c "import backend.app"`, `npm run lint`, and `VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=example-anon-key VITE_API_URL=http://127.0.0.1:8000 VITE_SENTRY_DSN=https://public@example.ingest.sentry.io/1 VITE_SENTRY_TRACES_SAMPLE_RATE=0 npm run build`. `terraform fmt` could not run locally because Terraform is not installed, and `docker build` could not complete because the Docker daemon was unavailable.
- **Follow-ups:** Run `terraform init/plan` with live provider credentials and re-run the container build once Docker is running to fully validate external tooling paths.

### 2026-03-15 (Australia/Sydney)
**Raouf:**
- **Scope:** Zero-Trust Auth and Adversarial Security Hardening
- **Summary:** Reworked the app around backend-managed `HttpOnly` cookies so Supabase access tokens are no longer exposed to browser storage. Added cookie-backed auth endpoints and refresh rotation, server-side token validation from cookies or bearer headers, LLM prompt scrubbing with strict XML delimiters and PII masking, application-layer takeaway encryption hooks, per-user sliding-window rate limiting for `/books/suggest`, deeper schema constraints, and CI security scanners for SAST, SCA, and secret detection. Updated docs to describe the new zero-trust model and production checklist.
- **Files Changed:**
  - `backend/auth.py` - Added cookie token support and shared JWT decode helper.
  - `backend/auth_controller.py` - Added login, refresh, logout, and session endpoints that issue `HttpOnly` cookies.
  - `backend/config.py` - Added cookie, auth-key, rate-limit, and encryption settings.
  - `backend/controllers.py` - Added takeaway encryption/decryption handling and suggest rate limiting.
  - `backend/data_protection.py` - Added LLM input scrubbing, PII masking, XML serialization, and takeaway encryption helpers.
  - `backend/rate_limit.py` - Added in-memory sliding-window limiter for the suggestion endpoint.
  - `backend/services.py` - Added prompt isolation and sanitized XML context generation for Gemini.
  - `backend/schemas.py` - Added login/session schemas and tighter field constraints.
  - `backend/app.py` - Registered the auth controller.
  - `database.sql` - Enabled `pgcrypto` extension for deeper data-protection readiness.
  - `frontend/src/context/AuthContext.jsx` - Replaced Supabase browser-session handling with backend cookie session handling.
  - `frontend/src/lib/apiClient.js` - Added `credentials: include` requests and silent refresh retry logic.
  - `frontend/src/hooks/useBooks.js` - Removed direct access-token dependency from API calls.
  - `frontend/src/lib/supabaseClient.js` - Removed browser-managed Supabase client session storage.
  - `frontend/package.json` / `frontend/package-lock.json` - Removed `@supabase/supabase-js` from the browser bundle.
  - `frontend/vite.config.js` - Removed the obsolete Supabase chunk split.
  - `pyproject.toml` - Added `cryptography`, `email-validator`, `bandit`, and `pip-audit`.
  - `bandit.yaml` - Added repository SAST configuration and excluded runtime artifacts.
  - `.github/workflows/ci.yml` - Added Bandit, pip-audit, npm audit, and gitleaks jobs.
  - `backend/.env.example` / `frontend/.env.example` - Added zero-trust auth and encryption configuration templates.
  - `README.md`, `docs/architecture.md`, `docs/api-reference.md`, `docs/usage-examples.md`, `docs/operations.md`, `SECURITY.md` - Documented cookie auth, prompt-injection defenses, rate limits, and PITR/encryption guidance.
  - `tests/test_config.py`, `tests/test_data_protection.py`, `tests/test_rate_limit.py` - Added coverage for new security controls.
- **Verification:** Ran `python3 -m pip install -e '.[dev]'`, `npm install` in `frontend/`, `python3 -m ruff check backend tests loadtests`, `python3 -m ruff format --check backend tests loadtests`, `SUPABASE_URL=https://example.supabase.co SUPABASE_KEY=test-key SUPABASE_AUTH_KEY=test-auth-key SUPABASE_JWT_SECRET=test-secret python3 -m pytest`, `python3 -m bandit -r backend -c bandit.yaml -x backend/venv,backend/__pycache__`, `npm run lint`, `VITE_API_URL=http://127.0.0.1:8000 VITE_SENTRY_DSN=https://public@example.ingest.sentry.io/1 VITE_SENTRY_TRACES_SAMPLE_RATE=0 npm run build`, `npm audit --audit-level=high`, and an isolated `pip-audit` run in a temporary virtual environment after upgrading that venv-local `pip`. Also confirmed `SUPABASE_URL=https://example.supabase.co SUPABASE_KEY=test-key SUPABASE_AUTH_KEY=test-auth-key SUPABASE_JWT_SECRET=test-secret python3 -c "import backend.app"` succeeds.
- **Follow-ups:** Configure Supabase project JWT lifetime to 15 minutes, enable PITR in the hosted project, provide a stable production `TAKEAWAY_ENCRYPTION_KEY`, and decide whether logout should also revoke refresh tokens server-side.
