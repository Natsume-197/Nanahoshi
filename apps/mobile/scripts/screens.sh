#!/usr/bin/env bash
# Phone screenshots for design review, over wireless ADB.
#
#   scripts/screens.sh            one screenshot  -> .screens/<time>.png
#   scripts/screens.sh home-dark  named shot      -> .screens/home-dark.png
#   scripts/screens.sh --watch    a new shot every 3 s (Ctrl+C to stop),
#                                 kept as .screens/live.png plus history
#
# Needs `adb` connected to the phone (see apps/mobile/README.md).
set -euo pipefail
cd "$(dirname "$0")/.."
ADB="${ADB:-adb}"
if ! command -v "$ADB" >/dev/null 2>&1 && [ -x "$HOME/platform-tools/adb" ]; then
	ADB="$HOME/platform-tools/adb"
fi
mkdir -p .screens

shot() {
	"$ADB" exec-out screencap -p > ".screens/$1.png.tmp" && mv ".screens/$1.png.tmp" ".screens/$1.png"
	echo "saved .screens/$1.png"
}

if [ "${1:-}" = "--watch" ]; then
	while true; do
		stamp="$(date +%H%M%S)"
		shot "live"
		cp .screens/live.png ".screens/watch-$stamp.png"
		# keep the last 40 history frames
		ls -1t .screens/watch-*.png 2>/dev/null | tail -n +41 | xargs -r rm -f
		sleep 3
	done
else
	shot "${1:-$(date +%Y%m%d-%H%M%S)}"
fi
