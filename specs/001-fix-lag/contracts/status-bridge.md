# Status bridge (page → content script)

## Event

```text
window.postMessage({ type: 'aicc-fixlag-status', payload }, '*')
```

`src/content/index.js` accepts only `event.source === window` and `payload.url === location.href`.

## Payload (minimum)

```json
{
  "url": "https://chatgpt.com/c/<id>",
  "totalTurns": 80,
  "renderedTurns": 15,
  "totalMessages": 80,
  "renderedMessages": 15,
  "hasOlderMessages": true,
  "extraMessages": 0,
  "baseLimit": 15,
  "absoluteMessages": 160,
  "rootId": "<uuid>",
  "conversationId": "<uuid>"
}
```

`index.js` uses `totalTurns ?? totalMessages` and `renderedTurns ?? renderedMessages` for the **Tải thêm** card.

## Persistence

Mirror JSON to `sessionStorage.aicc_fixlag_last_status` for reload of the overlay.
