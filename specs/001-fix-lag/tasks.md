# Tasks: Restore ChatGPT Fix Lag (gap-close)

**Input**: Design documents from `/specs/001-fix-lag/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Not requested — no TDD tasks. Validation is manual per quickstart.md.

**Organization**: First wiring pass is already in the tree. This list is the **gap-close** so old turns actually hide on ChatGPT 2026. Tasks grouped by user story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 / US2 / US3 from spec.md
- Include exact file paths in descriptions

## Path Conventions

Chrome MV3 at repo root: `manifest.json`, `src/page/mainWorld.js`, `src/content/index.js`. Do not edit `src/optimizer/**`, `src/utils/sanitizer.js`, `src/content/inject.js`, `src/content/content.js`, or `src/page/wasmLoader.js`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm first-pass wiring is still the runtime truth (manifest is truth)

- [x] T001 Confirm `manifest.json` still prepends isolated `src/page/pageSetup.js`, MAIN `src/page/wasmLoader.js` then `src/page/mainWorld.js`, and `web_accessible_resources` for `src/wasm/build/trimmer.wasm`
- [x] T002 [P] Confirm `src/page/wasmLoader.js` is unmodified (SB `verifyExtensionId` may fail; that is expected per research.md)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Strict tree-GET intercept and no WASM stall — required before hide/load-more works

**⚠️ CRITICAL**: No user story work until this phase is complete

- [x] T003 Replace loose `url.includes('/backend-api/conversation')` with pathname regex `^/backend-api/(conversation|shared_conversation)/[^/]+/?$`, GET-only, JSON `content-type`, fail-open if no `mapping`/`current_node`, in `src/page/mainWorld.js` per `specs/001-fix-lag/contracts/conversation-get.md`
- [x] T004 Skip the 2s `waitForWasm` in `src/page/mainWorld.js` when `window.__AICC_WASM_INITIALIZED__` is not true; keep wait only if WASM init succeeded
- [x] T005 Expose diagnostic fields on `window` from `src/page/mainWorld.js` for quickstart.md: keep `__AICC_NETWORK_TRIMMER_PATCHED__`, `__AICC_WASM_INITIALIZED__`, and last skip reason (`no-mapping`, `not-json`, `disabled`, `no-visible-trim`, `not-tree-get`)

**Checkpoint**: Tree GET matcher is exact; failed WASM no longer delays every conversation load

---

## Phase 3: User Story 1 - Long chats stay trimmed and load more (Priority: P1) 🎯 MVP

**Goal**: Opening a long thread renders only the newest `messageLimit` visible turns; **Tải thêm** appears; JS trim works even when WASM is false

**Independent Test**: Unpacked reload, long `/c/{id}`. Oldest turns not in the scroll list. Card **Tải thêm**. `sessionStorage.aicc_fixlag_last_status` has `renderedTurns < totalTurns`, `hasOlderMessages: true`, `absoluteMessages`, `rootId`. `__AICC_WASM_INITIALIZED__ === false` is OK.

### Implementation for User Story 1

- [x] T006 [US1] Treat visible nodes as any `author.role` not in `{system, tool, thinking}` in `src/page/mainWorld.js` (replace user-only `isVisibleMessage`)
- [x] T007 [US1] Count **turns as role transitions** on the current path; keep original root; keep hidden/tool/thinking nodes inside the kept suffix in `src/page/mainWorld.js` (LightSession algorithm; extra still `messageLimit + extra`)
- [x] T008 [US1] If `visibleKept === visibleTotal`, return the original `Response` untouched in `src/page/mainWorld.js` (do not rewrite the tree)
- [x] T009 [US1] When pathname is `/c/{id}` and no tree GET was intercepted, bootstrap `GET /backend-api/conversation/{id}` via the patched `window.fetch` in `src/page/mainWorld.js` per `specs/001-fix-lag/contracts/conversation-get.md`
- [x] T010 [US1] Publish `aicc-fixlag-status` from `src/page/mainWorld.js` per `specs/001-fix-lag/contracts/status-bridge.md` so `src/content/index.js` can render **Tải thêm** / **Thu gọn** (keep navigating flag already in `reloadWithExtra`)

**Checkpoint**: US1 — long chat is visually truncated without DOM hiding

---

## Phase 4: User Story 2 - Extra does not stick across refresh or chat switch (Priority: P2)

**Goal**: **Tải thêm** still expands; F5 returns to base limit; chat switch and prefetch do not leak extra or steal status

**Independent Test**: After **Tải thêm**, F5 → `localStorage.aicc_fixlag_extra` is null. Switch `/c/{id}` with extra > 0 → new status `extraMessages: 0`. Prefetch other id → no status for the visible URL.

### Implementation for User Story 2

- [x] T011 [US2] Keep prefetch guard (path `/c/{id}` vs `conversation_id`), conversation-switch extra reset, and extra=`getExtra()` in `src/page/mainWorld.js` after the new matcher
- [x] T012 [P] [US2] Confirm `src/page/pageSetup.js` still clears `aicc_fixlag_extra` unless `aicc_fixlag_navigating === '1'` then consumes the flag (F5 handshake)

**Checkpoint**: US1 + US2 — hide window and extra lifecycle both work

---

## Phase 5: User Story 3 - Predictable defaults and optimizer-off (Priority: P3)

**Goal**: Defaults stay 15/5; Optimizer off does not trim; copy-clean unchanged

**Independent Test**: Cleared settings → 15/5. Booster off → `totalTurns == renderedTurns`, full thread. Copy a reply still sanitizes.

### Implementation for User Story 3

- [x] T013 [P] [US3] Confirm `DEFAULT_OPT = { enabled: true, messageLimit: 15, loadStep: 5 }` remains in `src/background/background.js` and `src/popup/popup.js` (do not overwrite stored settings)
- [x] T014 [US3] After trim rewrite, `config.enabled === false` still returns original Response and publishes uncut status in `src/page/mainWorld.js`

**Checkpoint**: All stories independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Scope lock and live proof from quickstart.md

- [x] T015 Confirm no DOM/`display:none` hide path and no edits to `src/optimizer/**`, `src/utils/sanitizer.js`, `src/content/inject.js`, `src/content/content.js`, `src/page/wasmLoader.js`
- [x] T016 Add XMLHttpRequest intercept in `src/page/mainWorld.js` **only if** quickstart Network tab shows the tree GET as XHR instead of fetch; otherwise skip and note in `specs/001-fix-lag/quickstart.md`
- [ ] T017 Run `specs/001-fix-lag/quickstart.md` scenarios 1–5 on chatgpt.com (unpacked reload): hidden turns, WASM-false OK, Tải thêm/F5, chat switch, optimizer-off + copy-clean

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Immediate
- **Foundational (Phase 2)**: After Setup — BLOCKS stories; T003 → T004 → T005 in `src/page/mainWorld.js`
- **US1 (Phase 3)**: After Foundational; T006 → T010 same file sequential
- **US2 (Phase 4)**: After US1 trim rewrite (T011 same file); T012 can overlap T011
- **US3 (Phase 5)**: T013 anytime after Setup; T014 after T007/T008
- **Polish**: T015 anytime; T016 after T017 diagnose or during T017; T017 last

### User Story Dependencies

- **US1 (P1)**: After Foundational — MVP hide + load more
- **US2 (P2)**: Extra handshake on top of US1 matcher
- **US3 (P3)**: Defaults already shipped; T014 must survive US1 rewrite

### Parallel Opportunities

- T001 ∥ T002
- T012 ∥ T011 (different files)
- T013 ∥ any US1 work
- Do **not** parallelize T003–T011 (`src/page/mainWorld.js`)

---

## Parallel Example: Setup

```text
Task: "Confirm manifest.json still wires pageSetup + wasmLoader + WAR"
Task: "Confirm src/page/wasmLoader.js is unmodified"
```

---

## Parallel Example: User Story 3

```text
Task: "Confirm DEFAULT_OPT 15/5 in src/background/background.js and src/popup/popup.js"
```

(T014 waits on mainWorld rewrite.)

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup
2. Phase 2 Foundational (strict GET + no WASM stall)
3. Phase 3 US1 (JS turn-trim + bootstrap GET + status)
4. **STOP**: long chat must hide old turns
5. Then US2 / US3 / T017

### Incremental Delivery

1. Matcher + no WASM wait → intercept is correct
2. US1 JS trim + bootstrap → lag gone
3. US2 extra/F5/switch
4. US3 optimizer-off + copy-clean
5. T017 live on chatgpt.com

---

## Notes

- [P] = different files, no unfinished deps
- WASM false is success if JS hides turns
- No `wasmLoader.js` rewrite; no new WASM; no DOM hide as default
- Commit only if the user asks
- Regenerate this file replaced the first-pass T001–T016 checklist (that wiring is assumed done)
