# AGENTS.md

This file defines repository-wide agent behavior for `/Users/jbl2024/jbl42/meditor`.

## Scope
- Applies to the entire repository unless a deeper `AGENTS.md` overrides specific rules.

## Project Context
- Desktop app stack: `Tauri 2` + `Rust` backend + `Vue 3` frontend.
- Frontend is in `/Users/jbl2024/jbl42/meditor/src`.
- Tauri/Rust code is in `/Users/jbl2024/jbl42/meditor/src-tauri`.

## Core Rules
- Keep changes minimal, targeted, and compatible with current behavior unless a behavior change is requested.
- Do not revert unrelated local changes.
- Prefer `rg` and `rg --files` for searching.
- Avoid dependency upgrades unless explicitly requested.

## Tauri 2 Rules
- For all `#[tauri::command]` functions, error type must satisfy Tauri IPC requirements.
- Use `Result<T, E>` where `E: Into<tauri::ipc::InvokeError>`.
- Keep native/system access in Rust commands, not in the Vue layer.
- Validate and normalize filesystem paths passed from the frontend.
- Return safe error messages suitable for UI display (avoid leaking sensitive paths or secrets).

## Vue 3 Rules
- Use Composition API with `<script setup>` for new or modified components.
- Keep components focused; extract reusable stateful logic into composables.
- Prefer explicit props/events contracts and one-way data flow.
- Keep Tauri `invoke` calls centralized behind typed frontend service wrappers.

## Editing Standards
- Prefer small, reviewable patches.
- Follow existing naming and code style in touched files.
- Use ASCII unless file content already requires Unicode.
- Add comments only when code intent is not obvious.

## Verification
- Run relevant checks after meaningful changes when feasible.
- Backend changes: run `cargo check` in `/Users/jbl2024/jbl42/meditor/src-tauri`.
- Frontend changes: run relevant build/test command for the Vite/Vue app.
- If checks are not run, state that clearly.

## Changelog Workflow
- Keep `/Users/jbl2024/jbl42/meditor/CHANGELOG.md` updated for every release.
- Use Semantic Versioning for release versions: `MAJOR.MINOR.PATCH` (for example `0.9.10`).
- Add release entries using this exact heading format: `## [<version>] - YYYY-MM-DD`.
- Keep an `## [Unreleased]` section at the top with these subsections:
  - `### Added`
  - `### Changed`
  - `### Deprecated`
  - `### Removed`
  - `### Fixed`
  - `### Security`
- When cutting a release, move relevant notes from `Unreleased` into the new version block and reset `Unreleased` subsections to empty.
- After updating the changelog for a release, create a Git tag that matches the version with a `v` prefix (example: `v0.9.10`).
- Push commits and tags so CI can run on the release tag:
  - `git add CHANGELOG.md AGENTS.md`
  - `git commit -m "chore(release): prepare v0.9.10"`
  - `git tag v0.9.10`
  - `git push origin <branch-name>`
  - `git push origin v0.9.10`

## Review Priorities
- Prioritize correctness, regressions, and security-sensitive behavior.
- Call out missing tests for changed logic.
- Include precise file references when reporting issues.

## Response Requirements
- Summarize what changed and why.
- Include verification commands and outcomes.
- After each completed change set, provide exactly one suggested commit message.

## Commit Message Requirement
- Use [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/).
- Required format: `<type>[optional scope]: <short description>`.
- Supported types include: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- Use `!` before `:` or add a `BREAKING CHANGE:` footer when applicable.
- Example: `fix(theme): add system-aware light/dark switcher`.
