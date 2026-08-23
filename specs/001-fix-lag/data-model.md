# Data model: Fix-lag window

## ConversationTree

Loaded by `GET /backend-api/conversation/{id}`.

| Field | Type | Rules |
| --- | --- | --- |
| `mapping` | map id → node | Required to trim. Node: `parent`, `children[]`, optional `message.author.role`, `message.metadata` |
| `current_node` | string | Leaf of the active branch; walk `parent` to root |
| `root` | string | Must remain the original non-visible root after trim |
| `conversation_id` | string | Used for prefetch vs visible path and bootstrap GET |

**Validation**: If `mapping` or `current_node` missing, pass the response through (fail-open).

## VisibleTurn

A contiguous run of **visible** nodes with the same `author.role`. Hidden roles: `system`, `tool`, `thinking`. Root nodes with no role are not turns.

**Keep window**: last `messageLimit + extra` visible turns on the current path, plus all hidden/tool nodes that sit inside that suffix, plus original root.

## OptimizerSettings

`chrome.storage.local` `aicc_optimizer_settings`

| Field | Type | Default | Range |
| --- | --- | --- | --- |
| `enabled` | boolean | true | — |
| `messageLimit` | int | 15 | 1–200 |
| `loadStep` | int | 5 | 1–50 |

Do not overwrite existing stored values when code defaults change.

## FixLagConfig (MAIN bridge)

`localStorage` `aicc_fixlag_config` → `{ enabled, messageLimit }`. Written by isolated `src/content/index.js`.

## ExtraWindow

| Key | Store | Shape |
| --- | --- | --- |
| `aicc_fixlag_extra` | localStorage | `{ url, extra }` only if `url === location.href` |
| `aicc_fixlag_navigating` | sessionStorage | `'1'` one-shot around **Tải thêm** reload |

**Transitions**

- Load more → set extra, set navigating, reload → pageSetup keeps extra, clears navigating.
- Manual F5 → navigating absent → extra removed.
- SPA switch to another `conversation_id` → extra + navigating cleared in MAIN.

## TrimStatus

`postMessage` `{ type: 'aicc-fixlag-status', payload }` and `sessionStorage` `aicc_fixlag_last_status`.

| Field | Meaning |
| --- | --- |
| `url` | Must equal `location.href` or content script ignores it |
| `totalTurns` / `renderedTurns` | Visible role-transitions before/after trim |
| `hasOlderMessages` | `totalTurns > renderedTurns` — drives **Tải thêm** |
| `extraMessages` | Current extra |
| `absoluteMessages` | Visible nodes on original path |
| `rootId` | Original root |
| `conversationId` | Tree id |

**Guard**: Prefetch (response id not in `/c/{id}`) → trim with extra=0, **do not** publish status.

## ProxyHealth (diagnostic)

`window.__AICC_NETWORK_TRIMMER_PATCHED__`  
`window.__AICC_WASM_INITIALIZED__` (may be false; JS trim must still run)  
Optional: last matched GET pathname, last skip reason (`no-mapping`, `not-json`, `disabled`, `no-visible-trim`).
