#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  echo "Usage: $0 <version>"
  echo "Example: $0 0.1.6"
}

if [ "$#" -ne 1 ]; then
  usage
  exit 1
fi

RAW_VERSION="$1"
VERSION="${RAW_VERSION#v}"

if ! echo "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "Invalid version '$RAW_VERSION'. Expected format: X.Y.Z (optionally prefixed with v)."
  exit 1
fi

cd "$ROOT_DIR"

node -e 'const fs=require("fs");const p="package.json";const d=JSON.parse(fs.readFileSync(p,"utf8"));d.version=process.argv[1];fs.writeFileSync(p,JSON.stringify(d,null,2)+"\n");' "$VERSION"

node -e 'const fs=require("fs");const p="src-tauri/tauri.conf.json";const d=JSON.parse(fs.readFileSync(p,"utf8"));d.version=process.argv[1];fs.writeFileSync(p,JSON.stringify(d,null,2)+"\n");' "$VERSION"

tmp_file="$(mktemp)"
awk -v v="$VERSION" '
  BEGIN { in_pkg=0 }
  /^\[package\]$/ { in_pkg=1 }
  /^\[/ { if ($0 != "[package]") in_pkg=0 }
  in_pkg && /^version = "/ { $0 = "version = \"" v "\"" }
  { print }
' src-tauri/Cargo.toml > "$tmp_file"
mv "$tmp_file" src-tauri/Cargo.toml

tmp_file="$(mktemp)"
awk -v v="$VERSION" '
  BEGIN { in_pkg=0; is_meditor=0 }
  /^\[\[package\]\]$/ { in_pkg=1; is_meditor=0 }
  in_pkg && /^name = "meditor"$/ { is_meditor=1 }
  in_pkg && is_meditor && /^version = "/ {
    $0 = "version = \"" v "\""
    in_pkg=0
    is_meditor=0
  }
  { print }
' src-tauri/Cargo.lock > "$tmp_file"
mv "$tmp_file" src-tauri/Cargo.lock

echo "Updated versions to $VERSION in package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml, and src-tauri/Cargo.lock"
