/** AI Copy Cleaner - MAIN world clipboard API interception (Tamper-Resistant) */
(() => {
  'use strict';
  if (window.__aiCopyCleanerInjected) return;
  window.__aiCopyCleanerInjected = true;

  // Giữ tham chiếu cục bộ bất biến tới sanitizer hàm không phụ thuộc vào window lookup
  const sanitize = typeof cleanAIHtml === 'function' ? cleanAIHtml : (typeof window !== 'undefined' ? window.cleanAIHtml : null);

  // Trạng thái bật/tắt được quản lý nội bộ trong closure, không phụ thuộc localStorage trang web
  let isCleanEnabled = true;
  window.addEventListener('aicc-clean-setting', (e) => {
    if (e && typeof e.detail === 'boolean') {
      isCleanEnabled = e.detail;
    }
  });

  const originalWrite = navigator.clipboard?.write;
  if (originalWrite && typeof sanitize === 'function') {
    navigator.clipboard.write = async function (items) {
      if (!isCleanEnabled || !Array.isArray(items)) {
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
        if (changed) window.dispatchEvent(new CustomEvent('ai-copy-cleaner-auto-cleaned'));
        return originalWrite.call(navigator.clipboard, output);
      } catch (_) {
        return originalWrite.apply(navigator.clipboard, arguments);
      }
    };
  }

  const originalSetData = window.DataTransfer?.prototype?.setData;
  if (originalSetData && typeof sanitize === 'function') {
    DataTransfer.prototype.setData = function (format, data) {
      if (isCleanEnabled && format === 'text/html' && typeof data === 'string') {
        const cleaned = sanitize(data);
        if (cleaned !== data) window.dispatchEvent(new CustomEvent('ai-copy-cleaner-auto-cleaned'));
        return originalSetData.call(this, format, cleaned);
      }
      return originalSetData.call(this, format, data);
    };
  }
})();
