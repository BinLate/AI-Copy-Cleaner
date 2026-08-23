# Quickstart: prove Fix Lag on a long ChatGPT thread

This is a **validation** guide, not implementation. Use a long thread (well over 15 hỏi–đáp).

## Prerequisites

1. Chrome → `chrome://extensions` → **Load unpacked** → folder `Extension/AI-Copy-Cleaner` (this project).
2. Click **Reload** after every code change.
3. Popup: **Long Chat Speed Booster** ON, lượt hiển thị **15** (or lower). If you previously saved `1`, that was hiding almost everything — for this test use 10–15.
4. Hard-refresh the ChatGPT tab (`Ctrl+Shift+R`) so MAIN scripts re-inject.

## Setup probes (console on chatgpt.com)

```js
window.__AICC_NETWORK_TRIMMER_PATCHED__   // expect true
window.__AICC_WASM_INITIALIZED__          // may be false (SB WASM is origin-locked)
window.__AICC_TRIM_SKIP__                 // null when a trim rewrite happened; else no-mapping | not-json | disabled | no-visible-trim | not-tree-get
window.__AICC_TRIM_LAST__                 // { via, limit, extra, totalTurns, keptTurns, trimmed }
localStorage.getItem('aicc_fixlag_config')
sessionStorage.getItem('aicc_fixlag_last_status')
```

Network tab filter: `conversation`. You want a **GET** whose path is exactly `/backend-api/conversation/<uuid>` (JSON), not `conversations` and not `f/conversation` (POST stream).

Intercepts **only** `window.fetch` for that tree GET. Do not patch `JSON.parse`, `Response.prototype`, or `XMLHttpRequest` — those break the ChatGPT shell (empty sidebar).

## Scenarios

### 1. Old turns hidden (the current failure)

- Open the long `/c/{id}` thread.
- Expect: only the newest ~15 turns in the scroll area; card **Tải thêm** at the top.
- Fail: full history still on screen → note whether GET tree exists, whether `last_status.hasOlderMessages` is true, whether Optimizer is on.

### 2. WASM vs JS

- `__AICC_WASM_INITIALIZED__ === false` is OK if turns are still hidden.
- Fail: WASM false **and** all turns visible → intercept or JS trim not running.

### 3. Load more / F5

- **Tải thêm** → extra turns, **Thu gọn** appears.
- Manual F5 → extra gone (`localStorage.aicc_fixlag_extra` null), back to base limit.

### 4. Switch chat

- Expand extra, open another thread → `extraMessages: 0`.

### 5. Optimizer off + copy-clean

- Toggle booster off, reload → full thread, no trim.
- Copy a reply → clean HTML still works.

## Manual fallback (not the product)

If the tab is unusable before the extension loads: summarize in a **new** chat (OpenAI’s own advice). That is continuity, not a substitute for fetch-proxy.

## Next

Reload unpacked after gap-close. If old turns still show, record `__AICC_TRIM_SKIP__` and whether the tree GET is fetch vs XHR.
