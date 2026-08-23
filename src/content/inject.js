/** AI Copy Cleaner - MAIN world clipboard API interception (Unconditionally Secure & Tamper-Resistant) */
(() => {
  'use strict';
  if (window.__aiCopyCleanerInjected) return;
  window.__aiCopyCleanerInjected = true;

  // Giữ tham chiếu cục bộ bất biến tới sanitizer hàm - không phụ thuộc vào window lookup
  const sanitize = typeof cleanAIHtml === 'function' ? cleanAIHtml : (typeof window !== 'undefined' ? window.cleanAIHtml : null);
  if (typeof sanitize !== 'function') return;

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
        return originalWrite.call(navigator.clipboard, output);
      } catch (_) {
        return originalWrite.apply(navigator.clipboard, arguments);
      }
    };
  }

  const originalSetData = window.DataTransfer?.prototype?.setData;
  if (originalSetData) {
    DataTransfer.prototype.setData = function (format, data) {
      if (format === 'text/html' && typeof data === 'string') {
        const cleaned = sanitize(data);
        return originalSetData.call(this, format, cleaned);
      }
      return originalSetData.call(this, format, data);
    };
  }
})();
