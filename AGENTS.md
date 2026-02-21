# AGENTS.md

This file defines agent behavior for `/Users/jbl2024/jbl42/meditor`.

## Core Rules
- Keep changes minimal, targeted, and compatible with the existing stack.
- Do not revert unrelated local changes.
- Validate important code edits with a relevant check when feasible.
- Prefer `rg`/`rg --files` for codebase search.

## Editing
- Prefer small, reviewable patches.
- Follow existing project style and naming.
- Use ASCII unless the file already requires Unicode.

## Communication
- Summarize what changed and why.
- List any commands run for verification and their outcomes.

## Commit Message Requirement
- After each completed change set, always provide one suggested commit message.
- Required format: `chore: fix: <short description>`
- Example: `chore: fix: add tauri AppError to InvokeError conversion`
