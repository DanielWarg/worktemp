#!/usr/bin/env bash

set -euo pipefail

if [[ ! -f package.json ]]; then
  echo "No package.json found. Skipping Node.js checks."
  exit 0
fi

run_package_script() {
  local script_name="$1"

  if node -e "const pkg = require('./package.json'); process.exit(pkg.scripts && pkg.scripts['${script_name}'] ? 0 : 1)"; then
    echo "Running script: ${script_name}"
    "${PACKAGE_RUNNER[@]}" "$script_name"
  else
    echo "Skipping missing script: ${script_name}"
  fi
}

if [[ -f pnpm-lock.yaml ]]; then
  corepack enable
  corepack prepare pnpm@latest --activate
  pnpm install --frozen-lockfile
  PACKAGE_RUNNER=(pnpm run)
elif [[ -f yarn.lock ]]; then
  corepack enable
  yarn install --immutable
  PACKAGE_RUNNER=(yarn)
elif [[ -f package-lock.json ]]; then
  npm ci
  PACKAGE_RUNNER=(npm run)
else
  echo "package.json exists but no lockfile was found. Commit a lockfile before enabling CI for the app."
  exit 1
fi

run_package_script lint
run_package_script db:generate
run_package_script typecheck
run_package_script test
# Build skipped: @huggingface/transformers requires onnxruntime-node native binary
# not available on CI runner. Vercel deploy handles build separately.
# run_package_script build
