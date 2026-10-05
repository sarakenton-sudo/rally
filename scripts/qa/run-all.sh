#!/bin/bash
# Runs every automated check and prints a summary. Usage: npm run qa [-- --ios]
cd "$(dirname "$0")/../.." || exit 1
set -a; [ -f .env.qa ] && . ./.env.qa; set +a
declare -a results

run() { local name=$1; shift; echo -e "\n\033[1m▶ $name\033[0m"; if "$@"; then results+=("✓ $name"); else results+=("✗ $name"); fi; }

run "Unit tests"            npx jest --silent
run "Web confirm dialogs"   node scripts/qa/audit-web-alerts.mjs
run "Backend smoke"         node scripts/qa/backend-smoke.mjs
run "Website (Playwright)"  npx playwright test
if [[ "$1" == "--ios" ]]; then
  run "iPhone app (Maestro)" bash scripts/qa/ios.sh
fi

echo -e "\n\033[1mSummary\033[0m"; printf '  %s\n' "${results[@]}"
echo "  Web report: npx playwright show-report e2e/report"
[[ " ${results[*]} " != *"✗"* ]]
