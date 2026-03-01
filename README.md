# tomosona

tomosona is a local-first desktop Markdown workspace built with Tauri 2, Vue 3, and Rust.

At a high level, it provides:
- Local folder-based notes and files
- Markdown editing and navigation
- Full-text search across your workspace
- Daily-note and wiki-link workflows
- Cross-platform desktop packaging through Tauri

## Requirements
- Node.js 20+ (22+ recommended)
- npm
- Rust stable toolchain
- Tauri system prerequisites for your OS
  - macOS: Xcode Command Line Tools
  - Linux: WebKitGTK and related Tauri dependencies

## Install
```bash
npm install
```

## Run

Frontend only (web dev server):
```bash
npm run dev
```

Desktop app (Tauri dev):
```bash
npm run tauri:dev
```

## Build

Frontend production bundle:
```bash
npm run build
```

Desktop app bundle/installers:
```bash
npm run tauri:build
```
