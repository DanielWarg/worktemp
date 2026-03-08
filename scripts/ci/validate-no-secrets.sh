#!/usr/bin/env bash

set -euo pipefail

failures=0

report_failure() {
  local message="$1"
  echo "$message"
  failures=1
}

echo "Checking for forbidden tracked files..."
forbidden_files="$(
  git ls-files | rg \
    '(^|/)\.env$|(^|/)\.env\.(local|development|test|production)(\.local)?$|(^|/)\.envrc$|(^|/)id_(rsa|ed25519)$|\.pem$|\.p12$|\.pfx$|(^|/)\.npmrc$|(^|/)\.netrc$' \
    || true
)"
if [[ -n "$forbidden_files" ]]; then
  report_failure "Forbidden files are tracked in git:"
  echo "$forbidden_files"
fi

echo "Checking for common secret patterns..."
secret_hits="$(git grep -nI -E 'gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|sk_(live|test)_[A-Za-z0-9]{16,}|BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY' -- . || true)"
if [[ -n "$secret_hits" ]]; then
  report_failure "Potential secrets were detected in tracked files:"
  echo "$secret_hits"
fi

echo "Checking for browser-exposed env names that look sensitive..."
public_secret_env_hits="$(rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' 'NEXT_PUBLIC_[A-Z0-9_]*(SECRET|TOKEN|PASSWORD|PRIVATE|ACCESS_KEY|SECRET_KEY)' . || true)"
if [[ -n "$public_secret_env_hits" ]]; then
  report_failure "Sensitive-looking NEXT_PUBLIC_ variables were detected:"
  echo "$public_secret_env_hits"
fi

echo "Checking client components for non-public env access..."
while IFS= read -r file; do
  [[ -z "$file" ]] && continue

  client_env_hits="$(rg -n -P 'process\.env\.(?!NEXT_PUBLIC_)' "$file" || true)"
  if [[ -n "$client_env_hits" ]]; then
    report_failure "Client component uses non-public process.env access:"
    echo "$client_env_hits"
  fi
done < <(rg -l --hidden --glob '!node_modules/**' --glob '!.git/**' '^[\"'\'']use client[\"'\''];?$' . || true)

if [[ "$failures" -ne 0 ]]; then
  echo "Secret guardrails failed."
  exit 1
fi

echo "Secret guardrails passed."
