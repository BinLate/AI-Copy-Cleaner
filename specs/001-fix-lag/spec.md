# Feature Specification: Restore ChatGPT Fix Lag

**Feature Branch**: `001-fix-lag`

**Created**: 2026-08-23

**Status**: Draft

**Input**: Restore the ChatGPT long-conversation trim (“Fix Lag”) in AI Copy Cleaner by porting Speed Booster Toolkit v3.0.1 network-trim behavior, per `FIX-LAG-PLAN.md`. Clean-copy is out of scope.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Long chats stay trimmed and load more (Priority: P1)

A user opens a long ChatGPT conversation with Optimizer enabled. The page stays usable: only the newest turns render, a **Tải thêm** card appears at the top, and **Tải thêm** / **Thu gọn** reload with the intended extra window. WASM trim is used; the JS fallback is silent unless WASM fails.

**Why this priority**: This is the broken product: fix-lag currently does not keep long chats short after the first expand.

**Independent Test**: Load unpacked extension, open a ChatGPT thread longer than `messageLimit`. Card **Tải thêm N lượt hỏi–đáp trước đó** appears; console has no `[AI Copy Cleaner] ...fallback` warning; `sessionStorage.aicc_fixlag_last_status` has `renderedTurns < totalTurns` plus `absoluteMessages` and `rootId`. Click **Tải thêm** → reload keeps scroll, adds `loadStep` turns, **Thu gọn** appears.

**Acceptance Scenarios**:

1. **Given** Optimizer on and a conversation longer than `messageLimit`, **When** the conversation GET returns, **Then** the visible thread is truncated and the load-more card is shown.
2. **Given** WASM is wired, **When** trim runs, **Then** `window.__AICC_NETWORK_TRIMMER_PATCHED__` is true and no fallback warning is logged.
3. **Given** the load-more card, **When** the user clicks **Tải thêm**, **Then** the page reloads, extra turns appear, scroll is restored, and **Thu gọn** is available.

---

### User Story 2 - Extra does not stick across refresh or chat switch (Priority: P2)

After expanding older turns, a manual **F5** returns to the base limit. Switching to another conversation does not inherit the previous chat’s extra window. Prefetched background conversations are trimmed without publishing status for the visible chat.

**Why this priority**: Sticky extra is the confirmed “fix lag stopped working” symptom after one **Tải thêm**.

**Independent Test**: After **Tải thêm**, press F5 (not the in-page button) → `localStorage.aicc_fixlag_extra` is null and the base limit is back. With extra > 0, open a different `/c/<id>` → new status has `extraMessages: 0`.

**Acceptance Scenarios**:

1. **Given** extra was set by **Tải thêm**, **When** the user F5s without the navigating flag, **Then** extra is removed and the base `messageLimit` applies.
2. **Given** extra > 0 on chat A, **When** the user opens chat B, **Then** extra is cleared and status for B has `extraMessages: 0`.
3. **Given** a background prefetch for another `conversation_id`, **When** that GET is trimmed, **Then** no status is published for the visible path.

---

### User Story 3 - Predictable defaults and optimizer-off (Priority: P3)

A fresh install (or seed with no saved optimizer settings) uses **15** turns and **5** load-step, matching the content-script defaults. Turning Optimizer off still reports status with no truncation. Copy-clean (Ctrl+C on a reply) still works.

**Why this priority**: Defaults of 1/1 look like “messages vanished”; optimizer-off and copy-clean are regression gates.

**Independent Test**: New profile / cleared `aicc_optimizer_settings` → popup and runtime use 15/5. Toggle Optimizer off, reload → `totalTurns == renderedTurns`, no trim. Copy a ChatGPT reply; sanitizer still produces clean HTML.

**Acceptance Scenarios**:

1. **Given** no stored optimizer settings, **When** the extension seeds storage, **Then** `{ enabled: true, messageLimit: 15, loadStep: 5 }`.
2. **Given** Optimizer disabled, **When** a long chat loads, **Then** nothing is cut and status still publishes with equal totals.
3. **Given** clean-copy enabled, **When** the user copies a reply, **Then** sanitizer behavior is unchanged.

---

### Edge Cases

- WASM missing, hash mismatch, or init timeout (~2s): fall back to existing JS `trimConversation()` and keep the extension usable.
- `mapping` or `current_node` missing: return the original conversation response uncut.
- User already saved optimizer settings: do not overwrite stored values when changing code defaults.
- `src/optimizer/**` and Speed Booster commercial features are unused and must not be wired.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Extension MUST wire `src/page/pageSetup.js` (isolated, `document_start`, first content-script) and `src/page/wasmLoader.js` (MAIN, before `mainWorld.js`) plus `web_accessible_resources` for `src/wasm/build/trimmer.wasm` and `wasmLoader.js` on ChatGPT hosts.
- **FR-002**: `pageSetup.js` MUST set `dataset.csbExtensionUrl`, `dataset.csbExtensionId`, and FNV-1a `dataset.csbFh` for `wasmLoader.js` without writing `csb_*` storage keys.
- **FR-003**: `pageSetup.js` MUST remove `aicc_fixlag_extra` on load unless `sessionStorage.aicc_fixlag_navigating === '1'`.
- **FR-004**: MAIN-world trim MUST keep `aicc_fixlag_config`, `aicc_fixlag_extra`, `aicc_fixlag_last_status` and existing JS trim as fallback.
- **FR-005**: Conversation GET handling MUST wait for WASM ready (timeout ~2s), strip BOM, guard mapping/`current_node`, prefetch-guard by pathname id, reset extra on conversation switch, WASM-trim then merge skeleton, else JS fallback.
- **FR-006**: Status payload MUST keep existing fields and add `absoluteMessages` and `rootId`.
- **FR-007**: `reloadWithExtra()` in `src/content/index.js` MUST set `sessionStorage.aicc_fixlag_navigating` to `'1'` before reload.
- **FR-008**: Default optimizer seed in `src/background/background.js` and `src/popup/popup.js` MUST be `{ enabled: true, messageLimit: 15, loadStep: 5 }`.
- **FR-009**: When `config.enabled === false`, MUST NOT trim; MUST still publish uncut status.
- **FR-010**: MUST NOT change clean-copy files, MUST NOT enable `src/optimizer/**`, MUST NOT port Speed Booster quota/license/donation/export.

### Key Entities

- **Optimizer settings**: `chrome.storage.local` `aicc_optimizer_settings` — `enabled`, `messageLimit`, `loadStep`.
- **Fix-lag config**: `localStorage` `aicc_fixlag_config` — `enabled`, `messageLimit` (bridge to MAIN world).
- **Extra window**: `localStorage` `aicc_fixlag_extra` — `{ url, extra }`; navigating flag `sessionStorage` `aicc_fixlag_navigating`.
- **Trim status**: `postMessage` `aicc-fixlag-status` / `sessionStorage` `aicc_fixlag_last_status`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a thread longer than `messageLimit`, the load-more card appears on first paint after reload unpacked.
- **SC-002**: After one **Tải thêm**, a manual F5 returns to the base limit (`aicc_fixlag_extra` absent).
- **SC-003**: Switching chats with extra > 0 yields `extraMessages: 0` on the new chat.
- **SC-004**: Fresh seed defaults are 15 / 5; copy-clean still works on a reply.

## Assumptions

- Diagnosis in `FIX-LAG-PLAN.md` is the source of truth; live Bước 0 confirms it before coding if the machine is available.
- `src/wasm/build/trimmer.wasm` may be missing in the working tree and MUST be restored from Speed Booster Toolkit if absent.
- `wasmLoader.js` stays byte-compatible with `csb*` dataset names.
- No automated test suite is requested; verification is manual in Chrome unpacked + ChatGPT.
