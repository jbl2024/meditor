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
