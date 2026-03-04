# ADR 0001 - Second Brain sessions file-backed, SQLite as disposable cache

- Status: Accepted
- Date: 2026-03-04
- Deciders: Product + Engineering

## Context

Second Brain sessions are currently persisted in SQLite tables under the workspace internal folder.

We want:
- durable session data that remains readable without the app,
- easy reuse/export/versioning of session history,
- the ability to delete/rebuild SQLite without losing session history.

## Decision

Second Brain session persistence will use files as the source of truth.

- Canonical storage location:
  - `.tomosona/sessions/<session-id>/`
- Canonical format:
  - markdown/text files for metadata, context, messages, and draft.
- SQLite becomes a derived cache/index only:
  - safe to delete,
  - rebuildable from file-backed sessions.

No migration will be implemented.

- Existing SQLite-only sessions are out of scope.
- Only sessions stored in the new file-backed format are guaranteed going forward.

## File layout (v1)

For each session id:

- `.tomosona/sessions/<session-id>/session.md`
  - metadata: title, provider, model, timestamps, target note.
  - ordered context paths.
- `.tomosona/sessions/<session-id>/messages.md`
  - append-only message log (user/assistant, mode, timestamps, citations, attachments).
- `.tomosona/sessions/<session-id>/draft.md`
  - current draft content.

Optional implementation detail:
- if message density requires simpler appends, `messages.ndjson` is allowed internally,
  but markdown export must remain first-class.

## Write/read rules

- Atomic writes:
  - write to temp file, then rename.
- Message appends:
  - append-only log semantics.
- Deterministic parsing:
  - explicit `schema_version` field in session metadata.
- Recovery:
  - if SQLite cache/index is missing or stale, rebuild from files.

## Consequences

Positive:
- Session durability independent from DB lifecycle.
- Human-readable, scriptable artifacts.
- Better long-term interoperability and backup portability.

Tradeoffs:
- More filesystem IO and consistency logic to implement.
- Need strict parser/serializer contract tests.
- No backward-compatibility promise for old SQLite-only sessions (explicitly accepted).

## Non-goals

- No migration of old SQLite sessions.
- No dual-write long transition period requirement.
- No external API contract changes in this ADR.

## Acceptance criteria

- Creating/updating a session writes all canonical data under `.tomosona/sessions/<session-id>/`.
- Deleting SQLite cache does not lose session history.
- Rebuild path from files to SQLite cache works deterministically.
- Round-trip tests protect parser/serializer stability for `session.md`, `messages.md`, and `draft.md`.
