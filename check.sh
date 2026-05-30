#!/usr/bin/env bash
# check.sh — Nexus OS Frontend Quality Gate
#
# Runs the full verification pipeline:
#   1. ESLint
#   2. Prettier (format check)
#   3. Vite production build
#   4. Vitest (all test files, single run)
#   5. Static function-coverage audit — every exported function in the
#      audited source files must appear in at least one test file.
#
# Exit codes: 0 = all clear, 1 = one or more checks failed.
# Usage: ./check.sh [--no-build]   (skip build step in CI time-sensitive runs)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND="$REPO_ROOT/frontend"

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

banner() { echo -e "\n${CYAN}${BOLD}━━━ $1 ━━━${NC}"; }
ok()     { echo -e "  ${GREEN}✓${NC}  $1"; }
fail()   { echo -e "  ${RED}✗${NC}  $1"; }
warn()   { echo -e "  ${YELLOW}⚠${NC}  $1"; }
info()   { echo -e "  ${CYAN}·${NC}  $1"; }

SKIP_BUILD=false
for arg in "$@"; do [[ "$arg" == "--no-build" ]] && SKIP_BUILD=true; done

ERRORS=0
cd "$FRONTEND"

# ── 1. Lint ───────────────────────────────────────────────────────────────────
banner "LINT"
if npm run lint --silent 2>&1; then
  ok "ESLint clean"
else
  fail "ESLint reported errors (see above)"
  ERRORS=$((ERRORS + 1))
fi

# ── 2. Prettier ───────────────────────────────────────────────────────────────
banner "FORMAT"
if npm run prettier:check --silent 2>&1; then
  ok "Prettier format clean"
else
  fail "Prettier found unformatted files — run: npm run format"
  ERRORS=$((ERRORS + 1))
fi

# ── 4. Build ──────────────────────────────────────────────────────────────────
if [ "$SKIP_BUILD" = false ]; then
  banner "BUILD"
  if npm run build 2>&1 | grep -E "^(✓|vite|dist|error)" | tail -10; then
    ok "Production build succeeded"
  else
    fail "Production build failed (see above)"
    ERRORS=$((ERRORS + 1))
  fi
fi

# ── 5. Tests ──────────────────────────────────────────────────────────────────
banner "TESTS"
TEST_OUTPUT=$(npm run test -- --run 2>&1)
echo "$TEST_OUTPUT" | grep -E "^( ✓| ✗| FAIL| PASS|Tests |Test Files)" | tail -20 || true
if echo "$TEST_OUTPUT" | grep -qE "^(Tests|Test Files).*[0-9]+ failed"; then
  fail "One or more tests failed"
  ERRORS=$((ERRORS + 1))
elif echo "$TEST_OUTPUT" | grep -qE "Tests +[0-9]+ passed"; then
  PASS_COUNT=$(echo "$TEST_OUTPUT" | grep -oE "Tests +[0-9]+ passed" | grep -oE "[0-9]+")
  ok "$PASS_COUNT tests passed"
else
  warn "Could not parse test result — check output above"
fi

# ── 6. Function-coverage audit ────────────────────────────────────────────────
# For each file below every exported *function* (sync or async) must be
# referenced by name in at least one *.test.js(x) file under src/.
# Constants/class exports and re-exports are excluded by design — their
# behaviour is tested indirectly through the functions that use them.
banner "FUNCTION COVERAGE AUDIT"

# Source files to audit (relative to frontend/src/)
AUDIT_FILES=(
  lib/appBadge.js
  lib/apiClient.js
  lib/emailConfig.js
  lib/mediaConfig.js
  lib/opfsDrive.js
  lib/recoveryTokens.js
  lib/registerServiceWorker.js
  lib/scrollLock.js
  os/stores/fileSystemStore.js
  os/stores/notificationStore.js
  os/stores/settingsStore.js
  os/stores/windowStore.js
)

UNCOVERED=()
COVERED_COUNT=0

for rel_path in "${AUDIT_FILES[@]}"; do
  source_file="$FRONTEND/src/$rel_path"

  if [ ! -f "$source_file" ]; then
    warn "Source file not found: src/$rel_path — skipping"
    continue
  fi

  # Extract names from:  export [async] function NAME
  while IFS= read -r fn_name; do
    [[ -z "$fn_name" ]] && continue

    # Search all test files under src/ for the function name as a word boundary
    if grep -qrE "(^|[^A-Za-z0-9_])${fn_name}([^A-Za-z0-9_]|$)" \
         "$FRONTEND/src" \
         --include="*.test.js" \
         --include="*.test.jsx" \
         2>/dev/null; then
      COVERED_COUNT=$((COVERED_COUNT + 1))
    else
      UNCOVERED+=("src/${rel_path}  →  ${fn_name}")
    fi
  done < <(
    grep -E "^export (async )?function [A-Za-z_][A-Za-z0-9_]*" "$source_file" \
      | grep -oE "function [A-Za-z_][A-Za-z0-9_]+" \
      | awk '{print $2}'
  )
done

TOTAL_AUDITED=$((COVERED_COUNT + ${#UNCOVERED[@]}))
info "Audited $TOTAL_AUDITED exported function(s) across ${#AUDIT_FILES[@]} source file(s)"

if [ ${#UNCOVERED[@]} -eq 0 ]; then
  ok "All $COVERED_COUNT audited functions are referenced in tests — zero gaps"
else
  fail "${#UNCOVERED[@]} exported function(s) are not referenced in any test file:"
  for item in "${UNCOVERED[@]}"; do
    echo -e "    ${RED}✗${NC}  $item"
  done
  ERRORS=$((ERRORS + 1))
fi

# ── Summary ───────────────────────────────────────────────────────────────────
banner "SUMMARY"
if [ "$ERRORS" -eq 0 ]; then
  ok "${BOLD}All checks passed${NC}"
  exit 0
else
  fail "${BOLD}$ERRORS check(s) failed — see details above${NC}"
  exit 1
fi
