/** AI Copy Cleaner - MAIN world clipboard API interception (Tamper-Resistant & Token-Authenticated) */
(() => {
  'use strict';
  if (window.__aiCopyCleanerInjected) return;
  window.__aiCopyCleanerInjected = true;

  // Local immutable reference to sanitizer function
  const sanitize = typeof cleanAIHtml === 'function' ? cleanAIHtml : (typeof window !== 'undefined' ? window.cleanAIHtml : null);
  if (typeof sanitize !== 'function') return;

  function isEnabled() {
    return document.documentElement?.dataset?.aiccCleanEnabled !== 'false';
  }

  function notifyCleaned() {
    try {
      const token = document.documentElement?.dataset?.aiccBridgeToken;
      if (token) {
        window.dispatchEvent(new CustomEvent('aicc-bridge-notify', { detail: { token } }));
      }
    } catch (_) {}
  }

  const originalWrite = navigator.clipboard?.write;
  if (originalWrite) {
    navigator.clipboard.write = async function (items) {
      if (!Array.isArray(items) || !isEnabled()) {
        return originalWrite.apply(navigator.clipboard, arguments);
      }
      try {
        const output = [];
        let changed = false;
        for (const item of items) {
          if (item.types?.includes('text/html')) {
            const htmlBlob = await item.getType('text/html');
            const raw = await htmlBlob.text();
            const cleaned = sanitize(raw);
            const isItemChanged = cleaned !== raw;
            changed = changed || isItemChanged;
            const types = {};
            for (const type of item.types) {
              types[type] = type === 'text/html' ? new Blob([cleaned], { type: 'text/html' }) : await item.getType(type);
            }
            output.push(new ClipboardItem(types));
          } else {
            output.push(item);
          }
        }
        const res = await originalWrite.call(navigator.clipboard, output);
        if (changed) {
          notifyCleaned();
        }
        return res;
      } catch (_) {
        return originalWrite.apply(navigator.clipboard, arguments);
      }
    };
  }

  const originalSetData = window.DataTransfer?.prototype?.setData;
  if (originalSetData) {
    DataTransfer.prototype.setData = function (format, data) {
      if (isEnabled() && format === 'text/html' && typeof data === 'string') {
        const cleaned = sanitize(data);
        if (cleaned !== data) {
          notifyCleaned();
        }
        return originalSetData.call(this, format, cleaned);
      }
      return originalSetData.call(this, format, data);
    };
  }
})();
