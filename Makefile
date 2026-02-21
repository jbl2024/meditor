.PHONY: help install dev tauri-dev build tauri-build

help:
	@echo "Available targets:"
	@echo "  make install      Install dependencies"
	@echo "  make dev          Run frontend dev server"
	@echo "  make tauri-dev    Run Tauri desktop app in dev mode"
	@echo "  make build        Build frontend production bundle"
	@echo "  make tauri-build  Build Tauri desktop app bundle/installers"

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
