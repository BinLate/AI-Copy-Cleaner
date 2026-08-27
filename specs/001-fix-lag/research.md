# Research: Restore ChatGPT Fix Lag (live gap)

**Feature**: `001-fix-lag`  
**Date**: 2026-08-23  
**Trigger**: User reports chatgpt.com still lags; older turns remain visible after the first implement.

## Symptom

Opening a long ChatGPT thread still renders the full history. The **Tải thêm** hide-window is not taking effect. This is a **client render** problem (DOM/React holding every turn), not “the model is slow because of context.”

## Decision: Trim JSON before React, never hide after paint

- **Decision**: Keep fetch-proxy (rewrite GET conversation JSON) as the only lag fix. Do not add MutationObserver / `display:none` on old turns as the primary fix.
- **Rationale**: Independent 2025–2026 writeups agree DOM-after-render is too late: React already parsed a huge `mapping`, and ChatGPT’s own virtualization (`data-scroll-root`, prompt-index ticks on the scrollbar) **re-shows** hidden turns. LightSession explicitly **removed** DOM compactors in v1.5.0 and replaced them with fetch proxy. ChatGPTConversationPruner and ChatSpeed (Medium, Danish) use the same graft: intercept → prune graph → new `Response`.
- **Alternatives considered**: Hide `article[data-testid^=conversation-turn-]` after paint (fails under ChatGPT virtualization, GitHub `ai-chat-speed-booster` #24). Ask the user to start a new chat (OpenAI/blog advice — works but abandons the thread). CSS containment-only (helps paint, does not shrink the tree).

Sources: [LightSession](https://github.com/11me/light-session), [LightSession v1.5.0 commit](https://github.com/11me/light-session/commit/ec8bd08da49a456ff5201775c22f8f2af886476b), [ChatSpeed / network graft](https://medium.com/@danishcodes/how-i-fixed-chatgpts-long-chat-lag-with-a-surgical-network-graft-65c9b0f730b5), [OpenAI community Speed Booster thread](https://community.openai.com/t/better-fix-for-chatgpt-lag-freezing-in-long-chats-local-chrome-extension/1372183), [ai-chat-speed-booster #24](https://github.com/Noah4ever/ai-chat-speed-booster/issues/24).

## Decision: Match the tree GET only — `GET /backend-api/conversation/{id}`

- **Decision**: Intercept **only** JSON GET of the conversation tree: pathname `/backend-api/conversation/{uuid}` (and optionally `shared_conversation`). Exclude `/conversations` list, `/conversation/{id}/stream_status`, `/textdocs`, and POST SSE `/backend-api/f/conversation`.
- **Rationale**: Current AICC matcher is `url.includes('/backend-api/conversation') && !url.includes('/backend-api/conversations')`. That still hits extra GETs under `/conversation/{id}/…`. LightSession uses  
  `^/backend-api/(conversation|shared_conversation)/[^/]+/?$`. Live load of a thread is still documented as `GET /backend-api/conversation/<uuid>` (Chrome Network tab; export tools). POST `/backend-api/f/conversation` is the **stream of new tokens**, not the history dump — trimming it would break typing, not hide old turns.
- **Alternatives considered**: Intercept all `/backend-api/*` (overhead, delay). Patch POST SSE (wrong payload).

Sources: LightSession `isConversationRequest`, [chatgpt-export](https://github.com/svandragt/chatgpt-export), [cloro SSE path note](https://cloro.dev/blog/scrape-chatgpt/).

## Decision: Do not depend on Speed Booster WASM for AICC

- **Decision**: Treat `window.WasmTrimmer.initialize()` as **best-effort**. If it fails, JS trim **must** still hide turns. Next implement should log `__AICC_WASM_INITIALIZED__` and prefer a JS trimmer aligned with LightSession (turn = role transition, keep original root, keep hidden/tool/thinking nodes in the kept suffix).
- **Rationale**: `wasmLoader.js` calls `verifyExtensionId(extensionUrl + "|" + csbFh)`. The WASM binary is Speed Booster’s; it is keyed to **their** `chrome-extension://` origin. AICC’s origin almost certainly fails verification → `initialize()` returns false → WASM never trims. That is expected. Live “nothing hidden” therefore cannot be blamed on WASM alone; **JS fallback or missed intercept** is the gap.
- **Alternatives considered**: Keep waiting 2s for WASM on every conversation GET (adds lag if WASM always fails). Port a new WASM build (out of scope).

## Decision: If the tree GET never runs, force it (bootstrap sync)

- **Decision**: After detecting `/c/{conversationId}` (or SPA URL change), if no trimmed tree GET was seen, issue `GET /backend-api/conversation/{id}` from the **already-patched** `window.fetch` (LightSession `attemptAuthoritativeConversationSync`). Same-origin cookies apply; no new host permission.
- **Rationale**: ChatGPT SPA can hydrate a thread from cache, a non-tree request, or a fetch that happened before the proxy. User then sees **all** turns. LightSession retries this GET on a delay list so React receives a trimmed tree.
- **Alternatives considered**: Reload the tab only (user already did). Patch XHR too (add if diagnostics show XHR, not fetch).

## Decision: Count turns like ChatGPT bubbles, not only `user` nodes

- **Decision**: Visible = any `author.role` **not** in `{system, tool, thinking}`. A **turn** is a **role transition** on the current-path (LightSession). Keep the original root node (often no role) as `root`.
- **Rationale**: AICC JS trim counts `user` messages as turns and `user|assistant` as visible. ChatGPT 2026 threads add thinking/tool nodes and multi-node bubbles. Wrong counts can yield `hasOlderMessages: false` and return the **original** mapping → **nothing hidden**. That matches the user’s report.
- **Alternatives considered**: Keep user-only counting (status card wording vs actual hide mismatch).

## Decision: Diagnose on the live tab before more wiring

- **Decision**: First validation is DevTools on chatgpt.com (see `quickstart.md`): `__AICC_NETWORK_TRIMMER_PATCHED__`, `__AICC_WASM_INITIALIZED__`, `aicc_fixlag_config`, last status, Network filter `conversation`.
- **Rationale**: Constitution requires unpacked verify. First implement was never live-checked (T016 open). User report is that evidence.
- **Alternatives considered**: Guess and rewrite WASM again.

## Decision: Workflow advice is secondary, not the product

- **Decision**: Document “new chat + summary” as a **manual fallback** in quickstart only. The product remains: stay in the long thread with a trimmed render window.
- **Rationale**: OpenAI troubleshooting and blogs tell users to start a fresh chat. That avoids lag without an extension but fails the spec (keep the same `/c/{id}` usable).

Sources: [LaoZhang long-conversation fix](https://blog.laozhang.ai/en/posts/chatgpt-slow-long-conversation-fix), [tecnoyfoto handoff](https://tecnoyfoto.com/en/chatgpt-slow-switch-chat-without-losing-context).

## Resolved unknowns

| Unknown | Resolution |
| --- | --- |
| Does ChatGPT still GET the mapping tree? | Yes: `GET /backend-api/conversation/{uuid}` (2026 export/devtools guides). |
| Why WASM may be a no-op on AICC | `verifyExtensionId` is SB-origin-locked. |
| Why DOM hide fails now | ChatGPT virtualization re-renders hidden turns. |
| Why all turns still show | Missed/strict GET, JS turn-count too strict, or SPA hydrate without tree GET. |
