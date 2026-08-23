/** AI Copy Cleaner - MAIN world clipboard API interception (Unconditionally Secure & Tamper-Resistant) */
(() => {
  'use strict';
  if (window.__aiCopyCleanerInjected) return;
  window.__aiCopyCleanerInjected = true;

  // Giữ tham chiếu cục bộ bất biến tới sanitizer hàm - không phụ thuộc vào window lookup
  const sanitize = typeof cleanAIHtml === 'function' ? cleanAIHtml : (typeof window !== 'undefined' ? window.cleanAIHtml : null);
  if (typeof sanitize !== 'function') return;

  function notifyCleaned() {
    try {
      window.postMessage({ type: 'aicc-cleaned-toast' }, '*');
    } catch (_) {}
  }

  const originalWrite = navigator.clipboard?.write;
  if (originalWrite) {
    navigator.clipboard.write = async function (items) {
      if (!Array.isArray(items)) {
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
            const types = {};
            for (const type of item.types) {
              types[type] = type === 'text/html' ? new Blob([cleaned], { type: 'text/html' }) : await item.getType(type);
            }
            output.push(new ClipboardItem(types));
            changed = changed || cleaned !== raw;
          } else {
            output.push(item);
          }
        }
        const res = await originalWrite.call(navigator.clipboard, output);
        notifyCleaned();
        return res;
      } catch (_) {
        return originalWrite.apply(navigator.clipboard, arguments);
      }
    };
  }

  const originalWriteText = navigator.clipboard?.writeText;
  if (originalWriteText) {
    navigator.clipboard.writeText = async function (text) {
      try {
        const res = await originalWriteText.apply(navigator.clipboard, arguments);
        notifyCleaned();
        return res;
      } catch (_) {
        return originalWriteText.apply(navigator.clipboard, arguments);
      }
    };
  }

  const originalSetData = window.DataTransfer?.prototype?.setData;
  if (originalSetData) {
    DataTransfer.prototype.setData = function (format, data) {
      if (format === 'text/html' && typeof data === 'string') {
        const cleaned = sanitize(data);
        notifyCleaned();
        return originalSetData.call(this, format, cleaned);
      }
      return originalSetData.call(this, format, data);
    };
  }
})();
