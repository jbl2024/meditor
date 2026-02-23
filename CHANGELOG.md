# Changelog

All notable changes to this project will be documented in this file.

The format follows Semantic Versioning (SemVer): `MAJOR.MINOR.PATCH`.

## [Unreleased]

### Added

### Changed

### Deprecated

### Removed

### Fixed

### Security

## [0.2.8] - 2026-02-23

### Added
- feat(ignore): apply .gitignore and .meditorignore to watcher events and explorer listing (613a910)

### Changed
- test(watcher): add exhaustive rust and vue watcher event planning test suites (0806c90)
- Suggested commit message: feat(workspace): replace explorer polling with recursive native fs watcher events (077e8e5)
- chore: changelog (bdd3e23)

### Fixed
- fix(editor): restore auto list conversion for dash and ordered shortcuts (121d836)

## [0.2.7] - 2026-02-22

### Added
- feat(navigation): add long-press and context-menu history dropdown for back/forward (3540288)
- feat(navigation): add browser-style document history with back/home/forward UI and shortcuts (05ffa20)

### Changed
- test(security): add frontend regression tests and remove stale workspace IPC args (e223078)
- test(security): add regression coverage for workspace path guards and protected directories (70fb028)
- refactor(indexing): replace external find with in-process markdown traversal (83989d3)

### Fixed
- fix(security): narrow tauri core capability permissions for main window (baa5fbf)
- fix(security): scope external open commands to workspace and remove broad opener capability (923f30d)
- fix(security): remove v-html snippet rendering, enforce CSP, and allowlist external link schemes (20b4841)
- fix(workspace): surface protected-folder rejection when selecting workspace (6f4690e)

## [0.2.6] - 2026-02-22

### Added
- feat(wikilinks): add heading and block anchor navigation for intra-note links (cfc6d1a)

### Changed
- chore(editor): remove temporary wikilink arrow debug instrumentation (b62126a)
- refactor(editor): remove redundant local status footer from EditorView (1b71759)
- style(chrome): restore tab separators and reduce status bar font size (02c71c7)
- style(layout): soften pane splitters with ghost resize handles (2ede800)
- style(ui): tighten tab hierarchy and harden status bar density (a3858b2)

### Fixed
- fix(wikilinks): keep autocomplete insertion in raw mode for post-selection edits (4350284)
- fix(wikilinks): correct caret boundary detection for arrow-based raw link editing (908c304)
- fix(mermaid): apply dark styling to template select dropdown and options (71a5abe)
- fix(status-bar): shorten editing label to prevent footer shift (e2e7950)

## [0.2.5] - 2026-02-22

### Added
- feat(command-palette): add theme switch actions (light/dark/system) (499ed98)
- feat(shortcuts): add Cmd/Ctrl+E to open explorer sidebar (50184fb)
- feat(search): debounce live query search and show empty state only after executed search (4e767fe)

### Changed
- style(menu): align theme actions with overflow item icon and typography standards (3fbee44)
- refactor(ui): iconify activity bar and move command palette into overflow menu (d37b517)
- refactor(topbar): use icon-only toolbar buttons for search, command palette, and overflow (557e187)
- refactor(tabs): replace close text with Heroicons XMarkIcon (67ad9ca)

### Fixed
- fix(search-ui): use icon go button and suppress empty-state for blank query (08fd49d)
- fix(properties): correct dark-mode styling for property dropdown and token input (83e44ba)
- fix(editor): theme EditorJS popover variables for dark mode (013b2ce)
- fix: restore caret position (f6699d6)
- fix(editor): preserve per-tab scroll position when switching files (3681cb3)

## [0.2.4] - 2026-02-22

### Changed
- style(editor): override EditorJS list gap variables to reduce vertical spacing (b6f2f57)
- style(editor): soften text tone and tighten heading/list typography (0d749be)
- style(typography): switch UI font to Geist (c685254)
- style(typography): load IBM Plex Sans and JetBrains Mono via Google Fonts (5d06c55)

## [0.2.3] - 2026-02-22

### Added
- feat(explorer): add heroicons to context menu actions (0400199)
- feat(explorer): use modals for new note/folder with parent path prefill (b7bb225)

### Changed
- style(editor): compact properties panel header and collapsed layout (8db95ed)

### Fixed
- fix(explorer): add tooltips for new note and new folder toolbar actions (a517616)

## [0.2.2] - 2026-02-22

### Changed
- ci(release): add Linux AppImage build and upload for amd64/arm64 (da86890)

## [0.2.1] - 2026-02-22

### Added
- feat(editor): add mermaid block with templates and markdown fence round-trip (3f7bd64)
- feat(editor): replace warning plugin with custom obsidian-style callout block (de354d2)
- feat(editor): add table and callout blocks with markdown round-trip support (6043a44)

## [0.2.0] - 2026-02-22

### Added
- feat(index): add manual rebuild action and switch sqlite note paths to workspace-relative (cbd24a6)
- feat(search): index frontmatter properties and support property-filter queries (28bef43)
- feat(properties): add Obsidian-compatible frontmatter editor with workspace type schema (1607270)

### Fixed
- fix(notifications): add typed auto-dismissing toast system with success/info/error tones (1b1f84b)
- fix(editor): restore mouse scrolling by making properties/editor shell a flex column (bf0a1cd)

## [0.1.9] - 2026-02-22

### Added
- feat(new-note): support nested paths with dot-segment normalization inside workspace (a913a2e)
- feat(command-palette): use dedicated modal for open-specific-date action (744a9e2)

### Changed
- refactor(editor): open daily notes as real files and focus first editable block on load (4d82564)

### Fixed
- fix(daily-notes): open new day notes without prefilled heading (ceeca6c)

## [0.1.8] - 2026-02-22

### Added
- feat(command-palette): add inline open-specific-date input with YYYY-MM-DD parsing (462fcc5)

### Changed
- chore: remove bootstrap.sh (095e178)

### Fixed
- fix(new-note-modal): show and clear validation errors inline near path input (628de09)
- fix(notes): auto-append .md when creating new note from modal (ed8841c)
- fix(input-keyboard): prevent cmd+arrow propagation from modal inputs (ee52051)
- fix(command-palette): replace new-file prompt with dedicated modal (ce1313f)

## [0.1.7] - 2026-02-22

### Changed
- chore(makefile): print manual review and tag/push guidance after prepare-release (ffeca34)

## [0.1.6] - 2026-02-22

### Changed
- refactor(release): split prepare-release into version and changelog scripts (4cd446e)
- build(makefile): add prepare-release target with vX.Y.Z validation and version sync (6909807)

## [0.1.5] - 2026-02-21

### Changed
- bug: click outside link compress it (bb0c310)

### Fixed
- fix(editor): unify markdown inline code with Editor.js inline-code style (61083ae)
- fix(explorer): detect tauri string errors for conflict modal fallback (5404b47)
- fix(editor): expand regular hyperlinks to markdown tokens during keyboard navigation (47838af)
- fix(tabs): save dirty note before tab switches (4be17bc)
- fix(editor): persist dirty note before wikilink navigation (405216c)

## [0.1.4] - 2026-02-21

### Changed
- ci(release): install xdg-utils for linux arm64 appimage bundling (94bd0ce)
- chore: bump version (18ffd9c)

## [0.1.3] - 2026-02-21

### Changed
- ci(release): add linux arm64 release build alongside amd64 (7ba5edb)

## [0.1.2] - 2026-02-21

### Added
- feat(wikilinks): prompt before rewriting links on note rename (d5f1200)
- feat(palette): add open and close workspace actions (c020648)
- feat(ui): promote workspace open action and add close workspace menu item (413597d)

### Changed
- refactor(toolbar): remove workspace open icon and add close icon to close-workspace action (434bf5f)

### Fixed
- fix(tauri): store workspace sqlite in .meditor (b038695)

## [0.1.1] - 2026-02-21

### Changed
- chore: ci (2d840fe)
- chore: changelog (698da3e)
- add MIT LICENSE (4ad9049)

## [0.1.0] - 2026-02-21

### Added

### Changed
First release

### Deprecated

### Removed

### Fixed

### Security
