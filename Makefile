.PHONY: help install dev tauri-dev build tauri-build prepare-release

help:
	@echo "Available targets:"
	@echo "  make install      Install dependencies"
	@echo "  make dev          Run frontend dev server"
	@echo "  make tauri-dev    Run Tauri desktop app in dev mode"
	@echo "  make build        Build frontend production bundle"
	@echo "  make tauri-build  Build Tauri desktop app bundle/installers"
	@echo "  make prepare-release VERSION=X.Y.Z  Update app versions and build changelog release entry"

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
		echo "Usage: make prepare-release VERSION=X.Y.Z"; \
		exit 1; \
	fi
	@if ! echo "$(VERSION)" | grep -Eq '^v?[0-9]+\.[0-9]+\.[0-9]+$$'; then \
		echo "Invalid VERSION '$(VERSION)'. Expected format: X.Y.Z (or vX.Y.Z)"; \
		exit 1; \
	fi
	@./scripts/prepare-version.sh "$(VERSION)"
	@./scripts/build-changelog.sh --version "$(VERSION)"
	@VERSION_NO_V="$(VERSION)"; VERSION_NO_V=$${VERSION_NO_V#v}; \
	CURRENT_BRANCH=$$(git rev-parse --abbrev-ref HEAD); \
	echo ""; \
	echo "Release files are prepared. Review changes before committing:"; \
	echo "  git status"; \
	echo "  git diff"; \
	echo ""; \
	echo "Suggested commit message:"; \
	echo "  chore(release): prepare v$$VERSION_NO_V"; \
	echo ""; \
	echo "Suggested commands:"; \
	echo "  git commit -m \"chore(release): prepare v$$VERSION_NO_V\""; \
	echo "  git tag v$$VERSION_NO_V"; \
	echo "  git push origin $$CURRENT_BRANCH"; \
	echo "  git push origin v$$VERSION_NO_V"
