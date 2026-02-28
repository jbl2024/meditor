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

## [0.5.1] - 2026-02-28

### Added
- feat(editor): add smart paste html-to-markdown conversion with confidence fallback (d7597e7)

### Fixed
- fix(ui): increase default left sidebar width (7f12c8f)
- fix(editor): align block controls to content edge with minimal gap (25e3d76)
- fix(editor): set content max-width to 700px for improved readability (2b9f991)

## [0.5.0] - 2026-02-28

### Added
- feat(editor): use heroicons for inline code and link toolbar actions (0d6bec6)
- feat(properties): add smooth animated transition for expand and collapse (8484364)
- feat(ui): redesign right pane as structured analysis cards (e3474c3)
- feat(properties): keep panel collapsed by default and show header indicator when populated (2e61470)
- feat(ui): refresh light theme with modern minimalist canvas styling (633ccf1)
- feat(editor): add markdown-safe table toolbar (b916cc1)
- feat(callout): use left title as type picker trigger with heroicons (410d10f)
- feat(mermaid): support tab and shift-tab indentation in raw editor (74fba47)
- feat(editor): add tab indentation and language selector to code blocks (e7b7d3f)
- feat(editor): fix slash command menu keyboard handling and positioning (d5a6666)
- feat(theme): update dark theme to Atom One Dark colors (212d753)
- feat(editor): redesign block menu with icons, move actions, and Convert to submenu (5e9d94d)
- feat(editor): add tiptap drag handle block menu with floating actions and lock/unlock behavior (cb69ca2)

### Changed
- style(editor): unify hover and press interactions across inline toolbar actions (eaed617)
- chore(editor): remove temporary gutter debug logs (77781c2)
- perf(editor): trigger loading overlay for complexity-heavy docs below size threshold (984482a)
- perf(editor): stabilize first-load overlay until heavy async renders settle (344a563)
- refactor(editor): render in-memory multi-instance EditorContent per open tab (c814c70)
- perf(editor): avoid drag-handle remount on tab switch and refine large-doc debug logs (55991cb)
- refactor(editor): extract session status, caret outline, and layout metrics from EditorView (3167e3a)
- refactor(editor): harden setup order and extract block/title/wikilink engines with guardrails (e4d7bc0)
- refactor(editor): extract tiptap/wikilink/table/path modules and remove legacy persistence (0296814)
- refactor(editor): document composables and add file lifecycle race coverage (d94592e)
- refactor(editor): stabilize ownership by integrating lifecycle/block/table composables and splitting overlays (50f53b6)
- refactor(editor): extract documented editor modules and overlay components with expanded tests (4da4e83)
- style(ui): bigger icon (7d11279)
- style(ui): icon (1bc4b65)
- style(ui): icons (399a80c)
- style(ui): logo (d1839e1)
- style(ui): new logo (6ec1373)
- test(editor): add edge-case tab switch and session lifecycle regressions (a43813c)
- refactor(editor): introduce per-document tiptap sessions with pane-ready store (35c8160)
- refactor(ui): add shared filterable dropdown foundation and migrate code/property/slash/wikilink menus (af7c255)
- style(editor): better checkbox alignment (c84fcb6)
- docs(design): update editor implementation doc for Tiptap migration (5351c64)
- style(editor): more padding for gutter (a3f7935)
- chore(editor): remove editorjs (19464b9)
- style(ui): do not display gutter (4d276ff)
- refactor(editor): migrate wikilinks to atomic tiptap node with deterministic state plugin (26a396c)
- refactor(editor): migrate EditorView runtime from editorjs to tiptap with strict markdown compatibility (ce228f6)

### Fixed
- fix(properties): keep header title aligned across collapsed and expanded states (cd669af)
- fix(editor): clear stale block-menu selection and keep convert submenu visible (ffdfcc5)
- fix(editor): remove underline styling from h2 and h6 headings (4b3a684)
- fix(explorer): reveal and focus active file on explorer show and tab switch (aadf26f)
- fix(ui): increase overflow menu minimum width (2290ad8)
- fix(wikilink): allow arrow navigation when completion menu is hidden (bdd5e4f)
- fix(wikilink): keep edit tracking after escape so leaving range commits node (a47f705)
- fix(wikilink): preserve alias when confirming suggestions and surface create-alias label (9eddb70)
- fix(tiptap): preserve wikilink and link nodes in list item import (a6a7426)
- fix(editor): apply dark theme styles correctly to wikilink menu (8eee1ff)
- fix(editor): remount drag handle per active document to restore gutter controls on tab switch (2ab45aa)
- fix(app): suppress editor refocus when opening files from explorer (d6a8fab)
- fix(app): suppress editor refocus when opening files from explorer (b293528)
- fix(editor): initialize first-load caret at doc start when no snapshot exists (376d4d0)
- fix(editor): avoid synthetic caret capture on unfocused tab switches (0823f99)
- fix(editor): lower large-doc loader threshold to 40k and cover with test (3149d2e)
- fix(editor): stabilize outline reveal targeting and extract right pane component (31ce0c8)
- fix(editor): restore content styles after css extraction by replacing deep selectors (6e616c8)
- fix(ui): apply dark theme tokens to filterable dropdowns and task checkboxes (ccab330)
- fix(markdown): support emphasis wrapping around inline links and wikilinks (67614eb)
- fix(editor): replace prompt link action with inline format toolbar popover (3850bd1)
- fix(table): eliminate edge-handle flicker with hover hysteresis and gapless rails (491dd7a)
- fix(callout): position kind dropdown menu as overlay (d6c1109)
- fix(selection): normalize node-selection snapshots to prevent random range restore (2b94d6e)
- fix(mermaid): restore visible edit mode by binding is-editing wrapper class (ebe30f9)
- fix(editor): track docChanged transactions so code block language changes autosave (6abe845)
- fix(editor): only arm slash suggestions from tiptap keydown to prevent auto-open on file load (4d5b288)
- fix(editor): teleport slash and wikilink menus to body for correct viewport positioning (a8df75d)
- fix(editor): show cursor in empty checkbox lines (94d07d4)
- fix(editor): align checkboxes to top when nested (6079c2a)
- fix(editor): stop wikilink transaction recursion and stabilize wikilink menu anchor (47670c1)
- fix(editor): sync slash dropdown from tiptap update and selection events (ca55a59)
- fix(editor): restore stable block handle alignment by removing lh transform and using left placement (1689efd)

## [0.4.1] - 2026-02-26

### Changed
- test(shortcuts): add regression coverage for global shortcut target gating (c732565)

### Fixed
- fix(a11y): enforce modal focus isolation and block background shortcuts (d3e1b9e)
- fix(shortcuts): allow global keybindings from search panel input (4435a68)
- fix(search): keep quick-open file index consistent across create/delete/rename events (ba4e23d)
- fix(ui): restore focus after modal close for keyboard flow continuity (3ce7a6f)
- fix(ui): harden keyboard/modal flows and remove dead-end sidebar states (28c94df)

## [0.4.0] - 2026-02-25

### Added
- feat(editor): enable rich inline formatting in table cells and enforce heading mode at creation (4dee4cc)
- feat(editor): add strikethrough and underline inline formatting with markdown round-trip support (deafedd)

### Changed
- docs(design): add EditorView implementation architecture and composables guide (52be6bd)
- refactor(editor): remove obsolete checklist debug mode and styles (61a3684)
- refactor(editor): extract tools slash commands and mermaid dialog with documented modules and wiring tests (aa8baa0)
- refactor(editor): extract block mutation and caret placement helpers into composable with insertion tests (a1b651f)
- refactor(editor): extract EditorJS instance lifecycle into composable with wiring tests (b04ca41)
- refactor(editor): extract zoom state and persistence into useEditorZoom with bounds tests (73dc24a)
- refactor(editor): extract outline and anchor navigation into composable with retry tests (ce52b58)
- refactor(editor): extract caret snapshot/restore into useEditorCaret with round-trip tests (47ea8ef)
- refactor(editor): extract virtual title behavior into composable with invariant tests (41848a6)
- refactor(editor): extract save lifecycle into composable with focused branch tests (566a064)
- refactor(editor): extract document load lifecycle into composable with deterministic vitest coverage (bb69e4d)
- docs(history): add TSDoc for useDocumentHistory behavior and invariants (688a1de)
- refactor(editor): extract input interaction handlers into useEditorInteraction with focused vitest coverage (8ccbfb1)
- docs(editor): document editorPerf module and mutation helpers (58ed9c0)
- refactor(editor): extract wikilink behavior and interaction helpers with vitest coverage (05fbf1d)
- refactor(editor): extract wikilink behavior into composable with vitest coverage (99a452f)
- test(editor): add vitest coverage for useCodeBlockUi behavior and observer wiring (8e5fb42)
- refactor(editor): extract editor ui panels and overlays into dedicated components (2b2fcb4)
- refactor(editor): extract code block UI behavior into useCodeBlockUi composable (dd088d1)
- refactor(editor): extract persistence/frontmatter behaviors, add vitest coverage, and standardize docs/comments (73cac92)

### Fixed
- fix(editor): enforce table headers on creation and save with custom TableTool wrapper (d5c4d5d)
- fix(docs): rename docs (7a86643)
- fix(editor): prevent code-block scroll jump on unrelated sibling mutations (558f33f)

## [0.3.3] - 2026-02-25

### Changed
- refactor(editor): remove date highlight mode and keep Cmd/Ctrl-gated date navigation (a509caa)

## [0.3.2] - 2026-02-24

### Added
- feat(editor): show date tokens as blue underlined links while Cmd/Ctrl is held (4a14c41)

### Fixed
- fix(editor): use indeterminate loading state during main-thread-blocking phases (06f0b54)
- fix(explorer): hide hidden directories from tree listing (168092c)
- fix(backlinks): detect wikilink targets correctly when alias is present (8d75bd5)
- fix(editor): delay autosave while editing virtual title (c87b3c4)
- fix(editor): open external links via system browser with tauri allowlisted command (3c2994f)
- fix(editor): force JetBrains Mono for code block textarea (7c25109)

## [0.3.1] - 2026-02-24

### Added
- feat(wikilinks): make Tab insert draft link text instead of finalizing completion (fd4e279)
- feat(wikilinks): auto-alias deep targets to last path segment on completion (8007705)

### Fixed
- fix(wikilink-menu): differentiate keyboard selection from hover state (d44e799)

## [0.3.0] - 2026-02-24

### Added
- feat(code): enable word wrap by default and add wrap toggle button (2f971d7)

### Changed
- perf(editor): batch code block UI refresh and gate wikilink sync on large notes (6f5a457)
- test(quote): cover inline markdown formatting in custom quote renderer (94d2b25)
- refactor(quote): replace editorjs quote plugin with custom multiline quote tool (8c22756)
- style(lists): increase line-height and spacing for unordered, ordered, and checklist items (544185f)
- style(code): show code block action buttons only on hover or focus (e4249d5)

### Fixed
- fix(tables): support inline markdown formatting in table cells (c92ad3c)

## [0.2.12] - 2026-02-24

### Added
- feat(ui): add platform-aware keyboard shortcuts modal accessible from palette and overflow menu (817cc0c)
- feat(palette): add editor zoom in/out/reset actions to command palette (cd39888)
- feat(ui): add zoom section to overflow menu and wire editor zoom actions (f31cfa8)

## [0.2.11] - 2026-02-23

### Added
- feat(editor): add editor-only zoom shortcuts with persisted typography scaling (5d808bd)

## [0.2.10] - 2026-02-23

### Added
- feat(editor): augment EditorJS code tool with autosize, copy feedback, and improved styling (d372862)

### Changed
- chore(fonts): confirm JetBrains Mono is loaded from Google Fonts (202235f)
- chore(editor): remove wikilink debug logging instrumentation (440c2d9)

### Fixed
- fix(markdown): render html-like unknown markup as escaped paragraph text (808481f)
- fix(editor): restore checklist checkbox vertical offset formula to plugin baseline (99a65c2)
- fix(markdown): parse indented blocks as code instead of unsupported raw (f01c709)
- fix(editor): make wikilink completion popup positioning scroll-aware (cb74d52)
- fix(editor): clamp wikilink popup position to editor viewport (7ad57d6)
- fix(editor): prevent wikilink suggestion popover text overflow (18ef08f)
- fix(markdown): avoid italic parsing for intraword underscores in wikilinks (2d5e0a7)
- fix(editor): ensure stable non-empty caret node after wikilink collapse in lists (89c2b27)
- fix(editor): preserve wikilink alias when re-editing existing links (b6747b3)
- fix(markdown): preserve nested list hierarchy when loading and round-tripping (eb192b2)
- fix(markdown): parse tables with empty header rows correctly (d9dd9d2)

## [0.2.9] - 2026-02-23

### Fixed
- fix(editor): align ordered and unordered list markers to text baseline (43a983b)

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
