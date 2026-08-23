/** AI Copy Cleaner - MAIN world clipboard API interception */
(() => {
  'use strict';
  if (window.__aiCopyCleanerInjected) return;
  window.__aiCopyCleanerInjected = true;

  const isEnabled = () => {
    try { return localStorage.getItem('aicc_clean_enabled') !== '0'; } catch (_) { return true; }
  };

  const originalWrite = navigator.clipboard?.write;
  if (originalWrite) {
    navigator.clipboard.write = async function (items) {
      if (!isEnabled() || !Array.isArray(items) || typeof cleanAIHtml !== 'function') {
        return originalWrite.apply(navigator.clipboard, arguments);
      }
      try {
        const output = [];
        let changed = false;
        for (const item of items) {
          if (item.types?.includes('text/html')) {
            const htmlBlob = await item.getType('text/html');
            const raw = await htmlBlob.text();
            const cleaned = cleanAIHtml(raw);
            const types = {};
            for (const type of item.types) {
              types[type] = type === 'text/html' ? new Blob([cleaned], { type: 'text/html' }) : await item.getType(type);
            }
            output.push(new ClipboardItem(types));
            changed = changed || cleaned !== raw;
          } else output.push(item);
        }
        if (changed) window.dispatchEvent(new CustomEvent('ai-copy-cleaner-auto-cleaned'));
        return originalWrite.call(navigator.clipboard, output);
      } catch (_) {
        return originalWrite.apply(navigator.clipboard, arguments);
      }
    };
  }

  const originalSetData = window.DataTransfer?.prototype?.setData;
  if (originalSetData) {
    DataTransfer.prototype.setData = function (format, data) {
      if (isEnabled() && format === 'text/html' && data && typeof cleanAIHtml === 'function') {
        const cleaned = cleanAIHtml(data);
        if (cleaned !== data) window.dispatchEvent(new CustomEvent('ai-copy-cleaner-auto-cleaned'));
        return originalSetData.call(this, format, cleaned);
      }
      return originalSetData.call(this, format, data);
    };
  }
})();
