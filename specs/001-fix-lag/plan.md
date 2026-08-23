# Implementation Plan: Restore ChatGPT Fix Lag

**Branch**: `001-fix-lag` | **Date**: 2026-08-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-fix-lag/spec.md`. Live report: chatgpt.com still lags; older turns are **not** hidden. Online research in [research.md](./research.md).

**Note**: First code pass (WASM wire + extra handshake + defaults 15/5) is in tree. This plan is the **gap-close** so US1 actually hides turns on current ChatGPT (2026).

## Summary

Lag in long ChatGPT threads is the browser holding the full message tree in React/DOM. Industry fix in 2025–2026 is **fetch proxy**: rewrite `GET /backend-api/conversation/{id}` JSON **before** React, not hide nodes after paint (ChatGPT virtualization puts them back). Speed Booster WASM is origin-locked to SB’s extension id, so AICC must **JS-trim reliably** (LightSession: role-transition turns, keep root + hidden nodes) and **bootstrap** that GET if the SPA never fires it. Do not DOM-scrape as primary. Manual “new chat + summary” is fallback only.

## Technical Context

**Language/Version**: Vanilla JavaScript (Chrome MV3, no bundler)

**Primary Dependencies**: Chrome `chrome.storage` / `chrome.runtime.getURL`; patched `window.fetch` in MAIN world; optional `window.WasmTrimmer` (best-effort)

**Storage**: `chrome.storage.local` `aicc_optimizer_settings`; `localStorage` `aicc_fixlag_config` / `aicc_fixlag_extra`; `sessionStorage` navigating + last status

**Testing**: Manual unpacked + DevTools probes in [quickstart.md](./quickstart.md) (no automated suite)

**Target Platform**: Chrome; `https://chatgpt.com/*`, `https://chat.openai.com/*`

**Project Type**: Browser extension (single project)

**Performance Goals**: React hydrates ≤ `messageLimit + extra` visible turns; no 2s WASM wait when WASM already failed

**Constraints**: Constitution — this folder only; fix-lag files only; keep `aicc_*` keys; `csb*` dataset only for wasmLoader; no new host permissions; WAR already present for wasm; no commit unless asked

**Scale/Scope**: Gap-close in `src/page/mainWorld.js` (matcher, JS trim, bootstrap, skip WASM delay); light `src/content/index.js` if overlay/status needs skip-reason; no clean-copy / `src/optimizer/**`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] I. Single writable target — `Extension/AI-Copy-Cleaner` only
- [x] II. Two products — fix-lag only; sanitizer / inject / content.js untouched
- [x] III. Manifest is runtime truth — keep pageSetup + wasmLoader + mainWorld wired; do not resurrect `src/optimizer/**`
- [x] IV. World isolation — MAIN fetch proxy; isolated overlay/settings; `aicc_*` + existing `csb*` dataset
- [x] V. Minimal diff — no new permissions; bootstrap uses same-origin GET; no DOM-hide primary path

**Post-design**: still pass. Contracts are intercept/status only. WAR unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/001-fix-lag/
├── spec.md
├── plan.md              # this file
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── conversation-get.md
│   └── status-bridge.md
└── tasks.md             # regenerate with /speckit-tasks after this plan
```

### Source Code (repository root)

```text
manifest.json                          # already wires pageSetup, wasmLoader, WAR
src/page/pageSetup.js                  # dataset + extra F5 handshake (keep)
src/page/wasmLoader.js                 # unmodified; WASM may fail verify — OK
src/page/mainWorld.js                  # GAP-CLOSE: strict GET, JS turn-trim, bootstrap, no WASM stall
src/content/index.js                   # overlay; optional last skip-reason
src/background/background.js           # DEFAULT_OPT 15/5 (done)
src/popup/popup.js                     # DEFAULT_OPT 15/5 (done)
src/optimizer/**                       # dead; do not edit
Speed Booster Toolkit for ChatGPT/     # reference only
```

**Structure Decision**: Single MV3 extension. Change MAIN trim path; do not add a second product tree.

## Complexity Tracking

No constitution violations.

## Phase 0 / 1 artifacts

- [research.md](./research.md) — online + WASM origin-lock + SPA bootstrap
- [data-model.md](./data-model.md)
- [contracts/conversation-get.md](./contracts/conversation-get.md)
- [contracts/status-bridge.md](./contracts/status-bridge.md)
- [quickstart.md](./quickstart.md)

## Gap-close implementation (after `/speckit-tasks`)

1. **Live diagnose** (user tab): probes in quickstart. Record: patched flag, WASM flag, tree GET present, `hasOlderMessages`.
2. **Strict matcher** in `src/page/mainWorld.js`: LightSession regex; JSON content-type; fail-open if no mapping.
3. **JS trimmer** aligned with LightSession: hidden roles `system|tool|thinking`; turn = role change; keep original root; keep hidden nodes in suffix; if `visibleKept === visibleTotal` return original Response.
4. **Stop paying WASM tax**: if `__AICC_WASM_INITIALIZED__` is false, do not `await` 2s on every conversation GET; JS trim immediately. Keep WASM path if init succeeds.
5. **Bootstrap GET** ` /backend-api/conversation/{id}` from pathname `/c/{id}` when no tree intercept ran (SPA hydrate).
6. **Optional XHR wrap** only if Network shows the tree as XHR not fetch.
7. **Verify** quickstart scenarios 1–5. Do not hide via CSS/DOM as default.

## Non-goals

- Port SB quota/license/donation/export
- Start-new-chat as the main UX
- Fighting ChatGPT scrollbar prompt-index with DOM observers
- Rewriting `wasmLoader.js` / new WASM binary

## Next command

`/speckit-tasks` then `/speckit-implement` for the gap-close only.
