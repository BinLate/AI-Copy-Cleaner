/** AI Copy Cleaner - MAIN world clipboard API interception (One-Time Handshake & Safe Startup) */
(() => {
  'use strict';
  if (window.__aiCopyCleanerInjected) return;
  window.__aiCopyCleanerInjected = true;

  // Local immutable reference to sanitizer function
  const sanitize = typeof cleanAIHtml === 'function' ? cleanAIHtml : (typeof window !== 'undefined' ? window.cleanAIHtml : null);
  if (typeof sanitize !== 'function') return;

  // Safe default: pass-through until trusted extension storage state is pushed via paired bridge
  let enabledState = false;
  let secretKey = null;

  const addListener = window.addEventListener?.bind(window);
  if (addListener) {
    addListener('__aicc_pair_bridge__', (e) => {
      if (!secretKey && e.detail?.key) {
        secretKey = e.detail.key;
        if (typeof e.detail.enabled === 'boolean') {
          enabledState = e.detail.enabled;
        }
      }
    }, { once: true });

    addListener('__aicc_sync_bridge__', (e) => {
      if (secretKey && e.detail?.key === secretKey && typeof e.detail.enabled === 'boolean') {
        enabledState = e.detail.enabled;
      }
    });
  }

  const originalWrite = navigator.clipboard?.write;
  if (originalWrite) {
    navigator.clipboard.write = async function (items) {
      if (!Array.isArray(items) || !enabledState) {
        return originalWrite.apply(navigator.clipboard, arguments);
      }
      try {
        const output = [];
        for (const item of items) {
          if (item.types?.includes('text/html')) {
            const htmlBlob = await item.getType('text/html');
            const raw = await htmlBlob.text();
            const cleaned = sanitize(raw);
            const types = {};
            for (const type of item.types) {
              types[type] = type === 'text/html' ? new Blob([cleaned], { type: 'text/html' }) : await item.getType(type);
            }
            output.push(new ClipboardItem(types));
          } else {
            output.push(item);
          }
        }
        return originalWrite.call(navigator.clipboard, output);
      } catch (_) {
        return originalWrite.apply(navigator.clipboard, arguments);
      }
    };
  }

  const originalSetData = window.DataTransfer?.prototype?.setData;
  if (originalSetData) {
    DataTransfer.prototype.setData = function (format, data) {
      if (enabledState && format === 'text/html' && typeof data === 'string') {
        const cleaned = sanitize(data);
        return originalSetData.call(this, format, cleaned);
      }
      return originalSetData.call(this, format, data);
    };
  }
})();
