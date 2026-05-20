#!/bin/bash
# Nexus OS Quality Gate
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

function log() {
    echo -e "${BLUE}[GATE]${NC} $1"
}

function error() {
    echo -e "${RED}[FAIL]${NC} $1"
    exit 1
}

log "Starting quality gate sequence..."

# Gate 1: Node Version
log "Checking Node version..."
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    error "Node version 20+ required (found v$NODE_VERSION)"
fi

# Gate 2: Dependencies
log "Checking dependencies..."
if [ ! -d "frontend/node_modules" ]; then
    log "Installing frontend dependencies..."
    (cd frontend && npm install)
fi

# Gate 3: Syntax Check
log "Checking syntax..."
# JS syntax check (only .js files, as JSX needs transformation)
find frontend/src -name "*.js" | xargs -I {} node --check {}
# Python syntax check
python3 -m py_compile backend/*.py tests/*.py

# Gate 4: Format (Prettier + Ruff)
log "Checking formatting..."
npm run prettier:check
python3 -m ruff format --check backend tests loadtests

# Gate 5: Lint
log "Running linters..."
(cd frontend && npm run lint)
python3 -m ruff check backend tests loadtests

# Gate 6: Security Audit
log "Running security audits..."
(cd frontend && npm audit --audit-level=high)
python3 -m bandit -r backend -c bandit.yaml
# PYSEC-2025-183: PyJWT 2.12.1 — no patched release exists at time of writing.
# Suppressed with --ignore-vuln; review and remove once a fix is published.
python3 -m pip_audit . --ignore-vuln PYSEC-2025-183

# Gate 7: Tests
log "Running test suites..."
make test

# Gate 8: Secret Scan (Basic)
log "Scanning for secrets..."
# Simple regex to catch common patterns that shouldn't be committed
if grep -rE "AIza[0-9A-Za-z_-]{35}|sk_live_[0-9a-zA-Z]{24}" . --exclude-dir={node_modules,.git,.pytest_cache,dist}; then
    error "Potential secrets detected in codebase!"
fi

log "Quality gates passed successfully! ${GREEN}✔${NC}"
