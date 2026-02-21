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

## Review Priorities
- Prioritize correctness, regressions, and security-sensitive behavior.
- Call out missing tests for changed logic.
- Include precise file references when reporting issues.

## Response Requirements
- Summarize what changed and why.
- Include verification commands and outcomes.
- After each completed change set, provide exactly one suggested commit message.

## Commit Message Requirement
- Required format for suggested messages: `chore: fix: <short description>`.
- Example: `chore: fix: add tauri AppError to InvokeError conversion`.
