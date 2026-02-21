# Daily Notes & Wikilink System

Design Specification – Local Knowledge IDE

## Purpose

This document defines the design and UX for:

* daily journal notes
* wikilinks between notes
* navigation by date
* command palette behavior
* creation rules

The system must remain simple, deterministic, and local-first.

Markdown files remain on disk as the only source of persistence.

The editor is the primary interface for interacting with them.

---

# Core Principles

Local-first
All notes are stored as Markdown files on disk.

Deterministic
No hidden state. Everything can be rebuilt from files.

Minimal friction
Creating and navigating notes must be instant.

No empty files
A daily note is created only when the user writes content.

Structured but flexible
Users can mix:

* daily journal
* structured folders
* cross-linked notes

---

# Folder Structure

Default structure:

journal/
YYYY-MM-DD.md

Example:

journal/
2026-02-21.md
2026-02-20.md

This folder must be configurable later but fixed by default.

No "today.md" file ever exists.

Daily notes always use real ISO date filenames.

---

# Daily Note File Format

When created, the file must contain only:

# YYYY-MM-DD

Example:

# 2026-02-21

Nothing else is required.

No template noise.
No sections forced.

User writes freely.

Optional future templates may be added but not required in v1.

---

# File Creation Rules

Daily note must NOT be created automatically at midnight.

Daily note must NOT be created when the app starts.

Daily note must be created only if:

* user triggers open-today command AND
* user types content or explicitly saves

If user opens today's note and closes without typing → do not create file.

If editor contains only the title and no additional content → file should not be persisted unless user explicitly saves.

Goal: avoid empty journal pollution.

---

# Command: Open Today

Primary shortcut:

Cmd/Ctrl + D

Behavior:

1. Compute current date (ISO format)
2. Target file:
   journal/YYYY-MM-DD.md
3. If file exists:
   open in editor
4. If file does not exist:
   open ephemeral editor buffer
   pre-filled with:

   # YYYY-MM-DD

File is not written yet.

File is written only when:

* user types content
* or presses save

---

# Command Palette

Command palette must exist early.

Shortcut:
Cmd/Ctrl + P → quick open file
Cmd/Ctrl + Shift + P → command palette

Palette must include:

Open Today
Open Yesterday
Open Specific Date
New Note
Open File
Reveal in Explorer

Typing "today" must show:
Open Today

Typing a date like:
2026-02-21
must offer:
Open daily note 2026-02-21

If file doesn't exist:
Create daily note 2026-02-21

---

# Navigation by Date

Dates in text using ISO format:

YYYY-MM-DD

must be recognized automatically.

When cursor or click on a date:

→ clickable link
→ opens corresponding daily note

Example:

Meeting held on 2026-02-21

Click:
opens journal/2026-02-21.md
creates if absent (only when edited)

---

# Wikilinks

Supported syntax:

[[note]]
[[folder/note]]
[[note|alias]]

Behavior:

Typing [[ triggers autocomplete popup.

Popup shows:

* matching filenames
* folders
* daily notes
* option to create new

Selecting result inserts wikilink.

If link target does not exist:
file created on first open/edit, not immediately.

---

# Backlinks

System must track links between notes.

After save:

* parse wikilinks
* update SQLite backlinks index

Each note must display backlinks in right panel:

Referenced by:

* note A
* 2026-02-21
* project X

Backlinks update automatically.

---

# UX Flow – Daily Use

Morning:

Cmd+D
→ today's note opens instantly
→ start writing

During day:

Typing:
Discussed with [[Patricia]]
Issue on [[IT interne/kubernetes]]

Notes auto-linked.

Later:

Open kubernetes.md
→ see all days referencing it

This creates natural temporal navigation.

---

# Ephemeral File Behavior

When opening a non-existing daily note:

Editor opens in ephemeral state.

File becomes real only if:

* user writes content
* or explicitly saves

If user closes tab without edits:
no file created.

This avoids empty note pollution.

---

# Visual Indicators

In tab bar:

Unsaved ephemeral note:

* show dot indicator

Saved note:

* dot disappears

Status bar:

* "unsaved"
* "saved"

---

# Future Extensions (Not Required Now)

Daily template
Calendar view
Weekly review
Timeline view
Heatmap
Task extraction
AI summarization

Not part of v1.

---

# Non-Goals (v1)

No heavy journaling system
No calendar UI
No reminders
No scheduled notes
No plugin system

Keep system minimal and reliable.

---

# Summary

Daily notes must feel:

Instant
Lightweight
Natural
Non-invasive

They support thinking and memory, not process overhead.

The system must never create friction or unnecessary files.

The journal is a tool, not a system to manage.
