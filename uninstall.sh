#!/usr/bin/env bash
# Removes the agent-warehouse Claude Code mod: takes it out of CLAUDE_CODE_PLUGIN_DIRS and deletes its folder.
#
#   curl -fsSL https://raw.githubusercontent.com/shaheershoaib/agent-warehouse/main/uninstall.sh | bash
#
set -euo pipefail

NAME="agent-warehouse"
FORMER=""
CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
DEST="${CLAUDE_MODS_DIR:-$HOME/.claude/mods}/$NAME"
SETTINGS="$CONFIG_DIR/settings.json"

if [ -f "$SETTINGS" ]; then
  cp "$SETTINGS" "$SETTINGS.bak-$NAME"
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$SETTINGS" $NAME $FORMER <<'PY'
import json, os, sys
path, names = sys.argv[1], sys.argv[2:]
with open(path) as f:
    data = json.load(f)
env = data.get("env", {})
dirs = [p for p in str(env.get("CLAUDE_CODE_PLUGIN_DIRS", "")).split(os.pathsep) if p]
kept = [p for p in dirs if os.path.basename(p.rstrip("/")) not in names]
if kept:
    env["CLAUDE_CODE_PLUGIN_DIRS"] = os.pathsep.join(kept)
else:
    env.pop("CLAUDE_CODE_PLUGIN_DIRS", None)
with open(path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY
  elif command -v node >/dev/null 2>&1; then
    node - "$SETTINGS" $NAME $FORMER <<'JS'
const fs = require('fs'), path = require('path')
const [file, ...names] = process.argv.slice(2)
const data = JSON.parse(fs.readFileSync(file, 'utf8'))
const env = data.env || {}
const kept = String(env.CLAUDE_CODE_PLUGIN_DIRS || '').split(path.delimiter).filter(Boolean).filter(p => !names.includes(path.basename(p.replace(/\/+$/, ''))))
if (kept.length) env.CLAUDE_CODE_PLUGIN_DIRS = kept.join(path.delimiter); else delete env.CLAUDE_CODE_PLUGIN_DIRS
fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n')
JS
  else
    printf 'Remove %s from CLAUDE_CODE_PLUGIN_DIRS in %s by hand (python3 or node was not found).\n' "$NAME" "$SETTINGS" >&2
  fi
fi
rm -rf "$DEST"
printf 'Removed %s. New Claude Code sessions will not load it.\n' "$NAME"
