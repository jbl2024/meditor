# Local Note History

## Goal

Provide a small local history for each Markdown note so the user can:

- browse previous saved versions;
- compare a saved version with the current file;
- restore a previous version without git.

## Storage Model

Snapshots are stored inside the workspace under `.tomosona/note-history/`.

Each note gets its own history directory keyed from the note path. The history
contains:

- a compact manifest with snapshot metadata;
- full Markdown snapshot files.

## Capture Rules

Tomosona captures a snapshot automatically after a successful save when the
content changed.

Snapshot capture is best effort:

- save success is never blocked by history write failures;
- duplicate content is skipped;
- only the most recent snapshots are retained.

## Retention

The MVP keeps the last `20` snapshots per note.

Older snapshots are deleted automatically when new snapshots are appended.

## Compare And Restore

The UI shows:

- a chronological list of saved versions;
- a simple side-by-side comparison of current file content and the selected
  snapshot;
- an explicit restore action.

Restore behavior:

- the selected snapshot overwrites the current file;
- the restored content is written back to disk;
- the restored state is recorded as a new snapshot;
- restore is disabled while the note has unsaved edits.

## Rename And Move

History follows the note when the app renames or moves a file. The shell
forwards rename/move path batches to the history store so the snapshot directory
can be moved with the note.

## Non-goals

- git integration;
- merge-aware restore;
- workspace-wide timeline;
- per-keystroke snapshots.
