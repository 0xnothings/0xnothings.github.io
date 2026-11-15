#!/usr/bin/env bash
# demo.sh — record a terminal demo of 12 tools with asciinema (or script as fallback).
# Copyright (c) 2026 0xnothings
#
# Usage:
#   bash demo.sh                 # try asciinema, fall back to a typescript file
#   bash demo.sh --no-pause      # no sleeps between commands (for the fallback)
#
# asciinema:  https://asciinema.org  (brew install asciinema / apt install asciinema / scoop install asciinema)
# Produces demo.cast (asciinema) or demo.typescript (script(1)) in this directory.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
PAUSE=${PAUSE:-1.2}

run() {
  printf '\033[1;32m$ %s\033[0m\n' "$1"
  sleep "$PAUSE"
  eval "$1" 2>&1 | sed 's/^/  /'
  printf '\n'
  sleep "$PAUSE"
}

demo() {
  cd "$ROOT" || exit 1
  clear
  printf '\033[1;36m   234 CLI tools. Zero dependencies. Node standard library only.\033[0m\n'
  printf '\033[2m   github.com/0xnothings    —    every tool: --help, --json, meaningful exit codes\033[0m\n\n'
  sleep 2.5

  printf '\033[1;33m── security ────────────────────────────────────────────────\033[0m\n\n'
  run "node tools-security/tools/hashid.js --text hello --gen sha256"
  run "node tools-security/tools/cidr.js 10.0.0.0/30"
  run "node tools-security/tools/payloadx.js encode --in \"<script>alert(1)</script>\" --via url"
  run "node tools-security/tools/httpstatus.js 429"

  printf '\033[1;33m── devops ──────────────────────────────────────────────────\033[0m\n\n'
  run "node tools-devops/tools/cronlab.js \"*/15 9-17 * * 1-5\" --next 2"
  run "node tools-devops/tools/syssnap.js | tail -6"

  printf '\033[1;33m── web ─────────────────────────────────────────────────────\033[0m\n\n'
  run "node tools-web/tools/uacheck.js \"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36\""
  run "node tools-web/tools/urlx.js \"https://x.com/a?utm_source=fb&id=3&fbclid=zz\" --strip-tracking | tail -3"

  printf '\033[1;33m── data (hand-written parsers) ─────────────────────────────\033[0m\n\n'
  printf '\033[1;32m$ %s\033[0m\n' "node tools-data/tools/filetype.js node.exe | head -6"
  sleep "$PAUSE"
  node tools-data/tools/filetype.js "$(command -v node)" 2>/dev/null | head -6 | sed 's/^/  /'
  printf '\n'; sleep "$PAUSE"

  printf '\033[1;32m$ %s\033[0m\n' "node tools-data/tools/zipmedic.js archive.zip"
  sleep "$PAUSE"
  TMPZ="$(mktemp -d)/archive.zip"
  (cd "$(mktemp -d)" && printf 'hello' > a.txt && printf 'world' > b.txt && zip -q "$TMPZ" a.txt b.txt 2>/dev/null)
  node tools-data/tools/zipmedic.js "$TMPZ" 2>/dev/null | sed 's/^/  /' || printf '  (needs a zip; skipped)\n'
  printf '\n'; sleep "$PAUSE"

  printf '\033[1;36m   All of it: no npm install. Clone and run.\033[0m\n'
  printf '\033[2m   github.com/0xnothings/tools-security  ·  tools-devops  ·  tools-web  ·  tools-data\033[0m\n\n'
  sleep 3
}

if command -v asciinema >/dev/null 2>&1; then
  echo "recording with asciinema -> $HERE/demo.cast"
  asciinema rec --command "bash $HERE/demo.sh --inner" --overwrite "$HERE/demo.cast"
else
  echo "asciinema not found; capturing with script(1) -> $HERE/demo.typescript"
  printf 'Install asciinema for a shareable player: https://asciinema.org\n\n'
  script -q -c "bash $HERE/demo.sh --inner" "$HERE/demo.typescript" 2>/dev/null || bash "$HERE/demo.sh" --inner | tee "$HERE/demo.typescript"
fi
