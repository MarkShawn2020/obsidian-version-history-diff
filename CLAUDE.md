# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Obsidian plugin that displays diffs for version history from:
- Obsidian Sync (core plugin)
- File Recovery (core plugin)
- Git (via Obsidian Git plugin)

Uses private Obsidian APIs - may break with Obsidian updates.

## Commands

```bash
pnpm dev          # Dev build with watch mode
pnpm build        # Production build (minified, no sourcemaps)
pnpm lint         # ESLint
pnpm format       # Prettier
```

Build outputs to `build/` directory (main.js, styles.css, manifest.json).

## Architecture

```
src/
├── main.ts              # Plugin entry point, registers commands
├── abstract_diff_view.ts # Base Modal class for all diff views
├── diff_view.ts         # Sync version diff (extends DiffView)
├── recovery_diff_view.ts # File Recovery diff (extends DiffView)
├── git_diff_view.ts     # Git diff (extends DiffView)
├── diff_utils.ts        # Shared diff utilities
├── file_modal.ts        # Modal for rendering single version
├── settings.ts          # Plugin settings tab
├── interfaces.ts        # TypeScript interfaces + Obsidian API extensions
├── constants.ts         # Shared constants
└── styles.scss          # SCSS styles (compiled to CSS by esbuild)
```

Key pattern: `DiffView` (abstract_diff_view.ts) is the base class. Concrete implementations (SyncDiffView, RecoveryDiffView, GitDiffView) override `getInitialVersions()` and `appendVersions()`.

## Private APIs

This plugin extends Obsidian's type definitions in `interfaces.ts` to access:
- `app.internalPlugins.plugins.sync.instance` - Sync version history
- `app.internalPlugins.plugins['file-recovery'].instance.db` - File Recovery IndexedDB
- `app.plugins.plugins['obsidian-git'].gitManager` - Obsidian Git integration

## Dependencies

- `diff` (jsdiff) - Generate unified diffs
- `diff2html` - Render diffs as HTML
