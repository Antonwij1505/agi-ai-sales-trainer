#!/usr/bin/env bash
# =============================================================================
# security-audit.sh — Stage 12 hardening checks.
#
# Verifies the two promises that matter most and are easy to break silently:
#   1. no provider secret is reachable from the Android client
#   2. no secret is committed to git
#
# Run from the repo root:  bash backend/scripts/security-audit.sh
# =============================================================================
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

FAIL=0
pass() { echo "  PASS  $1"; }
fail() { echo "  FAIL  $1"; FAIL=1; }

echo "=============================================================="
echo "1. Git must not track secrets"
echo "=============================================================="

tracked_env=$(git ls-files | grep -E '(^|/)\.env$' || true)
if [ -z "$tracked_env" ]; then
  pass "no .env file is tracked"
else
  fail ".env is tracked: $tracked_env"
fi

tracked_keys=$(git ls-files | grep -iE '\.(jks|keystore)$' || true)
if [ -z "$tracked_keys" ]; then
  pass "no keystore is tracked"
else
  fail "keystore tracked: $tracked_keys"
fi

# Scan the working tree for live-looking credentials in tracked files.
echo
echo "=============================================================="
echo "2. No live credential patterns in tracked source"
echo "=============================================================="

# Real key shapes, not the words 'api_key' (which appear in config field names).
hits=$(git ls-files -z \
  | xargs -0 grep -nIE '(sk-[A-Za-z0-9]{24,}|gsk_[A-Za-z0-9]{24,}|gho_[A-Za-z0-9]{30,}|ghp_[A-Za-z0-9]{30,})' \
  2>/dev/null \
  | grep -vE '\.env\.example|README|security-audit\.sh' || true)

if [ -z "$hits" ]; then
  pass "no live-looking API key in tracked files"
else
  echo "$hits" | head -10
  fail "possible credential committed (see above)"
fi

echo
echo "=============================================================="
echo "3. Android APK must contain no provider secret (PRD §78)"
echo "=============================================================="

APK="$REPO_ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
if [ ! -f "$APK" ]; then
  echo "  SKIP  APK not built (run: cd android && gradle assembleDebug)"
else
  TMP=$(mktemp -d)
  unzip -q -o "$APK" 'classes*.dex' -d "$TMP" 2>/dev/null || true

  keyhits=$(strings "$TMP"/classes*.dex 2>/dev/null \
    | grep -cE 'sk-[A-Za-z0-9]{20,}|gsk_[A-Za-z0-9]{20,}' || true)
  if [ "${keyhits:-0}" -eq 0 ]; then
    pass "no API key pattern in the APK"
  else
    fail "$keyhits API key pattern(s) found in the APK"
  fi

  # The app must not even know the provider hosts — all AI traffic is proxied.
  hosthits=$(strings "$TMP"/classes*.dex 2>/dev/null \
    | grep -icE '9router|api\.groq\.com|api\.deepseek\.com|api\.openai\.com' || true)
  if [ "${hosthits:-0}" -eq 0 ]; then
    pass "no AI provider host referenced in the APK"
  else
    fail "$hosthits provider host(s) referenced in the APK"
  fi

  rm -rf "$TMP"
fi

echo
echo "=============================================================="
echo "4. Server config sanity"
echo "=============================================================="

# JWT_SECRET must match the analytics service, or one login cannot work on both.
if [ -f "$REPO_ROOT/backend/.env" ]; then
  jwt_len=$(grep -E '^JWT_SECRET=' "$REPO_ROOT/backend/.env" | cut -d= -f2- | tr -d '\n' | wc -c)
  if [ "$jwt_len" -ge 32 ]; then
    pass "JWT_SECRET length ${jwt_len} (>= 32)"
  else
    fail "JWT_SECRET is only ${jwt_len} chars"
  fi
else
  echo "  SKIP  backend/.env not present"
fi

# The callback URL is deployment config; empty is the safe default (results queue).
if [ -f "$REPO_ROOT/backend/.env" ]; then
  cb=$(grep -E '^ANALYTICS_CALLBACK_URL=' "$REPO_ROOT/backend/.env" | cut -d= -f2- || true)
  if [ -z "$cb" ]; then
    echo "  INFO  ANALYTICS_CALLBACK_URL empty — results accumulate in the outbox"
  else
    echo "  INFO  ANALYTICS_CALLBACK_URL set to $cb"
  fi
fi

echo
echo "=============================================================="
if [ "$FAIL" -eq 0 ]; then
  echo "AUDIT PASSED"
  exit 0
else
  echo "AUDIT FAILED"
  exit 1
fi
