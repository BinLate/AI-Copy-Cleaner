# GET conversation tree (ChatGPT web)

ChatGPT web loads a thread with:

```http
GET /backend-api/conversation/{conversation_id}
Accept: application/json
Cookie: <chatgpt session>
```

Optional share:

```http
GET /backend-api/shared_conversation/{share_id}
```

## Must intercept

- Method `GET`
- Pathname matches `^/backend-api/(conversation|shared_conversation)/[^/]+/?$`
- `Content-Type` includes `application/json`
- Body has `mapping` object and string `current_node`

## Must not intercept

- `GET /backend-api/conversations` (sidebar list)
- `GET /backend-api/conversation/{id}/stream_status`
- `GET /backend-api/conversation/{id}/textdocs`
- `POST /backend-api/conversation` or `POST /backend-api/f/conversation` (SSE new reply)

## Rewrite

If visible turns on the current path exceed `messageLimit + extra`:

- Return `200` with JSON `{ ...original, mapping: trimmed, current_node, root }`
- Strip `content-length` and `content-encoding`; set `content-type: application/json; charset=utf-8`
- Preserve `Response.url`

If nothing to trim, return the **original** Response (do not rewrite hidden nodes away).

On parse/trim error, return the original Response (fail-open).

## Bootstrap (if SPA never issued the tree GET)

From MAIN world, after `/c/{id}` is known:

```http
GET /backend-api/conversation/{id}
```

via the **patched** `window.fetch` so the same trim applies. No extra permissions.
