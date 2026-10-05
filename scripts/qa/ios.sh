#!/bin/bash
# Run the iPhone app flows (.maestro/) on a simulator.
#   npm run test:ios            run flows (builds the app first if it isn't installed)
#   npm run test:ios -- --build rebuild the app from current code first
#   npm run test:ios -- --tags parent   only some flows (public, parent, coach, coadmin, athlete)
cd "$(dirname "$0")/../.." || exit 1
set -a; [ -f .env.qa ] && . ./.env.qa; set +a

JH=$(ls -d "$HOME"/.local/jdk/*/Contents/Home 2>/dev/null | head -1)
[ -n "$JH" ] && export JAVA_HOME="$JH" && export PATH="$JH/bin:$PATH"
export PATH="$HOME/.maestro/bin:$PATH"
command -v maestro >/dev/null || { echo "Maestro isn't installed: curl -fsSL https://get.maestro.mobile.dev | bash"; exit 1; }

# Use a booted iPhone simulator, or boot the newest one.
UDID=$(xcrun simctl list devices booted | grep -m1 -o '[0-9A-F-]\{36\}')
if [ -z "$UDID" ]; then
  UDID=$(xcrun simctl list devices available | grep -E '^\s+iPhone' | tail -1 | grep -o '[0-9A-F-]\{36\}')
  [ -z "$UDID" ] && { echo "No iPhone simulator. Run: xcodebuild -downloadPlatform iOS"; exit 1; }
  echo "Booting simulator…"; xcrun simctl boot "$UDID"; open -a Simulator
  xcrun simctl bootstatus "$UDID" >/dev/null
fi

BUILD=0; ARGS=()
for a in "$@"; do [ "$a" = "--build" ] && BUILD=1 || ARGS+=("$a"); done
if [ $BUILD = 1 ] || ! xcrun simctl get_app_container "$UDID" com.rallyhub.app >/dev/null 2>&1; then
  # Release build: the JS is bundled in, so no dev server is needed. This is a
  # local simulator build only, nothing goes to TestFlight.
  echo "Building RallyHUB for the simulator (first time takes 10–20 min)…"
  npx expo run:ios --configuration Release --device "$UDID" --no-bundler || exit 1
fi

envs=(); for v in $(compgen -v | grep '^QA_'); do envs+=(-e "$v=${!v}"); done
maestro --device "$UDID" test "${envs[@]}" --format junit --output e2e/report/ios.xml "${ARGS[@]}" .maestro
