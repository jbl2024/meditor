.PHONY: help install dev tauri-dev build tauri-build prepare-release

help:
	@echo "Available targets:"
	@echo "  make install      Install dependencies"
	@echo "  make dev          Run frontend dev server"
	@echo "  make tauri-dev    Run Tauri desktop app in dev mode"
	@echo "  make build        Build frontend production bundle"
	@echo "  make tauri-build  Build Tauri desktop app bundle/installers"
	@echo "  make prepare-release VERSION=vX.Y.Z  Update app version across release files"

install:
	npm install

dev:
	npm run dev

tauri-dev:
	npm run tauri:dev

build:
	npm run build

tauri-build:
	npm run tauri:build

prepare-release:
	@if [ -z "$(VERSION)" ]; then \
		echo "Usage: make prepare-release VERSION=vX.Y.Z"; \
		exit 1; \
	fi
	@if ! echo "$(VERSION)" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$$'; then \
		echo "Invalid VERSION '$(VERSION)'. Expected format: vX.Y.Z"; \
		exit 1; \
	fi
	@VERSION_NO_V="$(VERSION)"; VERSION_NO_V=$${VERSION_NO_V#v}; \
	node -e 'const fs=require("fs");const p="package.json";const d=JSON.parse(fs.readFileSync(p,"utf8"));d.version=process.argv[1];fs.writeFileSync(p,JSON.stringify(d,null,2)+"\n");' "$$VERSION_NO_V"; \
	node -e 'const fs=require("fs");const p="src-tauri/tauri.conf.json";const d=JSON.parse(fs.readFileSync(p,"utf8"));d.version=process.argv[1];fs.writeFileSync(p,JSON.stringify(d,null,2)+"\n");' "$$VERSION_NO_V"; \
	tmp_file=$$(mktemp); \
	awk -v v="$$VERSION_NO_V" 'BEGIN{in_pkg=0} /^\[package\]$$/{in_pkg=1} /^\[/{if($$0!="[package]") in_pkg=0} in_pkg && /^version = "/{$$0="version = \"" v "\""} {print}' src-tauri/Cargo.toml > "$$tmp_file" && mv "$$tmp_file" src-tauri/Cargo.toml; \
	tmp_file=$$(mktemp); \
	awk -v v="$$VERSION_NO_V" 'BEGIN{in_pkg=0;is_meditor=0} /^\[\[package\]\]$$/{in_pkg=1;is_meditor=0} in_pkg && /^name = "meditor"$$/{is_meditor=1} in_pkg && is_meditor && /^version = "/{$$0="version = \"" v "\""; in_pkg=0; is_meditor=0} {print}' src-tauri/Cargo.lock > "$$tmp_file" && mv "$$tmp_file" src-tauri/Cargo.lock; \
	echo "Updated version to $$VERSION_NO_V in package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml, and src-tauri/Cargo.lock"
