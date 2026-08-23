# AI Copy Cleaner Constitution

## Core Principles

### I. Single Writable Target
This folder (`Extension/AI-Copy-Cleaner`) is the only writable root. Sibling projects under `Vibe Code` stay untouched unless the user names them. Do not “clean up” unrelated apps or the parent `Extension/` Spec Kit install.

### II. Two Products, One Extension
Keep the two jobs separate in code and specs:

- **Clean copy** — sanitize copied AI HTML (`src/utils/sanitizer.js`, `src/content/content.js`, `src/content/inject.js`, popup preview/export).
- **Fix lag** — trim long ChatGPT conversations (`src/page/*`, `src/content/index.js`, optimizer settings in popup/background).

A feature must say which job it touches. Do not mix storage keys, message types, or content-script worlds across jobs without an explicit spec.

### III. Manifest Is the Runtime Truth
Only scripts listed in `manifest.json` run. `src/optimizer/**` and the vendored `Speed Booster Toolkit for ChatGPT/` tree are reference/dead unless a spec wires them. Do not “fix” unused files and call the product fixed.

### IV. World Isolation
Respect Chrome MV3 worlds:

- **MAIN world** patches page `fetch` / DOM on chatgpt.com (and listed hosts).
- **Isolated world** talks to `chrome.storage`, `chrome.runtime`, and UI overlays.
- Bridge via `postMessage`, `dataset`, or `localStorage`/`sessionStorage` keys already used (`aicc_*`). Do not invent a second protocol.

Preserve existing keys (`aicc_optimizer_settings`, `aicc_fixlag_config`, `aicc_fixlag_extra`, `aicc_fixlag_navigating`, etc.) unless the spec migrates them.

### V. Minimal Diff, Honest Permissions
Change the smallest set of files. Do not add host permissions, `web_accessible_resources`, or WASM unless required. Do not commit or push unless the user asks. Do not treat Speed Booster internals as user-facing brand (keep AICC names in UI and storage).

## Project Constraints

- **Stack**: Chrome Manifest V3 extension, vanilla JavaScript (no Next.js / React / Tailwind for this project). Popup is HTML/CSS/JS.
- **Hosts**: ChatGPT (`chatgpt.com`, `chat.openai.com`) for fix-lag; Gemini (`gemini.google.com`) only where clean-copy already matches.
- **Permissions**: Prefer existing `storage` + `activeTab`. Justify any new permission in the spec.
- **Scope lock**: Specs live under `specs/`. Implementation targets files already in this tree.
- **Git**: Optional commit only on explicit request. No `--no-verify`, no force push.

## Development Workflow

1. `/speckit-constitution` (this file) → `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`
2. Use `/speckit-clarify` when requirements are fuzzy, before plan.
3. Optional: `/speckit-checklist` after plan; `/speckit-analyze` after tasks.
4. Run Spec Kit scripts from this folder. Do not use `Extension/.specify` or the monorepo-root `.specify`.
5. Load unpacked in Chrome and verify the touched flow (copy and/or long-chat lag) before calling a feature done.

## Governance

- This constitution supersedes informal notes (including `FIX-LAG-PLAN.md`) when they conflict with a feature spec; the spec may cite that plan as input.
- Amendments require updating this file with version bump and date.
- Cross-project edits, unused-file “fixes”, or new permissions without a spec are gate failures.

**Version**: 1.0.0 | **Ratified**: 2026-08-23 | **Last Amended**: 2026-08-23
