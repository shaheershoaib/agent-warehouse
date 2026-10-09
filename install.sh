#!/usr/bin/env bash
# Installs (or updates) the agent-warehouse Claude Code mod: downloads it to ~/.claude/mods/agent-warehouse
# and adds it to CLAUDE_CODE_PLUGIN_DIRS in your Claude Code settings. Run it again to update.
#
#   curl -fsSL https://raw.githubusercontent.com/shaheershoaib/agent-warehouse/main/install.sh | bash
#
set -euo pipefail

NAME="agent-warehouse"
# Folder names an earlier version of this mod was installed under; those entries are replaced too.
FORMER=""
REPO="shaheershoaib/$NAME"
BRANCH="${CLAUDE_MODS_BRANCH:-main}"
CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
DEST="${CLAUDE_MODS_DIR:-$HOME/.claude/mods}/$NAME"
SETTINGS="$CONFIG_DIR/settings.json"
FILES=".claude-plugin hooks types LICENSE NOTICE"

say() { printf '%s\n' "$*"; }
fail() { printf 'Install stopped: %s\n' "$*" >&2; exit 1; }

command -v tar >/dev/null 2>&1 || fail "tar is needed to unpack the mod."
if command -v python3 >/dev/null 2>&1; then EDIT="python3"
elif command -v node >/dev/null 2>&1; then EDIT="node"
else fail "python3 or node is needed to update your Claude Code settings safely. Install one and run this again."
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

if [ -n "${CLAUDE_MODS_SOURCE:-}" ]; then
  # For trying a local checkout: CLAUDE_MODS_SOURCE=/path/to/checkout bash install.sh
  src="$CLAUDE_MODS_SOURCE"
else
  command -v curl >/dev/null 2>&1 || fail "curl is needed to download the mod."
  say "Downloading $NAME from github.com/$REPO..."
  curl -fsSL "https://codeload.github.com/$REPO/tar.gz/refs/heads/$BRANCH" | tar -xz -C "$work" \
    || fail "could not download github.com/$REPO. Check your connection and try again."
  src="$(echo "$work"/*/)"
fi
[ -f "$src/.claude-plugin/plugin.json" ] || fail "the download is missing $NAME."

rm -rf "$DEST"
mkdir -p "$DEST"
for f in $FILES; do cp -R "$src/$f" "$DEST/$f"; done

mkdir -p "$CONFIG_DIR"
if [ -f "$SETTINGS" ]; then
  backup="$SETTINGS.bak-$NAME"
  cp "$SETTINGS" "$backup"
  say "Backed up your settings to $backup"
fi

# The mod's folder joins CLAUDE_CODE_PLUGIN_DIRS; an older entry for it is replaced, nothing else changes.
if [ "$EDIT" = "python3" ]; then
  python3 - "$SETTINGS" "$DEST" $NAME $FORMER <<'PY'
import json, os, sys
path, dest, names = sys.argv[1], sys.argv[2], sys.argv[3:]
data = {}
if os.path.exists(path) and os.path.getsize(path) > 0:
    with open(path) as f:
        data = json.load(f)
env = data.setdefault("env", {})
current = [p for p in str(env.get("CLAUDE_CODE_PLUGIN_DIRS", "")).split(os.pathsep) if p]
kept = [p for p in current if os.path.basename(p.rstrip("/")) not in names]
env["CLAUDE_CODE_PLUGIN_DIRS"] = os.pathsep.join(kept + [dest])
with open(path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY
else
  node - "$SETTINGS" "$DEST" $NAME $FORMER <<'JS'
const fs = require('fs'), path = require('path')
const [file, dest, ...names] = process.argv.slice(2)
const data = fs.existsSync(file) && fs.statSync(file).size > 0 ? JSON.parse(fs.readFileSync(file, 'utf8')) : {}
data.env = data.env || {}
const current = String(data.env.CLAUDE_CODE_PLUGIN_DIRS || '').split(path.delimiter).filter(Boolean)
const kept = current.filter(p => !names.includes(path.basename(p.replace(/\/+$/, ''))))
data.env.CLAUDE_CODE_PLUGIN_DIRS = [...kept, dest].join(path.delimiter)
fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n')
JS
fi

say ""
say "Installed $NAME. Open a new Claude Code session (Desktop or terminal) to see it."
say "It opens when your first agent starts; /warehouse opens it any time."
